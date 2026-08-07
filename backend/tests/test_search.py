from tests.conftest import Tenant


def _seed(tenant: Tenant) -> None:
    tenant.add_transaction("Printing", "450.00", note="20 pages colour")
    tenant.add_transaction("Utilities", "6450.00", note="Electricity, August", counterparty="CEB")
    tenant.add_transaction(
        "Stock & Supplies", "18000.00", note="A4 paper", counterparty="City Paper Supplies"
    )
    tenant.add_transaction("Rent", "35000.00", counterparty="M. Perera")


def _found(tenant: Tenant, query: str) -> list[str]:
    body = tenant.get("/transactions", params={"q": query}).json()
    return [item["category"]["name"] for item in body["items"]]


def test_a_note_is_searchable(alpha: Tenant) -> None:
    _seed(alpha)
    assert _found(alpha, "colour") == ["Printing"]


def test_a_supplier_is_searchable(alpha: Tenant) -> None:
    _seed(alpha)
    assert _found(alpha, "perera") == ["Rent"]


def test_a_category_name_is_searchable(alpha: Tenant) -> None:
    """The category is the one label on every entry, so it has to be reachable."""
    _seed(alpha)
    assert _found(alpha, "utilities") == ["Utilities"]


def test_case_does_not_matter(alpha: Tenant) -> None:
    _seed(alpha)
    assert _found(alpha, "CEB") == _found(alpha, "ceb") == ["Utilities"]


def test_words_are_anded_across_fields(alpha: Tenant) -> None:
    """Recalling two facts about one entry should narrow, not widen.

    "ceb august" is the supplier plus a word from the note. Ored, this would also return
    every other entry; anded, it returns the electricity bill.
    """
    _seed(alpha)
    assert _found(alpha, "ceb august") == ["Utilities"]


def test_word_order_does_not_matter(alpha: Tenant) -> None:
    _seed(alpha)
    assert _found(alpha, "august ceb") == ["Utilities"]


def test_a_wildcard_is_a_literal_character(alpha: Tenant) -> None:
    """Otherwise a supplier called "100% Paper" would match the entire ledger."""
    _seed(alpha)
    assert _found(alpha, "%") == []
    assert _found(alpha, "_") == []


def test_the_count_matches_the_page(alpha: Tenant) -> None:
    """The two run through the same filter, and a search that narrows one must narrow
    both. Otherwise History says "4 entries" above a list of one."""
    _seed(alpha)
    body = alpha.get("/transactions", params={"q": "ceb"}).json()
    assert body["total"] == 1
    assert len(body["items"]) == 1


def test_search_does_not_cross_shops(alpha: Tenant, beta: Tenant) -> None:
    beta.add_transaction("Printing", "99999.00", note="secret job")
    alpha.add_transaction("Printing", "10.00", note="secret job")

    body = alpha.get("/transactions", params={"q": "secret"}).json()
    assert body["total"] == 1
    assert body["items"][0]["amount"] == "10.00"


def test_an_empty_search_is_no_search(alpha: Tenant) -> None:
    _seed(alpha)
    assert alpha.get("/transactions", params={"q": "   "}).json()["total"] == 4


def test_search_combines_with_the_other_filters(alpha: Tenant) -> None:
    _seed(alpha)
    body = alpha.get("/transactions", params={"q": "paper", "entry_type": "income"}).json()
    assert body["total"] == 0


def test_a_voided_entry_is_not_found(alpha: Tenant) -> None:
    created = alpha.add_transaction("Printing", "450.00", note="20 pages colour").json()
    alpha.post(f"/transactions/{created['id']}/void")

    assert alpha.get("/transactions", params={"q": "colour"}).json()["total"] == 0
