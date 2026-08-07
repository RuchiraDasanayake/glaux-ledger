"""A small in-process rate limiter for the four routes that need one.

No dependency, for the same reason there is no OpenAI SDK: slowapi and its relatives
bring a storage abstraction, a middleware, and a release cadence, and what is actually
required here is a bounded log of recent hits per key.

**Its one real limitation.** The counters live in this process, so two instances behind a
load balancer each allow the configured rate. That is the honest tradeoff for a service
that runs as a single container today, and it still turns an unbounded password-guessing
loop into a bounded one. Moving to Redis means replacing `_hits` and nothing else.

Keys differ by route on purpose. The uploads have an identity and are limited per shop:
three devices behind one shop's router should not share a bucket, and one shop should not
be able to exhaust another's by sharing an ISP.

Sign-in has no identity until the password is checked, so it is limited twice. Per
address, loosely, which stops one host hammering the endpoint. Per email, tightly, which
is the one that actually stops someone guessing a particular shop's password: an address
limit alone is both too tight and too weak, because a shop on Sri Lankan mobile data
shares a carrier NAT address with thousands of strangers while an attacker rents a new
address for pennies.
"""

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentBusinessId

# Timestamps of recent hits, newest last, one deque per (scope, key). Each is trimmed to
# the window on every read, so a deque never holds more than `limit` entries.
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = threading.Lock()

# Sweeping only on a schedule keeps the common path cheap. Without it a caller rotating
# addresses would leave one empty deque behind per address, forever.
_SWEEP_EVERY = 512
_since_sweep = 0


@dataclass(frozen=True)
class Rate:
    limit: int
    window_seconds: int


def reset() -> None:
    """Drop all counters and the sweep clock. For tests; nothing in the app calls this."""
    global _since_sweep
    with _lock:
        _hits.clear()
        _since_sweep = 0


def _sweep(now: float) -> None:
    for key in [k for k, hits in _hits.items() if not hits or now - hits[-1] > 3600]:
        del _hits[key]


def _bucket(scope: str, key: str, rate: Rate, now: float) -> deque[float]:
    """This caller's recent hits, aged to the window. Call holding the lock."""
    global _since_sweep
    _since_sweep += 1
    if _since_sweep >= _SWEEP_EVERY:
        _since_sweep = 0
        _sweep(now)

    hits = _hits[(scope, key)]
    cutoff = now - rate.window_seconds
    while hits and hits[0] <= cutoff:
        hits.popleft()
    return hits


def _refuse(hits: deque[float], rate: Rate, now: float, detail: str) -> None:
    """Retry-After is when the oldest hit ages out, which is when a slot actually frees."""
    retry_after = max(1, int(hits[0] + rate.window_seconds - now) + 1)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


# Neither says when to come back, because neither knows: Retry-After carries the number
# and the caller composes the sentence from it. A message that guesses at "a moment" is
# wrong by an hour on the registration bucket.
_TOO_MANY = "Too many attempts from this connection."


def _check(scope: str, key: str, rate: Rate, detail: str = _TOO_MANY) -> None:
    """Refuse a full bucket, otherwise spend a slot."""
    now = time.monotonic()
    with _lock:
        hits = _bucket(scope, key, rate, now)
        if len(hits) >= rate.limit:
            _refuse(hits, rate, now, detail)
        hits.append(now)


def _guard(scope: str, key: str, rate: Rate, detail: str) -> None:
    """Refuse a full bucket and spend nothing either way.

    For buckets filled by an outcome rather than by the attempt: whether a sign-in counts
    is not known until the password has been checked.
    """
    now = time.monotonic()
    with _lock:
        hits = _bucket(scope, key, rate, now)
        if len(hits) >= rate.limit:
            _refuse(hits, rate, now, detail)


def _spend(scope: str, key: str, rate: Rate) -> None:
    now = time.monotonic()
    with _lock:
        _bucket(scope, key, rate, now).append(now)


def _client_key(request: Request) -> str:
    """The caller's address, as far as it can be trusted.

    Uvicorn's proxy-headers middleware rewrites `request.client` from X-Forwarded-For,
    but only for addresses in `--forwarded-allow-ips`. Reading the header here instead
    would let any caller pick their own bucket by sending one.
    """
    return request.client.host if request.client else "unknown"


def login_rate_limit(request: Request) -> None:
    _check(
        "login",
        _client_key(request),
        Rate(settings.login_rate_limit, settings.login_rate_window_seconds),
    )


def register_rate_limit(request: Request) -> None:
    _check(
        "register",
        _client_key(request),
        Rate(settings.register_rate_limit, settings.register_rate_window_seconds),
    )


_ACCOUNT_RATE = "account"
_ACCOUNT_REFUSAL = "Too many failed sign-ins for this email."


def _account_rate() -> Rate:
    return Rate(settings.login_account_limit, settings.login_account_window_seconds)


def failed_login_guard(email: str) -> None:
    """Refuse a sign-in for an email that has just been guessed at repeatedly.

    Checked before the password is verified, which is the only place it can do any good
    and is also its cost: someone who knows a shop's email address can hold it shut for
    the length of the window by failing sign-ins on purpose. That is the accepted trade.
    The alternative, verifying first and refusing after, lets every guess through and
    protects nothing, and a lockout an attacker has to keep paying for is a far smaller
    harm than a book they can open.
    """
    _guard(_ACCOUNT_RATE, email.strip().lower(), _account_rate(), _ACCOUNT_REFUSAL)


def record_failed_login(email: str) -> None:
    """Only failures count, so a shop signing in all day never fills its own bucket."""
    _spend(_ACCOUNT_RATE, email.strip().lower(), _account_rate())


def upload_rate_limit(business_id: CurrentBusinessId) -> None:
    """Bursts of voice and photo uploads, on top of the monthly allowance.

    The monthly cap bounds the bill; this bounds the minute. A retry loop that would
    otherwise spend a shop's entire allowance in four minutes gets stopped while there is
    still an allowance left to stop.
    """
    _check(
        "upload",
        str(business_id),
        Rate(settings.upload_rate_limit, settings.upload_rate_window_seconds),
    )


def payment_submission_rate_limit(business_id: CurrentBusinessId) -> None:
    _check(
        "payment-submission",
        str(business_id),
        Rate(
            settings.payment_submission_rate_limit,
            settings.payment_submission_rate_window_seconds,
        ),
    )
