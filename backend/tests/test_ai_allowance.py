"""The monthly cap on voice and photo entries.

Enforced with the stub parser as well as the real one, which costs nothing and so looks
arbitrary until you consider the alternative: a limit that only exists in the
configuration nobody runs locally is a limit discovered in an invoice.
"""

import pytest
from sqlalchemy import create_engine, text

from app.core.config import settings
from tests.conftest import OWNER_URL, Tenant

AUDIO = {"file": ("clip.webm", b"pretend-audio", "audio/webm")}
PHOTO = {"file": ("bill.jpg", b"pretend-image", "image/jpeg")}


@pytest.fixture
def small_cap(monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr(settings, "ai_calls_per_month", 3)
    return 3


def _usage(business_id: str) -> tuple[str | None, int]:
    owner = create_engine(OWNER_URL, isolation_level="AUTOCOMMIT")
    with owner.connect() as conn:
        row = conn.execute(
            text("SELECT ai_period, ai_calls_used FROM businesses WHERE id = CAST(:id AS uuid)"),
            {"id": business_id},
        ).one()
    owner.dispose()
    return row[0], row[1]


def _set_period(business_id: str, period: str, used: int) -> None:
    owner = create_engine(OWNER_URL, isolation_level="AUTOCOMMIT")
    with owner.connect() as conn:
        conn.execute(
            text(
                "UPDATE businesses SET ai_period = CAST(:p AS date), ai_calls_used = :u "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"p": period, "u": used, "id": business_id},
        )
    owner.dispose()


def test_a_new_shop_has_used_nothing(alpha: Tenant) -> None:
    period, used = _usage(alpha.business_id)
    assert period is None
    assert used == 0


def test_each_upload_spends_one(alpha: Tenant, small_cap: int) -> None:
    assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 200
    assert alpha.post("/transactions/from-photo", files=PHOTO).status_code == 200

    period, used = _usage(alpha.business_id)
    assert used == 2
    assert period.day == 1


def test_the_cap_refuses_further_uploads(alpha: Tenant, small_cap: int) -> None:
    for _ in range(small_cap):
        assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 200

    refused = alpha.post("/transactions/from-voice", files=AUDIO)
    assert refused.status_code == 429
    assert "resets on the 1st" in refused.json()["detail"]
    assert alpha.post("/transactions/from-photo", files=PHOTO).status_code == 429


def test_a_refusal_does_not_keep_counting(alpha: Tenant, small_cap: int) -> None:
    """Otherwise a retry loop inflates the stored figure into nonsense."""
    for _ in range(small_cap + 4):
        alpha.post("/transactions/from-voice", files=AUDIO)

    _, used = _usage(alpha.business_id)
    assert used == small_cap


def test_typing_is_never_capped(alpha: Tenant, small_cap: int) -> None:
    """The cap is on the expensive paths, not on recording a sale."""
    for _ in range(small_cap):
        alpha.post("/transactions/from-voice", files=AUDIO)

    assert alpha.add_transaction("Printing", "250.00").status_code == 201
    assert alpha.get("/transactions").status_code == 200


def test_a_new_month_restores_the_allowance(alpha: Tenant, small_cap: int) -> None:
    _set_period(alpha.business_id, "2001-01-01", small_cap)
    assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 200

    period, used = _usage(alpha.business_id)
    assert used == 1, "a stale period should reset the count rather than add to it"
    assert period.year > 2001


def test_one_shop_exhausting_its_allowance_does_not_touch_another(
    alpha: Tenant, beta: Tenant, small_cap: int
) -> None:
    for _ in range(small_cap):
        alpha.post("/transactions/from-voice", files=AUDIO)

    assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 429
    assert beta.post("/transactions/from-voice", files=AUDIO).status_code == 200


def test_a_lapsed_shop_is_refused_before_spending_its_allowance(alpha: Tenant) -> None:
    """Order matters: the subscription check has to come first or a lapsed shop's
    refused uploads still eat the counter."""
    alpha.set_billing(trial_days=-1)
    assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 402

    _, used = _usage(alpha.business_id)
    assert used == 0
