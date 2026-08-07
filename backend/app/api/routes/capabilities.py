from fastapi import APIRouter

from app.core.config import settings
from app.core.deps import CurrentBusinessId

router = APIRouter(tags=["meta"])


@router.get("/capabilities")
def capabilities(_business_id: CurrentBusinessId) -> dict[str, bool]:
    return {"ai_parsing_enabled": settings.parser_provider == "openai"}
