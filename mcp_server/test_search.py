from retrieval import search_sop_manuals


def test_late_checkout_search():
    results = search_sop_manuals(
        "VIP late checkout"
    )

    assert results
    assert results[0]["document"] == "late_checkout_policy.md"


def test_lost_and_found_search():
    results = search_sop_manuals(
        "What should I do with a passport?"
    )

    assert results
    assert results[0]["document"] == "lost_and_found.md"


def test_room_upgrade_search():
    results = search_sop_manuals(
        "Can I upgrade a VIP guest?"
    )

    assert results
    assert results[0]["document"] == "room_upgrade_policy.md"


def test_empty_query():
    results = search_sop_manuals("")

    assert results == []