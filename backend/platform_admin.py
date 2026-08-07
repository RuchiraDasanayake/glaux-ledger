"""Manage platform administrators. Run from backend/ with the production .env.

    python platform_admin.py create admin@example.com --role admin
    python platform_admin.py list
    python platform_admin.py role admin@example.com reviewer
    python platform_admin.py disable admin@example.com
    python platform_admin.py reset admin@example.com
"""

import argparse
import getpass
import sys
from datetime import UTC, datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import PlatformRole, PlatformUser

engine = create_engine(settings.privileged_url)


def _password(args: argparse.Namespace) -> str:
    value = args.password or getpass.getpass("New password: ")
    if len(value) < 12 or len(value) > 128:
        raise SystemExit("Password must be between 12 and 128 characters.")
    return value


def _user(session: Session, email: str) -> PlatformUser:
    user = session.scalar(select(PlatformUser).where(PlatformUser.email == email.lower()))
    if user is None:
        raise SystemExit(f"No platform user exists for {email}.")
    return user


def cmd_create(session: Session, args: argparse.Namespace) -> int:
    email = args.email.lower()
    if session.scalar(select(PlatformUser).where(PlatformUser.email == email)):
        raise SystemExit(f"A platform user already exists for {email}.")
    session.add(
        PlatformUser(
            email=email,
            role=args.role,
            hashed_password=hash_password(_password(args)),
        )
    )
    session.commit()
    print(f"Created {email} as {args.role}.")
    return 0


def cmd_list(session: Session, _args: argparse.Namespace) -> int:
    users = session.scalars(select(PlatformUser).order_by(PlatformUser.email)).all()
    for user in users:
        state = "disabled" if user.disabled_at else "enabled"
        print(f"{user.email:<40} {user.role:<10} {state}")
    print(f"{len(users)} platform user(s).")
    return 0


def cmd_role(session: Session, args: argparse.Namespace) -> int:
    user = _user(session, args.email)
    user.role = args.role
    session.commit()
    print(f"{user.email} is now {user.role}.")
    return 0


def cmd_disable(session: Session, args: argparse.Namespace) -> int:
    user = _user(session, args.email)
    user.disabled_at = datetime.now(UTC)
    session.commit()
    print(f"Disabled {user.email}.")
    return 0


def cmd_reset(session: Session, args: argparse.Namespace) -> int:
    user = _user(session, args.email)
    user.hashed_password = hash_password(_password(args))
    session.commit()
    print(f"Reset password for {user.email}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create")
    create.add_argument("email")
    create.add_argument("--role", choices=list(PlatformRole), default=PlatformRole.reviewer)
    create.add_argument("--password", help="Prefer the interactive prompt in real use.")

    sub.add_parser("list")

    role = sub.add_parser("role")
    role.add_argument("email")
    role.add_argument("role", choices=list(PlatformRole))

    disable = sub.add_parser("disable")
    disable.add_argument("email")

    reset = sub.add_parser("reset")
    reset.add_argument("email")
    reset.add_argument("--password", help="Prefer the interactive prompt in real use.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {
        "create": cmd_create,
        "list": cmd_list,
        "role": cmd_role,
        "disable": cmd_disable,
        "reset": cmd_reset,
    }
    with Session(engine) as session:
        return handlers[args.command](session, args)


if __name__ == "__main__":
    sys.exit(main())
