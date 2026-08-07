"""Rate limiting on the four routes that are reachable without a cost of their own.

The rest of the suite runs with the limits raised out of the way (see conftest), so these
put them back down. Each test resets the shared counters first, since they outlive a
single request by design.
"""

import pytest
from fastapi.testclient import TestClient

from app.core import limiter
from app.core.config import settings
from tests.conftest import Tenant, register_tenant

AUDIO = {"file": ("clip.webm", b"pretend-audio", "audio/webm")}
CREDENTIALS = {"email": "nobody@example.com", "password": "whatever-goes-here"}


@pytest.fixture(autouse=True)
def _fresh_counters() -> None:
    limiter.reset()
    yield
    limiter.reset()


def test_repeated_failed_logins_are_cut_off(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "login_rate_limit", 3)

    for _ in range(3):
        assert client.post("/auth/login", json=CREDENTIALS).status_code == 401

    refused = client.post("/auth/login", json=CREDENTIALS)
    assert refused.status_code == 429
    assert int(refused.headers["Retry-After"]) > 0


def test_a_correct_password_does_not_get_a_free_pass(
    client: TestClient, alpha: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The limit is on attempts, not on failures.

    Counting only failures would leave an attacker who has one working account free to
    use it as an oracle, and would let a broken client hammer login forever.
    """
    monkeypatch.setattr(settings, "login_rate_limit", 2)
    good = {"email": alpha.email, "password": "a-sufficiently-long-password"}

    assert client.post("/auth/login", json=good).status_code == 200
    assert client.post("/auth/login", json=good).status_code == 200
    assert client.post("/auth/login", json=good).status_code == 429


def test_registration_is_limited_separately_from_login(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Separate buckets, so a burst of sign-ups cannot lock the shop out of signing in."""
    monkeypatch.setattr(settings, "register_rate_limit", 1)
    monkeypatch.setattr(settings, "login_rate_limit", 5)

    register_tenant(client, "First Shop")
    exhausted = client.post(
        "/auth/register",
        json={
            "business_name": "Second Shop",
            "email": "second@example.com",
            "password": "a-sufficiently-long-password",
        },
    )
    assert exhausted.status_code == 429
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 401


def test_uploads_are_limited_per_shop_not_per_address(
    alpha: Tenant, beta: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both tenants share a client address here, which is the whole point: one shop
    bursting must not spend another's budget for talking to the server."""
    monkeypatch.setattr(settings, "upload_rate_limit", 2)

    for _ in range(2):
        assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 200
    assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 429

    assert beta.post("/transactions/from-voice", files=AUDIO).status_code == 200


def test_a_burst_refusal_does_not_spend_the_monthly_allowance(
    alpha: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "upload_rate_limit", 1)
    monkeypatch.setattr(settings, "ai_calls_per_month", 500)

    alpha.post("/transactions/from-voice", files=AUDIO)
    for _ in range(5):
        assert alpha.post("/transactions/from-voice", files=AUDIO).status_code == 429

    assert alpha.get("/auth/me").status_code == 200


def test_the_window_slides_rather_than_resetting_on_the_hour(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A fixed window lets twice the limit through across a boundary. Hits are aged out
    individually instead, so the oldest expiring frees exactly one slot."""
    monkeypatch.setattr(settings, "login_rate_limit", 2)
    monkeypatch.setattr(settings, "login_rate_window_seconds", 60)

    clock = [1000.0]
    monkeypatch.setattr(limiter.time, "monotonic", lambda: clock[0])

    assert client.post("/auth/login", json=CREDENTIALS).status_code == 401
    clock[0] += 30
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 401
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 429

    # 61s after the first hit, which frees that slot and no other.
    clock[0] += 31
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 401
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 429


def test_guessing_one_account_is_cut_off_however_many_addresses_it_comes_from(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The address limit cannot do this job. An attacker rents a fresh address for pennies
    and the shop being guessed at is behind the same carrier NAT as thousands of others,
    so the limit that matters is keyed on the account being attacked."""
    monkeypatch.setattr(settings, "login_account_limit", 3)
    # Effectively off, so nothing here can be attributed to the address bucket.
    monkeypatch.setattr(settings, "login_rate_limit", 100000)

    for _ in range(3):
        assert client.post("/auth/login", json=CREDENTIALS).status_code == 401

    refused = client.post("/auth/login", json=CREDENTIALS)
    assert refused.status_code == 429
    assert int(refused.headers["Retry-After"]) > 0


def test_a_shop_signing_in_all_day_never_fills_its_own_bucket(
    client: TestClient, alpha: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Only failures count against an email, unlike the address bucket, which counts every
    attempt. A busy shop on several devices would otherwise lock itself out by working."""
    monkeypatch.setattr(settings, "login_account_limit", 2)
    good = {"email": alpha.email, "password": "a-sufficiently-long-password"}

    for _ in range(6):
        assert client.post("/auth/login", json=good).status_code == 200


def test_guessing_one_shop_does_not_shut_another_out(
    client: TestClient, alpha: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Buckets are per email. Sharing one across accounts would turn an attack on any
    shop into an outage for every shop."""
    monkeypatch.setattr(settings, "login_account_limit", 2)
    monkeypatch.setattr(settings, "login_rate_limit", 100000)

    for _ in range(3):
        client.post("/auth/login", json=CREDENTIALS)
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 429

    good = {"email": alpha.email, "password": "a-sufficiently-long-password"}
    assert client.post("/auth/login", json=good).status_code == 200


def test_an_unknown_email_is_counted_like_any_other(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Otherwise the limit answers a question the 401 is careful not to: run one address
    past the limit and the ones that never refuse are the registered ones."""
    monkeypatch.setattr(settings, "login_account_limit", 2)
    monkeypatch.setattr(settings, "login_rate_limit", 100000)

    for _ in range(2):
        assert client.post("/auth/login", json=CREDENTIALS).status_code == 401
    assert client.post("/auth/login", json=CREDENTIALS).status_code == 429


def test_the_same_email_typed_differently_is_the_same_account(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Emails are stored and matched lowercased, so a bucket keyed on the raw string
    would hand out a fresh allowance for every capitalisation of the same address."""
    monkeypatch.setattr(settings, "login_account_limit", 2)
    monkeypatch.setattr(settings, "login_rate_limit", 100000)

    for _ in range(2):
        client.post("/auth/login", json=CREDENTIALS)

    shouting = {**CREDENTIALS, "email": CREDENTIALS["email"].upper()}
    assert client.post("/auth/login", json=shouting).status_code == 429


def test_counters_do_not_accumulate_forever(monkeypatch: pytest.MonkeyPatch) -> None:
    """A caller rotating addresses would otherwise leave one empty deque per address.

    Driven against the check itself rather than through /auth/login: the point is the
    size of the store after a thousand distinct keys, and routing those through the
    endpoint would mean a thousand argon2 hashes to prove something about a dictionary.
    """
    clock = [1000.0]
    monkeypatch.setattr(limiter.time, "monotonic", lambda: clock[0])
    rate = limiter.Rate(limit=1, window_seconds=60)

    for index in range(limiter._SWEEP_EVERY * 2):
        limiter._check("login", f"10.0.0.{index}", rate)
        clock[0] += 7200  # Past the sweep's one-hour staleness threshold.

    # A sweep is guaranteed to have run within any window of _SWEEP_EVERY checks, so
    # whatever survives is only what has arrived since the last one.
    assert len(limiter._hits) < limiter._SWEEP_EVERY
