"""The backup tool's judgement, without shelling out to Postgres.

What is worth testing here is not that pg_dump works, since it does, but the three places
this script could quietly lie: calling a dump good when it is a dump of something else,
printing a password into a terminal or a log, and pruning the wrong files. Each of those
fails silently and is discovered on the day the backup is needed.
"""

import subprocess
from pathlib import Path

import pytest

import backup

# Real output, from `pg_restore --list` on a dump of this schema.
TOC = """;
; Archive created at 2026-08-03 06:41:04 UTC
;     dbname: glaux_ledger
;
216; 1259 16397 TABLE public businesses glaux
3533; 0 16397 TABLE DATA public businesses glaux
3534; 0 16410 TABLE DATA public categories glaux
3537; 0 88911 TABLE DATA public recurring_bills glaux
3536; 0 16444 TABLE DATA public transactions glaux
3535; 0 16427 TABLE DATA public users glaux
3538; 0 88920 TABLE DATA public payment_submissions glaux
3539; 0 88930 TABLE DATA public platform_users glaux
3532; 0 16392 TABLE DATA public alembic_version glaux
""".splitlines()

# The same archive dumped by a version that records no owner, which is the shape that
# broke an earlier reading of these lines: counting back from the end found "public".
TOC_WITHOUT_OWNERS = [line.removesuffix(" glaux") for line in TOC if " TABLE DATA " in line]


def _stub_toc(monkeypatch: pytest.MonkeyPatch, lines: list[str]) -> None:
    monkeypatch.setattr(backup, "_toc", lambda _: lines)


class TestReadingAnArchive:
    def test_finds_every_table_that_carries_data(self) -> None:
        assert backup._table_names(TOC) >= {
            "businesses",
            "categories",
            "transactions",
            "recurring_bills",
            "users",
            "payment_submissions",
            "platform_users",
        }

    def test_ignores_the_schema_entries_that_carry_none(self) -> None:
        """`216; ... TABLE public businesses` is the definition, not the rows.

        Counting it would let an archive built with --schema-only pass as a backup of
        the records, which is the one thing it definitely is not.
        """
        definitions_only = [line for line in TOC if " TABLE DATA " not in line]
        assert backup._table_names(definitions_only) == set()

    def test_reads_a_dump_that_records_no_owner(self) -> None:
        assert "transactions" in backup._table_names(TOC_WITHOUT_OWNERS)

    def test_accepts_an_archive_holding_the_ledger(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_toc(monkeypatch, TOC)
        assert "transactions" in backup._check(Path("anywhere.dump"))

    def test_refuses_an_archive_missing_a_required_table(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_toc(monkeypatch, [line for line in TOC if "transactions" not in line])
        with pytest.raises(SystemExit, match="transactions"):
            backup._check(Path("wrong.dump"))


class TestTheConnectionString:
    def test_drops_the_sqlalchemy_driver_suffix(self) -> None:
        """pg_dump has never heard of psycopg and will not parse the scheme."""
        assert (
            backup.libpq_url("postgresql+psycopg://u:p@host:5432/db")
            == "postgresql://u:p@host:5432/db"
        )

    def test_leaves_a_plain_url_alone(self) -> None:
        assert backup.libpq_url("postgresql://u@host/db") == "postgresql://u@host/db"

    def test_hides_the_password_before_anything_is_printed(self) -> None:
        hidden = backup._redact("postgresql://glaux:s3cret@db.example.com:5432/ledger")
        assert "s3cret" not in hidden
        assert "glaux" in hidden and "db.example.com:5432" in hidden

    def test_leaves_a_url_without_one_readable(self) -> None:
        assert backup._redact("postgresql://db/ledger") == "postgresql://db/ledger"


class TestTakingOne:
    @pytest.fixture(autouse=True)
    def _no_postgres(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """pg_dump replaced by a stub that writes a file, so the test needs no server."""

        def fake_run(command: list[str]) -> subprocess.CompletedProcess[str]:
            for argument in command:
                if argument.startswith("--file="):
                    Path(argument.removeprefix("--file=")).write_bytes(b"x" * 2048)
            return subprocess.CompletedProcess(command, 0, "", "")

        monkeypatch.setattr(backup, "_run", fake_run)
        monkeypatch.setattr(backup, "_toc", lambda _: TOC)

    def test_writes_a_dated_dump(self, tmp_path: Path) -> None:
        backup.main(["dump", "--to", str(tmp_path)])
        written = list(tmp_path.glob("glaux-*.dump"))
        assert len(written) == 1

    def test_keeps_only_the_newest_few(self, tmp_path: Path) -> None:
        for day in range(1, 6):
            (tmp_path / f"glaux-2020-01-0{day}-0000.dump").write_bytes(b"old")
        backup.main(["dump", "--to", str(tmp_path), "--keep", "3"])

        kept = sorted(path.name for path in tmp_path.glob("glaux-*.dump"))
        assert kept == [
            "glaux-2020-01-04-0000.dump",
            "glaux-2020-01-05-0000.dump",
            kept[-1],
        ]

    def test_never_prunes_the_dump_it_just_took(self, tmp_path: Path) -> None:
        """The names sort chronologically until a clock is corrected backwards or a dump
        is copied in from another machine, and then today's can sort first. Pruning by
        position would delete the one file the operator is standing there waiting for."""
        for day in range(1, 4):
            (tmp_path / f"glaux-2099-01-0{day}-0000.dump").write_bytes(b"from the future")
        backup.main(["dump", "--to", str(tmp_path), "--keep", "2"])

        kept = sorted(path.name for path in tmp_path.glob("glaux-*.dump"))
        assert len(kept) == 2
        assert not kept[0].startswith("glaux-2099")

    def test_a_retention_of_one_leaves_only_the_new_one(self, tmp_path: Path) -> None:
        for day in range(1, 4):
            (tmp_path / f"glaux-2020-01-0{day}-0000.dump").write_bytes(b"old")
        backup.main(["dump", "--to", str(tmp_path), "--keep", "1"])

        kept = list(tmp_path.glob("glaux-*.dump"))
        assert len(kept) == 1
        assert not kept[0].name.startswith("glaux-2020")

    def test_keeps_everything_when_asked_to(self, tmp_path: Path) -> None:
        for day in range(1, 4):
            (tmp_path / f"glaux-2026-08-0{day}-0000.dump").write_bytes(b"old")
        backup.main(["dump", "--to", str(tmp_path), "--keep", "0"])
        assert len(list(tmp_path.glob("glaux-*.dump"))) == 4

    def test_leaves_nothing_behind_when_the_dump_is_unusable(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A half-written file in the backup directory is worse than no file at all: it
        is what the next `list` reports as this morning's backup."""
        monkeypatch.setattr(
            backup,
            "_run",
            lambda command: subprocess.CompletedProcess(command, 1, "", "server closed"),
        )
        with pytest.raises(SystemExit, match="pg_dump failed"):
            backup.main(["dump", "--to", str(tmp_path)])
        assert list(tmp_path.glob("glaux-*.dump")) == []


def test_a_missing_pg_dump_says_which_command_and_how_to_get_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """FileNotFoundError leaves filename unset on Windows, so the name comes from the
    command rather than the exception, which is how this once read 'None is not on
    PATH'."""

    def explode(*_args: object, **_kwargs: object) -> None:
        raise FileNotFoundError(2, "not found")

    monkeypatch.setattr(subprocess, "run", explode)
    with pytest.raises(SystemExit, match="pg_dump is not on PATH"):
        backup._run(["pg_dump", "--version"])
