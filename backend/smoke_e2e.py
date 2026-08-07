"""End-to-end check against a running server. Not part of the pytest suite.

Walks the whole path a shopkeeper takes: register, record by hand, record by voice and
photo, read the dashboard, filter history, export the PDF, then re-checks isolation
against a live server rather than the TestClient.

    python smoke_e2e.py
"""

import io
import sys
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

BASE = "http://localhost:8000"
PASSWORD = "a-sufficiently-long-password"

passed = 0
failed: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  ok    {label}")
    else:
        failed.append(label)
        print(f"  FAIL  {label} {detail}")


def register(client: httpx.Client, name: str) -> tuple[dict[str, str], dict]:
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    response = client.post(
        "/auth/register",
        json={"business_name": name, "email": email, "password": PASSWORD},
    )
    response.raise_for_status()
    body = response.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=30.0)

    print("\nhealth")
    check("responds ok", client.get("/health").json() == {"status": "ok"})

    print("\nregistration")
    headers, body = register(client, "Nimals Stationery")
    business = body["business"]
    check("returns a token", bool(body["access_token"]))
    check("currency defaults to LKR", business["currency"] == "LKR")
    check("timezone defaults to Colombo", business["timezone"] == "Asia/Colombo")

    categories = client.get("/categories", headers=headers).json()
    names = {c["name"] for c in categories}
    check("seeds shop-specific income ones", {"Printing", "Scanning"} <= names, str(names))
    check(
        "seeds real expense categories",
        {"Stock & Supplies", "Utilities", "Rent", "Wages"} <= names,
        str(names),
    )

    print("\nsession restore")
    me = client.get("/auth/me", headers=headers).json()
    check("/auth/me returns the business", me["business"]["id"] == business["id"])
    check("rejects a missing token", client.get("/auth/me").status_code == 401)
    check(
        "rejects a forged token",
        client.get("/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401,
    )

    print("\nmanual entry")
    printing = next(c for c in categories if c["name"] == "Printing")
    expense = next(c for c in categories if c["name"] == "Stock & Supplies")
    created = client.post(
        "/transactions",
        headers=headers,
        json={"category_id": printing["id"], "amount": "450.00", "note": "20 pages colour"},
    )
    check("creates a sale", created.status_code == 201, created.text)
    check("derives entry_type from category", created.json()["entry_type"] == "income")
    check("nests the category", created.json()["category"]["name"] == "Printing")

    client.post(
        "/transactions",
        headers=headers,
        json={"category_id": expense["id"], "amount": "1200.00", "note": "A4 paper"},
    )

    bad_amount = client.post(
        "/transactions",
        headers=headers,
        json={"category_id": printing["id"], "amount": "-5"},
    )
    check("rejects a negative amount", bad_amount.status_code == 422)

    print("\nvoice draft")
    voice = client.post(
        "/transactions/from-voice",
        headers=headers,
        files={"file": ("clip.webm", b"\x1a\x45\xdf\xa3" + b"0" * 512, "audio/webm")},
    )
    check("returns a draft", voice.status_code == 200, voice.text)
    if voice.status_code == 200:
        draft = voice.json()
        check("draft has an amount", draft["amount"]["value"] is not None, str(draft))
        check("draft is tagged voice", draft["source"] == "voice")
        check("draft carries raw text", bool(draft["raw_text"]))
        check("draft flags uncertainty", isinstance(draft["uncertain"], list))

    print("\nphoto draft")
    photo = client.post(
        "/transactions/from-photo",
        headers=headers,
        files={"file": ("receipt.jpg", b"\xff\xd8\xff" + b"0" * 512, "image/jpeg")},
    )
    check("returns a draft", photo.status_code == 200, photo.text)
    if photo.status_code == 200:
        check("draft is tagged photo", photo.json()["source"] == "photo")

    oversize = client.post(
        "/transactions/from-photo",
        headers=headers,
        files={"file": ("big.jpg", b"0" * (11 * 1024 * 1024), "image/jpeg")},
    )
    check("rejects an oversized upload", oversize.status_code == 413, str(oversize.status_code))

    wrong_type = client.post(
        "/transactions/from-photo",
        headers=headers,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    check("rejects a non-image", wrong_type.status_code == 415, str(wrong_type.status_code))

    print("\ndashboard")
    summary = client.get("/transactions/summary?period=day", headers=headers).json()
    check("sums income", summary["income"] == "450.00", summary["income"])
    check("sums expenses", summary["expense"] == "1200.00", summary["expense"])
    check("nets correctly", summary["net"] == "-750.00", summary["net"])
    check("breaks down by category", len(summary["by_category"]) == 2)
    for period in ("week", "month"):
        check(
            f"{period} period works",
            client.get(f"/transactions/summary?period={period}", headers=headers).status_code
            == 200,
        )

    print("\nhistory")
    page = client.get("/transactions?limit=1", headers=headers).json()
    check("pages", len(page["items"]) == 1 and page["total"] == 2, str(page["total"]))
    filtered = client.get(f"/transactions?category_id={printing['id']}", headers=headers).json()
    check("filters by category", filtered["total"] == 1, str(filtered["total"]))
    # Deliberately the shop's date, not UTC's. Around midnight in Colombo the two differ,
    # and the filter is specified in local time; using UTC here would fail correctly.
    today = datetime.now(ZoneInfo(business["timezone"])).date().isoformat()
    dated = client.get(f"/transactions?from_date={today}&to_date={today}", headers=headers)
    check("filters by local date", dated.json()["total"] == 2, dated.text)

    utc_today = datetime.now(UTC).date().isoformat()
    if utc_today != today:
        yesterday = client.get(
            f"/transactions?from_date={utc_today}&to_date={utc_today}", headers=headers
        )
        check(
            "day boundary follows the shop, not UTC",
            yesterday.json()["total"] == 0,
            yesterday.text,
        )

    print("\npdf export")
    pdf = client.get(f"/reports/export?from_date={today}&to_date={today}", headers=headers)
    check("returns a pdf", pdf.status_code == 200, pdf.text[:200])
    if pdf.status_code == 200:
        check("has the pdf magic bytes", pdf.content[:5] == b"%PDF-")
        check("is a plausible size", len(pdf.content) > 2000, f"{len(pdf.content)} bytes")
        check(
            "is an attachment",
            "attachment" in pdf.headers.get("content-disposition", ""),
        )
    reversed_range = client.get(
        f"/reports/export?from_date={today}&to_date=2020-01-01", headers=headers
    )
    check("rejects a reversed range", reversed_range.status_code == 422)

    print("\nexpenses and unpaid bills")
    utilities = next(c for c in categories if c["name"] == "Utilities")
    last_week = (
        datetime.now(ZoneInfo(business["timezone"])).date() - timedelta(days=7)
    ).isoformat()
    backdated = client.post(
        "/transactions",
        headers=headers,
        json={
            "category_id": utilities["id"],
            "amount": "3400.00",
            "occurred_at": f"{last_week}T09:00:00+05:30",
            "counterparty": "CEB",
            "payment_method": "bank",
        },
    )
    check("backdates an entry", backdated.status_code == 201, backdated.text)
    check(
        "keeps the entered date out of today",
        client.get("/transactions/summary?period=day", headers=headers).json()["expense"]
        == "1200.00",
    )

    future = client.post(
        "/transactions",
        headers=headers,
        json={
            "category_id": utilities["id"],
            "amount": "10",
            "occurred_at": "2099-01-01T00:00:00Z",
        },
    )
    check("refuses a future date", future.status_code == 422, str(future.status_code))

    credit = client.post(
        "/transactions",
        headers=headers,
        json={
            "category_id": expense["id"],
            "amount": "8000.00",
            "counterparty": "Sunrise Traders",
            "payment_method": "credit",
            "due_date": last_week,
            "settled": False,
        },
    )
    check("records a credit purchase", credit.status_code == 201, credit.text)
    check("leaves it unsettled", credit.json()["settled"] is False, credit.text)

    owed = client.get("/transactions/summary?period=day", headers=headers).json()
    check("totals what is owed", owed["outstanding_payable"] == "8000.00", str(owed))
    check("counts the overdue one", owed["overdue_count"] == 1, str(owed["overdue_count"]))
    check("compares to the previous period", "previous_net" in owed, str(owed))

    unsettled = client.get("/transactions?settled=false", headers=headers).json()
    check("filters to unpaid", unsettled["total"] == 1, str(unsettled["total"]))

    settled = client.post(f"/transactions/{credit.json()['id']}/settle", headers=headers)
    check("settles the bill", settled.status_code == 200, settled.text)
    check("marks it paid", settled.json()["settled"] is True, settled.text)
    check(
        "clears what is owed",
        client.get("/transactions/summary?period=day", headers=headers).json()[
            "outstanding_payable"
        ]
        == "0.00",
    )

    print("\ncorrections")
    fixed = client.patch(
        f"/transactions/{created.json()['id']}",
        headers=headers,
        json={"amount": "540.00", "note": "24 pages colour"},
    )
    check("corrects an amount", fixed.status_code == 200, fixed.text)
    check("keeps the correction", fixed.json()["amount"] == "540.00", fixed.text)

    voided = client.post(f"/transactions/{backdated.json()['id']}/void", headers=headers)
    check("voids an entry", voided.status_code == 200, voided.text)
    listed = client.get("/transactions", headers=headers).json()
    check(
        "hides voided rows by default",
        all(not row["voided"] for row in listed["items"]),
        str([row["voided"] for row in listed["items"]]),
    )
    with_voided = client.get("/transactions?include_voided=true", headers=headers).json()
    check(
        "shows them behind the toggle",
        with_voided["total"] == listed["total"] + 1,
        f"{with_voided['total']} vs {listed['total']}",
    )

    print("\ncategory upkeep")
    renamed = client.patch(
        f"/categories/{utilities['id']}", headers=headers, json={"name": "Electricity & Water"}
    )
    check("renames a category", renamed.status_code == 200, renamed.text)
    archived = client.patch(
        f"/categories/{printing['id']}", headers=headers, json={"archived": True}
    )
    check("archives a category", archived.status_code == 200, archived.text)
    visible = {c["name"] for c in client.get("/categories", headers=headers).json()}
    check("hides archived ones", "Printing" not in visible, str(visible))
    all_names = {
        c["name"] for c in client.get("/categories?include_archived=true", headers=headers).json()
    }
    check("keeps them for history", "Printing" in all_names, str(all_names))

    print("\nisolation against a live server")
    other_headers, _ = register(client, "Kamals Printers")
    other_page = client.get("/transactions", headers=other_headers).json()
    check("a new shop sees no rows", other_page["total"] == 0, str(other_page["total"]))

    theirs = created.json()["id"]
    stolen = client.patch(f"/transactions/{theirs}", headers=other_headers, json={"amount": "1.00"})
    check("cannot edit another shop's row", stolen.status_code == 404, str(stolen.status_code))
    check(
        "cannot void another shop's row",
        client.post(f"/transactions/{theirs}/void", headers=other_headers).status_code == 404,
    )
    check(
        "cannot rename another shop's category",
        client.patch(
            f"/categories/{expense['id']}", headers=other_headers, json={"name": "Stolen"}
        ).status_code
        == 404,
    )

    cross_post = client.post(
        "/transactions",
        headers=other_headers,
        json={"category_id": printing["id"], "amount": "100"},
    )
    check(
        "cannot post to another shop's category",
        cross_post.status_code == 404,
        str(cross_post.status_code),
    )

    forged = client.post(
        "/transactions",
        headers=other_headers,
        json={
            "category_id": printing["id"],
            "amount": "100",
            "business_id": business["id"],
        },
    )
    check("ignores a forged business_id in the body", forged.status_code in (404, 422))

    print(f"\n{passed} passed, {len(failed)} failed")
    for name in failed:
        print(f"  - {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except httpx.ConnectError:
        print("No server on :8000. Start it with: uvicorn app.main:app", file=io.StringIO())
        print("No server on :8000. Start it with: uvicorn app.main:app")
        sys.exit(2)
