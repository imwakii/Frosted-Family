"""Upgrade feed, inactivity watch, make-room list and the leaders' passcode, on a fixed timeline: profiles fetched
at T0 and again at T1 with a few changes, read at NOW."""
import json
from datetime import datetime, timezone

import pytest

from server import auth, db, leaders, profiles
from test_leaders import client, env, raw  # noqa: F401  (fixtures)
from test_server import CAKE, FIRE, FIX, FLAKES

T0, T1 = "2026-11-01T00:00:00Z", "2026-11-05T10:00:00Z"
NOW = datetime(2026, 11, 10, tzinfo=timezone.utc)
PASS = "correct-horse-battery-staple"
SESSION_VARS = ("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID", "DISCORD_LEADER_ROLE_IDS",
                "DISCORD_PUBLISHER_ID", "SESSION_SECRET")


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


@pytest.fixture
def timeline(env, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: NOW)
    conn = db.connect(env / "frosted.db")
    with conn:
        for clan, f in ((FIRE, "members_fire.json"), (CAKE, "members_cake.json"), (FLAKES, "members_flakes.json")):
            db.upsert_members(conn, clan, fixture(f)["items"], T0)
        db.upsert_war(conn, fixture("cwl_war_fire_day1.json"), kind="cwl", war_tag="#8QPY2LGR0", season="2026-11",
                      round_no=1)
        db.upsert_war(conn, fixture("cwl_war_fire_day2.json"), kind="cwl", war_tag="#2Y0QRLJ8P", season="2026-11",
                      round_no=2)
        db.upsert_war(conn, fixture("currentwar_cake_ended.json"), kind="regular")
        waki, maki, flake = (fixture(f"player_{t}.json") for t in ("R2PPV8CL", "CGJ8YR8J", "YU2RQ8LC"))
        for p in (waki, maki, flake):
            profiles.upsert_profile(conn, p, T0)
        conn.execute("INSERT INTO profile_runs VALUES (?, 3)", (T0,))
        # T1: Waki levels the King and unlocks a troop; flake reaches TH15. Maki only loses trophies on defense and
        # has donations reset by the new season: neither is activity.
        waki["heroes"][0]["level"] = 101
        waki["troops"].append({"name": "Electro Titan", "level": 1, "maxLevel": 4, "village": "home"})
        flake["townHallLevel"] = 15
        maki.update(trophies=5100, donations=0, donationsReceived=0)
        for p in (waki, maki, flake):
            profiles.upsert_profile(conn, p, T1)
        conn.execute("INSERT INTO profile_runs VALUES (?, 3)", (T1,))
    conn.close()
    return env


@pytest.fixture(autouse=True)
def clear_rate_limit():
    auth._failures.clear()


@pytest.fixture
def passcode_only(timeline, monkeypatch):
    """Discord not set up; the leaders' passcode is."""
    for k in SESSION_VARS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LEADER_PASSCODE", PASS)
    return timeline


def leader_client():
    c = client()
    assert c.post("/auth/passcode", json={"passcode": PASS}).status_code == 204
    return c, {"X-CSRF-Token": c.get("/auth/me").json()["csrf"]}


# ─── upgrade feed ─────────────────────────────────────────────────────────────

def test_upgrades_list_changes_after_the_first_snapshot(timeline):
    body = client().get("/explore/upgrades", params={"days": 30}).json()
    got = {(u["name"], u["unit"], u["category"], u["change"], u["from"], u["to"], u["at"]) for u in body["upgrades"]}
    assert got == {("Waki renamed", "Barbarian King", "hero", "level_up", 100, 101, T1),
                   ("Waki renamed", "Electro Titan", "troop", "unlock", 0, 1, T1),
                   ("flake", "Town Hall", "town_hall", "level_up", 14, 15, T1)}
    assert body["upgrades"][0]["clan"] in ("Fire", "Flakes") and body["upgrades"][0]["th"]


def test_upgrades_filter_by_clan_and_days(timeline):
    fire = client().get("/explore/upgrades", params={"days": 30, "clan": "Fire"}).json()["upgrades"]
    assert {u["unit"] for u in fire} == {"Barbarian King", "Electro Titan"}
    assert client().get("/explore/upgrades", params={"days": 1}).json()["upgrades"] == []  # T1 is 4 days back
    assert client().get("/explore/upgrades", params={"clan": "Ice"}).status_code == 422


# ─── leaders' passcode ────────────────────────────────────────────────────────

def test_leaders_endpoints_401_without_a_passcode(timeline, monkeypatch):
    for k in SESSION_VARS:
        monkeypatch.delenv(k, raising=False)
    assert client().get("/leaders/inactivity").status_code == 401
    assert client().post("/auth/passcode", json={"passcode": "anything"}).status_code == 401
    assert client().get("/auth/me").json()["passcode_enabled"] is False


def test_passcode_signs_in_a_leader_who_cannot_publish(passcode_only):
    assert client().post("/auth/passcode", json={"passcode": "wrong"}).status_code == 401
    c, csrf = leader_client()
    me = c.get("/auth/me").json()
    assert (me["role"], me["via"], me["user"]["name"], me["configured"]) == ("leader", "passcode", "Leader", False)
    assert c.get("/leaders/inactivity").status_code == 200
    assert c.post("/plan/publish", json={"moves": []}, headers=csrf).status_code == 403
    assert c.put("/plan/draft", json={"moves": []}, headers=csrf).status_code == 200


