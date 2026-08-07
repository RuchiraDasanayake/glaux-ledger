"""Take, check and restore backups of the ledger database.

These are other people's financial records, several years of them, and in many cases the
only copy. A managed host's automated snapshots are a fine first line and a poor only
line: they live in the same account as the thing they are protecting, so one billing
lapse or one wrong click loses both. This writes a file you can put somewhere else.

    python backup.py dump                        # into ./backups, pruning to 14
    python backup.py dump --to /mnt/usb --keep 30
    python backup.py list
    python backup.py check backups/glaux-2026-08-03-0215.dump
    python backup.py restore backups/glaux-....dump --into postgresql://... --yes

Every dump is checked the moment it is written, because a backup nobody has read is a
guess. `check` re-runs that on demand, and `restore` is the rehearsal you should have
done before you needed it.

Needs `pg_dump` and `pg_restore` on PATH, from the same major version as the server.
Run it from backend/ with the same .env the API uses.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from app.core.config import settings

DEFAULT_DIR = Path("backups")
DEFAULT_KEEP = 14
SUFFIX = ".dump"

# A dump missing any of these is not a backup of this application, whatever else it
# contains. Checked by name against pg_restore's table of contents rather than by size:
# an empty-but-valid archive of the wrong database is exactly the failure that goes
# unnoticed for a year.
REQUIRED_TABLES = (
    "businesses",
    "categories",
    "payment_submissions",
    "platform_users",
    "transactions",
    "recurring_bills",
)


def libpq_url(sqlalchemy_url: str) -> str:
    """`postgresql+psycopg://...` is SQLAlchemy's spelling. pg_dump wants plain."""
    parts = urlsplit(sqlalchemy_url)
    return urlunsplit(parts._replace(scheme=parts.scheme.split("+", 1)[0]))


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as missing:
        # Windows leaves filename unset on the exception, so it is taken from the command.
        raise SystemExit(
            f"{command[0]} is not on PATH. Install the Postgres client tools "
            "(postgresql-client on Debian, `brew install libpq` on macOS, or the "
            "command-line tools from the EnterpriseDB installer on Windows)."
        ) from missing


def _toc(path: Path) -> list[str]:
    """The archive's table of contents, or an explanation of why there isn't one."""
    result = _run(["pg_restore", "--list", str(path)])
    if result.returncode != 0:
        raise SystemExit(f"{path} is not a readable archive:\n{result.stderr.strip()}")
    return result.stdout.splitlines()


def _table_names(toc: list[str]) -> set[str]:
    """Every table with data in the archive.

    A TABLE DATA entry reads `123; 0 16400 TABLE DATA public transactions glaux_owner`,
    and the trailing owner is absent on some dumps, so the name is taken by position
    after the marker rather than by counting back from the end of the line.
    """
    names = set()
    for line in toc:
        _, marker, rest = line.partition(" TABLE DATA ")
        if not marker:
            continue
        fields = rest.split()
        if len(fields) >= 2:
            names.add(fields[1])
    return names


def _check(path: Path) -> list[str]:
    """Tables named in the archive. Raises if any of the required ones are absent."""
    found = _table_names(_toc(path))
    missing = [table for table in REQUIRED_TABLES if table not in found]
    if missing:
        raise SystemExit(
            f"{path} is readable but does not contain {', '.join(missing)}. "
            "That is the wrong database, or a dump that failed part way."
        )
    return sorted(found)


def _dumps_in(directory: Path) -> list[Path]:
    return sorted(directory.glob(f"glaux-*{SUFFIX}"))


def _megabytes(path: Path) -> str:
    return f"{path.stat().st_size / 1_048_576:.1f} MB"


