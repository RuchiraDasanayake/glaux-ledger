import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import RequireActive
from app.repositories.category import CategoryRepo
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    repo: CategoryRepo,
    include_archived: bool = Query(
        default=False, description="Retired categories, for the settings screen"
    ),
) -> list[CategoryOut]:
    return [
        CategoryOut.model_validate(category)
        for category in repo.list_ordered(include_archived=include_archived)
    ]


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireActive],
)
def create_category(payload: CategoryCreate, repo: CategoryRepo) -> CategoryOut:
    name = payload.name.strip()
    if repo.name_exists(name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A category named {name!r} already exists",
        )
    category = repo.add(name=name, type=payload.type.value)
    repo.session.commit()
    return CategoryOut.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryOut, dependencies=[RequireActive])
def update_category(
    category_id: uuid.UUID, payload: CategoryUpdate, repo: CategoryRepo
) -> CategoryOut:
    """Rename or retire.

    There is no delete: transactions reference categories with ON DELETE RESTRICT, and
    they should: last year's report has to keep saying "Scanning" even after the shop
    stops offering it. Archiving takes it out of the picker and leaves history intact.
    """
    category = repo.get(category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    fields = payload.model_dump(exclude_unset=True)

    if fields.get("name") is not None:
        name = fields["name"].strip()
        if repo.name_exists(name, excluding=category):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A category named {name!r} already exists",
            )
        category.name = name

    if "archived" in fields and fields["archived"] is not None:
        category.archived_at = datetime.now(UTC) if fields["archived"] else None

    repo.session.commit()
    repo.session.refresh(category)
    return CategoryOut.model_validate(category)
