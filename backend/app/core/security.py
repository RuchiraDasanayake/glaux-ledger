import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

_password_hash = PasswordHash.recommended()

# Verified against this when the email is unknown, so a failed login costs the same
# whether or not the account exists and cannot be timed to enumerate users.
_DUMMY_HASH = _password_hash.hash("timing-equalisation-placeholder")


def hash_password(plain_password: str) -> str:
    return _password_hash.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if hashed_password is None:
        _password_hash.verify(plain_password, _DUMMY_HASH)
        return False
    try:
        return _password_hash.verify(plain_password, hashed_password)
    except Exception:
        return False


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: uuid.UUID
    business_id: uuid.UUID


@dataclass(frozen=True, slots=True)
class AdminTokenClaims:
    user_id: uuid.UUID


class InvalidToken(Exception):
    pass


def create_access_token(*, user_id: uuid.UUID, business_id: uuid.UUID) -> str:
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "typ": "shop",
        # The tenant is bound into the token at login. Every scoped query derives its
        # business from here, never from anything the client sends.
        "biz": str(business_id),
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "typ"]},
        )
        if payload["typ"] != "shop":
            raise InvalidToken("This token is not a shop token")
        return TokenClaims(user_id=uuid.UUID(payload["sub"]), business_id=uuid.UUID(payload["biz"]))
    except InvalidToken:
        raise
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise InvalidToken(str(exc)) from exc


def create_admin_access_token(*, user_id: uuid.UUID) -> str:
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "typ": "admin",
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=settings.admin_jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_admin_access_token(token: str) -> AdminTokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "typ"]},
        )
        if payload["typ"] != "admin":
            raise InvalidToken("This token is not a platform token")
        return AdminTokenClaims(user_id=uuid.UUID(payload["sub"]))
    except InvalidToken:
        raise
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise InvalidToken(str(exc)) from exc
