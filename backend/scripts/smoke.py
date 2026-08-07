"""End-to-end smoke test against a running API.

The unit tests drive the app through `TestClient`, in-process, against a transactional
database that is rolled back afterwards. That proves the code is right and proves nothing
about a deployment: not that migrations ran, not that the database is reachable with the
credentials the container was given, not that CORS lets the frontend speak to it, not that
the reverse proxy passes the Authorization header through.

This drives the same paths over real HTTP, as a new shop would, and is the thing to run
against production the moment it is first deployed and after every release since.

    python scripts/smoke.py                         # the local stack
    python scripts/smoke.py https://api.example.com # a deployment

It registers a real shop and leaves it there. Against production that is two rows to
delete afterwards, and it is worth them: a smoke test that avoids writing is a smoke test
that never exercises the write path everything else depends on.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta
from typing import Any, NamedTuple

import httpx

PASSWORD = "a-sufficiently-long-password"
TIMEOUT = 30.0

# Deliberately not the defaults. Registration used to send neither, so a shop outside Sri
# Lanka silently got rupees and Colombo's midnight, and neither is editable afterwards.
# Choosing both here is what proves the fields survive the round trip.
CURRENCY = "GBP"
TIMEZONE = "Europe/London"

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok    {name}")
        return
    failures.append(name)
    print(f"  FAIL  {name}{f' :: {detail}' if detail else ''}")


class Shop(NamedTuple):
    email: str
    token: str


def register(client: httpx.Client, name: str) -> Shop:
    """A fresh shop, and the token to act as it."""
    email = f"smoke-{uuid.uuid4().hex[:12]}@example.com"
    response = client.post(
        "/auth/register",
        json={
            "business_name": name,
            "email": email,
            "password": PASSWORD,
            "currency": CURRENCY,
            "timezone": TIMEZONE,
        },
    )
    if response.status_code == 429:
        raise SystemExit(
            "  register is rate limited on this address. The counters are in-process, so a "
            "restart of the API clears them; otherwise wait for the window to pass."
        )
    response.raise_for_status()
    return Shop(email, str(response.json()["access_token"]))


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def run(base: str) -> None:
    print(f"\nsmoke: {base}\n")

    with httpx.Client(base_url=base, timeout=TIMEOUT) as client:
        health = client.get("/health")
        check("health responds", health.status_code == 200, str(health.status_code))
        check(
            "health can reach the database",
            health.json().get("database") == "ok",
            health.text,
        )
        # Everything below writes and reads through the database. Without it they would
        # all fail one after another and bury the one fact that explains them.
        if failures:
            raise SystemExit("\nthe database is not reachable; nothing else was run")

        print("\n a new shop")
        shop = register(client, "Smoke Test Stationers")
        token = shop.token
        check("registration returns a token", bool(token))

        me = client.get("/auth/me", headers=auth(token))
        check("the session restores", me.status_code == 200, str(me.status_code))
        business: dict[str, Any] = me.json()["business"]
        check(
            "the chosen currency was kept",
            business["currency"] == CURRENCY,
            f"asked {CURRENCY}, got {business['currency']}",
        )
        check(
            "the chosen timezone was kept",
            business["timezone"] == TIMEZONE,
            f"asked {TIMEZONE}, got {business['timezone']}",
        )
        check(
            "a new shop starts on trial",
            business["status"] == "trialing" and business["trial_days_left"] > 0,
            f"{business['status']}, {business['trial_days_left']} days",
        )

        print("\n a day's trading")
        categories = client.get("/categories", headers=auth(token)).json()
        check("the starter categories were seeded", len(categories) > 0, str(len(categories)))
        income = next(c for c in categories if c["type"] == "income")
        expense = next(c for c in categories if c["type"] == "expense")

        sale = client.post(
            "/transactions",
            headers=auth(token),
            json={"category_id": income["id"], "amount": "3450.00", "note": "Files, pens"},
        )
        check("a sale records", sale.status_code == 201, sale.text[:200])
        check(
            "its direction comes from its category",
            sale.status_code == 201 and sale.json()["entry_type"] == "income",
        )

        cost = client.post(
            "/transactions",
            headers=auth(token),
            json={"category_id": expense["id"], "amount": "620.00", "note": "Water bill"},
        )
        check("a cost records", cost.status_code == 201, cost.text[:200])

        credit = client.post(
            "/transactions",
            headers=auth(token),
            json={
                "category_id": expense["id"],
                "amount": "9780.00",
                "counterparty": "Ceylon Paper Co",
                "due_date": str(date.today() + timedelta(days=14)),
                "settled": False,
            },
        )
        check("a purchase on account records", credit.status_code == 201, credit.text[:200])
        check(
            "and is left unsettled",
            credit.status_code == 201 and credit.json()["settled"] is False,
        )

        print("\n what the shop sees")
        summary = client.get(
            "/transactions/summary", headers=auth(token), params={"period": "day"}
        ).json()
        check("takings total correctly", summary["income"] == "3450.00", summary["income"])
        check("costs total correctly", summary["expense"] == "10400.00", summary["expense"])
        check("the net is the difference", summary["net"] == "-6950.00", summary["net"])
        check(
            "the unpaid bill is still owed to the supplier",
            summary["outstanding_payable"] == "9780.00",
            summary["outstanding_payable"],
        )
        check(
            "the summary reports the shop's own currency",
            summary["currency"] == CURRENCY,
            summary["currency"],
        )

        daily = client.get(
            "/transactions/daily",
            headers=auth(token),
            params={"from_date": str(date.today()), "to_date": str(date.today())},
        )
        check("the daily series builds", daily.status_code == 200, str(daily.status_code))

        print("\n the report it hands over")
        pdf = client.get(
            "/reports/export",
            headers=auth(token),
            params={
                "from_date": str(date.today() - timedelta(days=7)),
                "to_date": str(date.today()),
            },
        )
        check("the report generates", pdf.status_code == 200, str(pdf.status_code))
        check("it is a PDF", pdf.content.startswith(b"%PDF-"), pdf.content[:16].hex())
        # Calibrated, not guessed. The report embeds no fonts, so it is small: a period
        # with nothing in it at all comes to ~2.6kB, and the sample month in
        # preview_report.py to ~4.4kB. Anything at or below the empty figure means the
        # page built and the trading did not reach it.
        check("with the trading in it", len(pdf.content) > 3_000, f"{len(pdf.content)} bytes")
        check(
            "offered as a download, named for the shop",
            "smoke-test-stationers" in pdf.headers.get("content-disposition", ""),
            pdf.headers.get("content-disposition", ""),
        )

        print("\n coming back tomorrow")
        # The path every shop uses daily, and the one registration never exercises.
        again = client.post("/auth/login", json={"email": shop.email, "password": PASSWORD})
        check("the shop can sign back in", again.status_code == 200, again.text[:200])
        check(
            "and the token works",
            again.status_code == 200
            and client.get("/auth/me", headers=auth(again.json()["access_token"])).status_code
            == 200,
        )
        wrong = client.post("/auth/login", json={"email": shop.email, "password": "not-it"})
        check("a wrong password is refused", wrong.status_code == 401, str(wrong.status_code))
        check(
            "without saying which half was wrong",
            wrong.status_code == 401 and wrong.json()["detail"] == "Incorrect email or password",
            wrong.text[:200],
        )

        print("\n what one shop must not see of another")
        other = register(client, "Second Smoke Shop").token
        theirs = client.get("/transactions", headers=auth(other)).json()
        check(
            "a new shop's ledger is its own and empty",
            theirs["total"] == 0,
            f"saw {theirs['total']} entries belonging to someone else",
        )
        their_categories = client.get("/categories", headers=auth(other)).json()
        check(
            "and its categories are its own rows",
            {c["id"] for c in their_categories}.isdisjoint({c["id"] for c in categories}),
        )
        stolen = client.get(
            "/transactions", headers=auth(other), params={"search": "Files, pens"}
        ).json()
        check("and cannot search into them", stolen["total"] == 0, str(stolen["total"]))

        print("\n the door")
        check(
            "no token is refused",
            client.get("/transactions").status_code == 401,
        )
        check(
            "a forged token is refused",
            client.get("/transactions", headers=auth("not-a-real-token")).status_code == 401,
        )


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
    try:
        run(base)
    except httpx.ConnectError:
        print(f"\ncannot reach {base}. Is it running?")
        return 2

    if failures:
        print(f"\n{len(failures)} failed: {', '.join(failures)}")
        return 1
    print("\nall good")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
