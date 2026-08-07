import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models import EntryType


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: EntryType
    archived_at: datetime | None = None

    @computed_field
    @property
    def archived(self) -> bool:
        return self.archived_at is not None


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: EntryType


class CategoryUpdate(BaseModel):
    """Rename and retire only.

    `type` is absent on purpose: flipping a category's direction would silently rewrite
    the meaning of every entry already filed under it, turning past income into expense
    in every report. Retire it and make a new one instead.
    """

    name: str | None = Field(default=None, min_length=1, max_length=60)
    archived: bool | None = None
