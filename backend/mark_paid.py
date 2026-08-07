"""Emergency/manual payment operations and subscription reporting.

Normal bank-transfer evidence is reviewed in the RBAC-protected admin UI. This CLI stays
as an owner-role recovery path for support corrections and incidents; it never charges
anyone and does not alter payment-submission review state.

    python mark_paid.py list
    python mark_paid.py lapsing --days 7
    python mark_paid.py pay ashan@example.com --months 1
    python mark_paid.py pay "Alpha Stationers" --until 2026-12-31

Run it from backend/ with the same .env the API uses.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date

from sqlalchemy import Text, create_engine, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Business, SubscriptionStatus
from app.services.billing import add_months as add_months
from app.services.billing import extend_paid_through

# Connects as the migration role rather than the app role: this is an operator action on
# the businesses table, not application traffic, and it should not depend on whatever
# grants the runtime role happens to hold.
engine = create_engine(settings.alembic_url)

STATUS_LABEL = {
    SubscriptionStatus.trialing: "trial",
    SubscriptionStatus.active: "paid",
    SubscriptionStatus.lapsed: "LAPSED",
}


def _expiry(business: Business) -> date:
    """The day this shop stops being able to write, whichever clock is running."""
    if business.paid_through is not None and business.paid_through >= business.local_today:
        return business.paid_through
    return business.trial_ends_at.date()


def _describe(business: Business) -> str:
    expiry = _expiry(business)
    days = (expiry - business.local_today).days
    return (
        f"  {business.name[:28]:<28}  {business.owner_email[:30]:<30}  "
        f"{STATUS_LABEL[business.status]:<7}  {expiry} ({days:+d}d)"
    )


def _all_businesses(session: Session) -> list[Business]:
    return list(session.scalars(select(Business).order_by(Business.name)))


def cmd_list(session: Session, _: argparse.Namespace) -> int:
    businesses = _all_businesses(session)
    if not businesses:
        print("No shops registered yet.")
        return 0

    print(f"  {'SHOP':<28}  {'OWNER':<30}  {'STATE':<7}  EXPIRES")
    for business in businesses:
        print(_describe(business))
    print(f"\n{len(businesses)} shop(s).")
    return 0


def cmd_lapsing(session: Session, args: argparse.Namespace) -> int:
    """Who to chase. Includes the already-lapsed, who are the ones actually blocked."""
    at_risk = [
        b for b in _all_businesses(session) if (_expiry(b) - b.local_today).days <= args.days
    ]
    if not at_risk:
        print(f"Nobody expires in the next {args.days} days.")
        return 0

    print(f"Expiring within {args.days} days:\n")
    print(f"  {'SHOP':<28}  {'OWNER':<30}  {'STATE':<7}  EXPIRES")
    for business in sorted(at_risk, key=_expiry):
        print(_describe(business))
    return 0


def _resolve(session: Session, needle: str) -> Business:
    """Find one shop by email, id, or part of its name. Refuses to guess."""
    matches = list(
        session.scalars(
            select(Business).where(
                or_(
                    Business.owner_email.ilike(needle),
                    Business.name.ilike(f"%{needle}%"),
                    Business.id.cast(Text).ilike(f"{needle}%"),
                )
            )
        )
    )
    if not matches:
        raise SystemExit(f"No shop matches {needle!r}. Try: python mark_paid.py list")
    if len(matches) > 1:
        names = "\n  ".join(f"{b.name} <{b.owner_email}>" for b in matches)
        raise SystemExit(f"{needle!r} matches more than one shop:\n  {names}")
    return matches[0]


def cmd_pay(session: Session, args: argparse.Namespace) -> int:
    business = _resolve(session, args.shop)
    before = business.paid_through

    if args.until:
        new_paid_through = date.fromisoformat(args.until)
    else:
        new_paid_through = extend_paid_through(business, args.months)

    if new_paid_through < business.local_today:
        raise SystemExit(f"{new_paid_through} is in the past, which would lapse them at once.")

    business.paid_through = new_paid_through
    session.commit()
    session.refresh(business)

    print(f"{business.name} <{business.owner_email}>")
    print(f"  paid_through  {before or 'never'}  ->  {business.paid_through}")
    print(f"  status        {STATUS_LABEL[business.status]}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="every shop and when it expires")

    lapsing = sub.add_parser("lapsing", help="who to chase this week")
    lapsing.add_argument("--days", type=int, default=7)

    pay = sub.add_parser("pay", help="extend a shop's paid_through")
    pay.add_argument("shop", help="owner email, shop name, or id prefix")
    pay.add_argument("--months", type=int, default=1)
    pay.add_argument("--until", help="explicit YYYY-MM-DD, instead of --months")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handler = {"list": cmd_list, "lapsing": cmd_lapsing, "pay": cmd_pay}[args.command]
    with Session(engine) as session:
        return handler(session, args)


if __name__ == "__main__":
    sys.exit(main())