def cmd_dump(args: argparse.Namespace) -> int:
    directory = Path(args.to)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%d-%H%M")
    path = directory / f"glaux-{stamp}{SUFFIX}"

    print(f"dumping to {path}")
    result = _run(
        [
            "pg_dump",
            libpq_url(settings.alembic_url),
            "--format=custom",
            # Restorable into a database owned by a different role, which is what a
            # restore onto a fresh host always is.
            "--no-owner",
            "--no-privileges",
            f"--file={path}",
        ]
    )
    if result.returncode != 0:
        path.unlink(missing_ok=True)
        raise SystemExit(f"pg_dump failed:\n{result.stderr.strip()}")

    tables = _check(path)
    print(
        f"  {_megabytes(path)}, {len(tables)} tables, all of {', '.join(REQUIRED_TABLES)} present"
    )

    # Never the file just written, whatever the sort says. Names carry their timestamp so
    # they normally sort chronologically, but a clock that has been corrected backwards or
    # a dump copied in from elsewhere is enough to put today's at the front of the list --
    # and deleting the backup you came here to take is the worst thing this could do.
    others = [dump for dump in _dumps_in(directory) if dump != path]
    surplus = len(others) - (args.keep - 1)
    pruned = others[:surplus] if args.keep > 0 and surplus > 0 else []
    for old in pruned:
        old.unlink()
    if pruned:
        print(f"  pruned {len(pruned)}, keeping the newest {args.keep}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    dumps = _dumps_in(Path(args.to))
    if not dumps:
        print(f"No dumps in {args.to}. Take one with: python backup.py dump")
        return 0
    for path in dumps:
        age = datetime.now(UTC) - datetime.fromtimestamp(path.stat().st_mtime, UTC)
        print(f"  {path.name:<32}  {_megabytes(path):>9}  {age.days}d old")
    print(f"\n{len(dumps)} dump(s) in {args.to}.")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"{path} does not exist.")
    tables = _check(path)
    print(f"{path}: readable, {len(tables)} tables")
    for table in tables:
        print(f"  {table}")
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    """Into a database you name explicitly. Never into the configured one by default.

    Restoring is the one operation here that destroys data, and the database most likely
    to be typed by accident is the live one. So the target is a required argument with no
    fallback, and it still asks.
    """
    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"{path} does not exist.")
    _check(path)

    target = libpq_url(args.into)
    if not args.yes:
        print(f"About to drop and recreate every object in:\n  {_redact(target)}")
        print(f"from {path} ({_megabytes(path)}).")
        if input("Type the word restore to continue: ").strip() != "restore":
            print("Nothing done.")
            return 1

    result = _run(
        [
            "pg_restore",
            f"--dbname={target}",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            str(path),
        ]
    )
    # pg_restore exits non-zero for warnings that are routine on a --clean run into an
    # empty database ("table does not exist, skipping"), so the output is shown and the
    # decision left to the operator rather than dressed up as a clean success.
    if result.stderr.strip():
        print(result.stderr.strip())
    print(f"\npg_restore exited {result.returncode}.")
    print("Now point a checkout at it and run: python -m alembic current")
    return 0


def _redact(url: str) -> str:
    parts = urlsplit(url)
    if not parts.password:
        return url
    host = f"{parts.username}:***@{parts.hostname}"
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit(parts._replace(netloc=host))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    dump = sub.add_parser("dump", help="take a backup now and verify it")
    dump.add_argument("--to", default=os.environ.get("BACKUP_DIR", str(DEFAULT_DIR)))
    dump.add_argument(
        "--keep", type=int, default=DEFAULT_KEEP, help="how many to retain; 0 keeps all"
    )

    listing = sub.add_parser("list", help="what is in the backup directory")
    listing.add_argument("--to", default=os.environ.get("BACKUP_DIR", str(DEFAULT_DIR)))

    check = sub.add_parser("check", help="re-verify an existing dump")
    check.add_argument("file")

    restore = sub.add_parser("restore", help="restore a dump into a database you name")
    restore.add_argument("file")
    restore.add_argument("--into", required=True, help="target database URL")
    restore.add_argument("--yes", action="store_true", help="skip the confirmation")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handler = {
        "dump": cmd_dump,
        "list": cmd_list,
        "check": cmd_check,
        "restore": cmd_restore,
    }[args.command]
    return handler(args)


if __name__ == "__main__":
    sys.exit(main())
