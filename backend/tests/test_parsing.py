import io
import uuid
from decimal import Decimal

import pytest

from app.services.parsing.interfaces import CategoryRef
from app.services.parsing.rules import RuleBasedExtractor
from tests.conftest import Tenant

CATEGORIES = [
    CategoryRef(id=uuid.uuid4(), name="Stationery Sale", type="income"),
    CategoryRef(id=uuid.uuid4(), name="Printing", type="income"),
    CategoryRef(id=uuid.uuid4(), name="Scanning", type="income"),
    CategoryRef(id=uuid.uuid4(), name="Stock & Supplies", type="expense"),
    CategoryRef(id=uuid.uuid4(), name="Utilities", type="expense"),
    CategoryRef(id=uuid.uuid4(), name="Rent", type="expense"),
    CategoryRef(id=uuid.uuid4(), name="Wages", type="expense"),
    CategoryRef(id=uuid.uuid4(), name="Transport", type="expense"),
    CategoryRef(id=uuid.uuid4(), name="Other Expense", type="expense"),
]

BY_NAME = {c.name: c.id for c in CATEGORIES}


@pytest.fixture
def extractor() -> RuleBasedExtractor:
    return RuleBasedExtractor()


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("printing 450", Decimal("450")),
        ("Rs 1,250 stationery", Decimal("1250")),
        ("scan 200/-", Decimal("200")),
        ("rupees 75.50 for copies", Decimal("75.50")),
        ("paid 2k for toner", Decimal("2000")),
        ("scan two hundred", Decimal("200")),
        ("five thousand rent", Decimal("5000")),
    ],
)
def test_amounts_are_recognised(extractor, text, expected) -> None:
    assert extractor.extract(text, CATEGORIES).amount.value == expected


def test_quantity_is_not_mistaken_for_the_price(extractor) -> None:
    """ "20 pages 1200" must bill 1200, not 20, and should ask to be checked."""
    fields = extractor.extract("colour print 20 pages 1200", CATEGORIES)
    assert fields.amount.value == Decimal("1200")
    assert fields.amount.confidence < 0.6


def test_a_currency_marked_amount_is_trusted(extractor) -> None:
    fields = extractor.extract("Rs 450 for printing", CATEGORIES)
    assert fields.amount.confidence >= 0.9


def test_no_amount_yields_no_guess(extractor) -> None:
    fields = extractor.extract("something for the shop", CATEGORIES)
    assert fields.amount.value is None
    assert fields.amount.confidence == 0.0


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("printing 450", "Printing"),
        ("photocopy 60", "Printing"),
        ("scan 200", "Scanning"),
        ("sold two pens 120", "Stationery Sale"),
    ],
)
def test_categories_are_matched_by_keyword(extractor, text, category) -> None:
    assert extractor.extract(text, CATEGORIES).category_id.value == BY_NAME[category]


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("paid 1500 electricity bill", "Utilities"),
        ("water bill 900", "Utilities"),
        ("bought two reams 1800", "Stock & Supplies"),
        ("toner cartridge 4500", "Stock & Supplies"),
        ("shop rent 15000", "Rent"),
        ("staff salary 22000", "Wages"),
        ("petrol 3000", "Transport"),
    ],
)
def test_each_kind_of_cost_lands_in_its_own_category(extractor, text, category) -> None:
    """The point of the expense split.

    Every one of these used to resolve to a single "Expense" row, which made the
    breakdown useless for the question it exists to answer: what is the money going on.
    """
    fields = extractor.extract(text, CATEGORIES)
    assert fields.category_id.value == BY_NAME[category]
    assert fields.entry_type.value == "expense"


def test_expense_wording_flips_the_entry_type(extractor) -> None:
    assert extractor.extract("paid 900 for ink", CATEGORIES).entry_type.value == "expense"
    assert extractor.extract("printing 900", CATEGORIES).entry_type.value == "income"


@pytest.mark.parametrize(
    "text",
    [
        "bought paper 1800 on credit",
        "stock 5000 නයට",
        "toner 4500 pay later",
    ],
)
def test_credit_purchases_are_recognised(extractor, text) -> None:
    fields = extractor.extract(text, CATEGORIES)
    assert fields.on_credit.value is True
    assert fields.on_credit.confidence >= 0.6


