import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import PlatformRole


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: uuid.UUID
    email: str
    role: PlatformRole
