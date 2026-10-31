"""New and departed members in /roster, the suggested slot for new members, and the war record's history label.
Fire is polled at P1 and P2, 40 minutes apart; Cake's member call has failed since P1."""
import pytest

from server import db, members, profiles
from test_leader_tools import hero_player
from test_leaders import client, env  # noqa: F401  (fixtures)
from test_server import CAKE, FIRE, FLAKES

P1, P2 = "2026-11-10T00:00:00Z", "2026-11-10T00:40:00Z"
WAKI, FIRE_LEFT, FIRE_NEVER, CAKE_STAYS = "#R2PPV8CL", "#J8LJUQUV", "#2YJC8C8L", "#8Y99LCLQ"  # all in the CSV


def member(tag, name, th):
    return {"tag": tag, "name": name, "townHallLevel": th}


@pytest.fixture
def family(env):
    conn = db.connect(env / "frosted.db")
    fire_p1 = [member(WAKI, "Waki", 18), member(FIRE_LEFT, "gone", 17), member("#2NEW1", "Newbie One", 18),
               member("#2NEW2", "Newbie Two", 17), member("#2ZZZ", "Zed", 18), member("#2GONE", "Brief", 14)]
    fire_p2 = [m for m in fire_p1 if m["tag"] not in (FIRE_LEFT, "#2GONE")]
    with conn:
        db.upsert_members(conn, FIRE, fire_p1, P1)
        db.upsert_members(conn, FIRE, fire_p2, P2)
        db.upsert_members(conn, CAKE, [member(CAKE_STAYS, "cake regular", 17), member("#2NEW3", "Newbie Three", 16)],
                          P1)
        db.upsert_members(conn, FLAKES, [member("#2NEW4", "Flake New", 12)], P2)
        for tag, name, th, heroes in ((WAKI, "Waki", 18, [100, 100]), ("#2NEW1", "Newbie One", 18, [95, 95]),
                                      ("#2ZZZ", "Zed", 18, [100, 100]), ("#2NEW2", "Newbie Two", 17, [80, 80]),
                                      ("#2NEW3", "Newbie Three", 16, [30, 30])):
            profiles.upsert_profile(conn, hero_player(tag, name, th, heroes), P2)
    conn.close()
    return env


def by_tag(body):
    return {p["tag"]: p for p in body["players"]}


def test_departed_csv_players_are_flagged(family):
    rows = by_tag(client().get("/roster").json())
    assert rows[WAKI]["left"] is False and rows[WAKI]["new"] is False
    assert rows[FIRE_LEFT]["left"] is True      # missing from Fire's polls for 40 minutes
    assert rows[FIRE_NEVER]["left"] is True     # never seen by the collector
    assert rows[CAKE_STAYS]["left"] is False    # Cake has not been polled since: not counted against its members
    assert all(r["left"] is None for r in rows.values() if not r["tag"])


def test_new_members_appear_with_a_suggestion(family):
    rows = by_tag(client().get("/roster").json())
    one = rows["#2NEW1"]
    assert (one["clan"], one["cwl_slot"], one["tier"], one["final_score"], one["new"]) == ("Fire", "New", "NEW", None, True)
    assert (one["joined_at"], one["history"], one["current_th"]) == (P1, "recorded only", 18)
    # TH18 peers (Waki 200, Zed 200, Newbie One 190): median 200, so 95%.
    assert one["suggested_slot"] == "SUB" and "95%" in one["suggested_reason"]
    assert rows["#2ZZZ"]["suggested_slot"] == "SUB"
    assert (rows["#2NEW2"]["suggested_slot"], rows["#2NEW2"]["suggested_reason"]) == \
        ("Sitting Out", "TH17 is below Fire's TH18 floor")
    three = rows["#2NEW3"]  # alone at TH16: compared with TH15-17, so the cohort is thin
    assert three["suggested_slot"] == "Sitting Out" and "thin cohort" in three["suggested_reason"]
    assert rows["#2NEW4"]["suggested_slot"] == "Sitting Out" and "sits out CWL" in rows["#2NEW4"]["suggested_reason"]
    assert "#2GONE" not in rows  # joined and left between polls: not live, not listed


def test_suggestion_never_touches_the_csv(family, repo):
    before = (family / "roster.csv").read_bytes()
    client().get("/roster")
    assert (family / "roster.csv").read_bytes() == before


def test_suggest_rules():
    peers = {"hero_pct": 84.9, "cohort_th": 16, "cohort_n": 5, "cohort": "same_th"}
    assert members.suggest("Cake", 16, peers)[0] == "Sitting Out"
    assert members.suggest("Cake", 16, {**peers, "hero_pct": 85.0})[0] == "SUB"
    assert members.suggest("Cake", 16, None) == ("Sitting Out", "no profile yet, so hero strength is unknown")


def test_war_record_says_new_members_have_recorded_history_only(family):
    rows = by_tag(client().get("/explore/war").json())
    assert rows["#2NEW1"]["history"] == "recorded only"