def test_cash_at_the_counter_is_not_treated_as_credit(extractor) -> None:
    assert extractor.extract("paid 1800 for paper", CATEGORIES).on_credit.value is False


def test_a_receipt_heading_becomes_the_supplier(extractor) -> None:
    receipt = "CITY PAPER SUPPLIES\nA4 Ream x2\nTotal Rs 1,800\nCash"
    assert extractor.extract(receipt, CATEGORIES).counterparty.value == "City Paper Supplies"


def test_no_supplier_is_invented_when_none_is_named(extractor) -> None:
    assert extractor.extract("printing 450", CATEGORIES).counterparty.value is None


def test_code_switched_sinhala_is_handled(extractor) -> None:
    """Counter speech mixes Sinhala with English nouns and Arabic digits."""
    fields = extractor.extract("print eka 350 රුපියල්", CATEGORIES)
    assert fields.amount.value == Decimal("350")
    assert fields.category_id.value == BY_NAME["Printing"]


def test_an_unmatched_category_is_flagged_rather_than_asserted(extractor) -> None:
    fields = extractor.extract("1500", CATEGORIES)
    assert fields.category_id.value is not None  # something sensible is preselected
    assert fields.category_id.confidence < 0.6  # but the UI must ask


def test_no_categories_at_all_is_not_a_crash(extractor) -> None:
    fields = extractor.extract("printing 450", [])
    assert fields.category_id.value is None
    assert fields.amount.value == Decimal("450")


# --- endpoint behaviour ---------------------------------------------------------


def _audio() -> dict:
    return {"file": ("clip.webm", io.BytesIO(b"fake audio bytes"), "audio/webm")}


def _photo() -> dict:
    return {"file": ("bill.jpg", io.BytesIO(b"fake image bytes"), "image/jpeg")}


def test_voice_returns_a_draft_without_saving(alpha: Tenant) -> None:
    response = alpha.client.post(
        "/transactions/from-voice",
        files=_audio(),
        headers={"Authorization": f"Bearer {alpha.token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "voice"
    assert body["raw_text"]

    # The headline guarantee: parsing never writes.
    assert alpha.get("/transactions").json()["total"] == 0


def test_photo_returns_a_draft_without_saving(alpha: Tenant) -> None:
    response = alpha.client.post(
        "/transactions/from-photo",
        files=_photo(),
        headers={"Authorization": f"Bearer {alpha.token}"},
    )
    assert response.status_code == 200
    assert response.json()["source"] == "photo"
    assert alpha.get("/transactions").json()["total"] == 0


def test_a_draft_only_ever_offers_this_business_s_categories(alpha: Tenant, beta: Tenant) -> None:
    beta_ids = {c["id"] for c in beta.categories()}
    response = alpha.client.post(
        "/transactions/from-voice",
        files=_audio(),
        headers={"Authorization": f"Bearer {alpha.token}"},
    )
    suggested = response.json()["category_id"]["value"]
    assert suggested not in beta_ids


def test_wrong_media_type_is_rejected(alpha: Tenant) -> None:
    response = alpha.client.post(
        "/transactions/from-voice",
        files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
        headers={"Authorization": f"Bearer {alpha.token}"},
    )
    assert response.status_code == 415


def test_drafting_requires_authentication(client) -> None:
    assert client.post("/transactions/from-voice", files=_audio()).status_code == 401


def test_confirming_a_draft_records_its_source(alpha: Tenant) -> None:
    draft = alpha.client.post(
        "/transactions/from-voice",
        files=_audio(),
        headers={"Authorization": f"Bearer {alpha.token}"},
    ).json()

    saved = alpha.post(
        "/transactions",
        json={
            "category_id": draft["category_id"]["value"],
            "amount": draft["amount"]["value"] or "100.00",
            "note": draft["note"]["value"],
            "source": "voice",
        },
    )
    assert saved.status_code == 201
    assert saved.json()["source"] == "voice"
