"""Hero equipment: each profile fetch adds a look per hero, and /explore/gear gives members' gear now, worn and owned."""
from datetime import datetime, timezone

import pytest

from server import db, gear, leaders, profiles


@pytest.fixture
def conn(tmp_path):
    return db.connect(tmp_path / "frosted.db")


def profile(tag, king_gear, at):
    eq = [{"name": n, "level": 10, "maxLevel": 18, "village": "home"} for n in ("Barbarian Puppet", "Rage Vial", "Earthquake Boots", "Spiky Ball")]
    return {"tag": tag, "name": tag, "townHallLevel": 16,
            "heroes": [{"name": "Barbarian King", "level": 90, "maxLevel": 105, "village": "home",
                        "equipment": [{"name": n, "level": 10, "maxLevel": 18} for n in king_gear]}],
            "heroEquipment": eq}


def test_each_fetch_adds_a_look_and_the_view_sums_them(conn, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: datetime(2026, 11, 14, 12, tzinfo=timezone.utc))
    monkeypatch.setattr(leaders, "members_by_tag", lambda c: {"#A": {"tag": "#A"}, "#B": {"tag": "#B"}})
    monkeypatch.setattr(profiles, "row", lambda m: {"tag": m["tag"], "name": m["tag"], "clan": "Fire", "th": 16})
    for at in ("2026-11-13T10:00:00Z", "2026-11-13T11:00:00Z", "2026-11-14T10:00:00Z"):
        profiles.upsert_profile(conn, profile("#A", ["Spiky Ball", "Earthquake Boots"], at), at)
    profiles.upsert_profile(conn, profile("#B", ["Rage Vial", "Spiky Ball"], "2026-11-14T10:00:00Z"), "2026-11-14T10:00:00Z")
    profiles.upsert_profile(conn, profile("#GONE", ["Rage Vial", "Spiky Ball"], "2026-11-14T10:00:00Z"), "2026-11-14T10:00:00Z")
    v = gear.view(conn, 30)
    assert v["since"] == "2026-11-13" and v["from"] == "2026-10-16"
    assert v["now"] == [["#A", "Barbarian King", ["Earthquake Boots", "Spiky Ball"]], ["#B", "Barbarian King", ["Rage Vial", "Spiky Ball"]]]
    assert sorted(v["worn"]) == [["#A", "Barbarian King", ["Earthquake Boots", "Spiky Ball"], 3], ["#B", "Barbarian King", ["Rage Vial", "Spiky Ball"], 1]]
    assert [p[0] for p in v["owned"]["#A"]] == ["Barbarian Puppet", "Rage Vial", "Earthquake Boots", "Spiky Ball"]
    assert "#GONE" not in v["owned"]  # members only
    # A window that starts after the first day leaves its looks out.
    assert sorted(w[3] for w in gear.view(conn, 1)["worn"]) == [1, 1]


def test_no_database_is_empty():
    assert gear.view(None)["now"] == []


def test_a_card_gets_the_familys_top_pair_and_how_many_share_its_own(conn):
    for tag, pair in (("#A", ["Spiky Ball", "Earthquake Boots"]), ("#B", ["Earthquake Boots", "Spiky Ball"]), ("#C", ["Rage Vial", "Spiky Ball"])):
        profiles.upsert_profile(conn, profile(tag, pair, "2026-11-13T10:00:00Z"), "2026-11-13T10:00:00Z")
    counts = gear.pairs_now(conn, {"#A", "#B", "#C"})["Barbarian King"]
    # #C runs Rage Vial + Spiky Ball alone; a visitor running it would have one other beside them.
    assert gear.family_pick(counts, ["Spiky Ball", "Rage Vial"], True) == {"top": ["Earthquake Boots", "Spiky Ball"], "runs": 2, "of": 3, "others": 0}
    assert gear.family_pick(counts, ["Spiky Ball", "Rage Vial"], False)["others"] == 1
    assert gear.family_pick({}, ["Spiky Ball"], True) is None