def test_passcode_tries_are_rate_limited(passcode_only):
    c = client()
    for _ in range(auth.PASSCODE_PER_CLIENT):
        assert c.post("/auth/passcode", json={"passcode": "guess"}).status_code == 401
    assert c.post("/auth/passcode", json={"passcode": PASS}).status_code == 429


def test_removing_the_passcode_ends_its_sessions(passcode_only, monkeypatch):
    c, _ = leader_client()
    monkeypatch.delenv("LEADER_PASSCODE")
    assert c.get("/leaders/inactivity").status_code == 401


def test_changing_the_passcode_ends_its_sessions(passcode_only, monkeypatch):
    c, _ = leader_client()
    monkeypatch.setenv("LEADER_PASSCODE", "a-new-passcode")
    assert c.get("/leaders/inactivity").status_code == 401


# ─── inactivity ───────────────────────────────────────────────────────────────

def test_inactivity_per_member(passcode_only, raw):
    c, _ = leader_client()
    rows = {r["name"]: r for r in c.get("/leaders/inactivity").json()["players"]}
    assert (rows["Waki renamed"]["last_active"], rows["Waki renamed"]["days_inactive"]) == (T1, 4)
    # Maki showed no activity since tracking began (a trophy drop and a season reset only): 9 days is a floor.
    assert rows["Maki"]["last_active"] is None and rows["Maki"]["days_inactive"] == 9
    assert rows["Maki"]["inactive_at_least"] is True and rows["Maki"]["tracking_since"] == T0
    # Last war attack: recorded wars, or the export's "Date last war" when later (29 Oct in the raw fixture).
    assert rows["Waki renamed"]["last_war_attack"] == "2026-11-04"
    assert rows["Maki"]["last_war_attack"] == "2026-10-29"
    assert rows["Maki"]["donations"] == 0 and rows["Maki"]["missed_attacks_recorded"] == 1
    assert rows["newbie"]["days_inactive"] is None and rows["newbie"]["missed_attacks_recorded"] == 1
    assert c.get("/leaders/inactivity").headers["cache-control"] == "no-store, private"


# ─── make room ────────────────────────────────────────────────────────────────

def test_make_room_lists_reasons_and_never_decides(passcode_only):
    c, _ = leader_client()
    fire = c.get("/leaders/make-room", params={"clan": "Fire"}).json()
    assert (fire["members"], fire["cap"]) == (2, 50)
    rows = {r["name"]: r for r in fire["players"]}
    assert {r["code"]: r["value"] for r in rows["newbie"]["reasons"]} == {
        "missed_recent": 1, "low_th_for_clan": 17, "new_and_unproven": "not on the roster"}
    assert rows["Waki renamed"]["reasons"] == [] and rows["Waki renamed"]["score"] == 0
    assert fire["players"][0]["name"] == "newbie"
    cake = c.get("/leaders/make-room", params={"clan": "Cake"}).json()["players"]
    # Inactivity weighs heaviest: Maki's 9 idle days (27) plus no donations (10) outrank cake two's one reason (10).
    assert [(r["name"], r["score"]) for r in cake] == [("Maki", 37), ("cake two", 10)]
    assert cake[0]["reasons"] == [{"code": "inactive_days", "value": 9}, {"code": "no_donations", "value": 0}]
    assert c.get("/leaders/make-room", params={"clan": "Ice"}).status_code == 422


def test_reason_codes_from_the_roster():
    m = {"fetched_at": T1, "donations": 0, "town_hall": 15, "snap_th": 15}
    alloc = {"flag_high_miss": "True", "miss_pct": "31.5", "cwl_slot": "Sitting Out", "tier": "NO DATA"}
    codes = {r["code"]: r["value"] for r in leaders.reasons_for(m, "Cake", {"days_inactive": 2}, alloc, 0)}
    assert codes == {"high_miss": 31.5, "sitting_out": None, "no_donations": 0, "low_th_for_clan": 15,
                     "new_and_unproven": "NO DATA"}
    # Flakes sits out CWL by choice and has no TH floor.
    assert leaders.reasons_for(m, "Flakes", {}, {**alloc, "flag_high_miss": "False", "tier": "PROVEN"}, 0) == \
        [{"code": "no_donations", "value": 0}]


def test_what_counts_as_activity():
    base = {"town_hall": 17, "exp_level": 200, "attack_wins": 5, "war_stars": 900, "capital_contributions": 1000,
            "unit_levels": 400, "donations": 50, "donations_received": 20, "trophies": 5000, "builder_trophies": 3000}
    assert not leaders.was_active(base, {**base, "trophies": 4950, "builder_trophies": 3100})
    assert not leaders.was_active(base, {**base, "donations": 0, "donations_received": 0})  # season reset
    assert leaders.was_active(base, {**base, "donations": 51})
    assert leaders.was_active(base, {**base, "donations_received": 21})
    for k in ("town_hall", "exp_level", "attack_wins", "war_stars", "capital_contributions", "unit_levels"):
        assert leaders.was_active(base, {**base, k: base[k] + 1})
