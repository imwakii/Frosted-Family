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
    monkeypatch.setattr(leaders, "DONATIONS_SETTLE_DAY", 0)
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
    """Discord not set up; the leaders' passcode is, and the leaders' lists are locked again (LEADERS_PUBLIC=false)."""
    for k in SESSION_VARS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LEADER_PASSCODE", PASS)
    monkeypatch.setenv("LEADERS_PUBLIC", "false")
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


def test_upgrade_board_counts_each_kind(timeline):
    with db.connect(timeline / "frosted.db") as conn:
        waki = next(r for r in leaders.upgrade_board(conn) if r["tag"] == "#R2PPV8CL")
    assert waki["month"] == sum(k["month"] for k in waki["kinds"].values())
    assert waki["week"] == sum(k["week"] for k in waki["kinds"].values())
    assert {"hero", "troop"} <= set(waki["kinds"])


def test_upgrades_filter_by_clan_and_days(timeline):
    fire = client().get("/explore/upgrades", params={"days": 30, "clan": "Fire"}).json()["upgrades"]
    assert {u["unit"] for u in fire} == {"Barbarian King", "Electro Titan"}
    assert client().get("/explore/upgrades", params={"days": 1}).json()["upgrades"] == []  # T1 is 4 days back
    assert client().get("/explore/upgrades", params={"clan": "Ice"}).status_code == 422


# ─── leaders' passcode ────────────────────────────────────────────────────────

def test_leaders_lists_are_public_by_default(timeline, monkeypatch):
    for k in SESSION_VARS:
        monkeypatch.delenv(k, raising=False)
    assert client().get("/leaders/inactivity").status_code == 200
    assert client().get("/leaders/make-room", params={"clan": "Fire"}).status_code == 200
    # Opening the lists opens nothing else: plan writes still need a session.
    assert client().put("/plan/draft", json={"moves": []}).status_code == 401


def test_leaders_endpoints_401_when_locked_without_a_passcode(timeline, monkeypatch):
    for k in SESSION_VARS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LEADERS_PUBLIC", "false")
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
    # Plan writes wait for Discord: a passcode session cannot save a draft.
    assert c.put("/plan/draft", json={"moves": []}, headers=csrf).status_code == 403


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
    assert rows["Waki renamed"]["reasons"] == [] and "score" not in rows["Waki renamed"]
    # Activity first: Waki was last active 4 days ago (3 to 6); newbie has no profile yet, so counts as active.
    assert [(r["name"], r["activity"], r["position"]) for r in fire["players"]] == [
        ("Waki renamed", "inactive_3_to_6", 1), ("newbie", "active", 2)]
    # Only Waki and Maki are TH18, so the comparison widens to TH17-19 and is marked thin.
    waki = rows["Waki renamed"]
    assert (waki["hero_levels"], waki["hero_pct"], waki["cohort_th"], waki["cohort_n"], waki["cohort"]) == \
        (201, 104.1, 18, 2, "thin")
    assert rows["newbie"]["hero_pct"] is None
    cake = c.get("/leaders/make-room", params={"clan": "Cake"}).json()["players"]
    assert [(r["name"], r["activity"]) for r in cake] == [("Maki", "inactive_7_to_13"), ("cake two", "active")]
    assert cake[0]["reasons"] == [{"code": "inactive_days", "value": 9}, {"code": "no_donations", "value": 0}]
    assert c.get("/leaders/make-room", params={"clan": "Ice"}).status_code == 422


def hero_player(tag, name, th, levels, donations=10, wins=5):
    return {"tag": tag, "name": name, "townHallLevel": th, "clan": {"tag": FIRE}, "donations": donations,
            "donationsReceived": 0, "attackWins": wins, "warStars": 100, "expLevel": 200,
            "heroes": [{"name": f"Hero {i}", "level": lv, "maxLevel": 100, "village": "home"}
                       for i, lv in enumerate(levels)]}


@pytest.fixture
def fire_four(env, monkeypatch):
    """Four TH18s in Fire. D is idle 20 days with the strongest heroes; A and C tie on heroes, C gives nothing."""
    monkeypatch.setattr(leaders, "now", lambda: NOW)
    monkeypatch.setattr(leaders, "DONATIONS_SETTLE_DAY", 0)
    monkeypatch.setenv("LEADERS_PUBLIC", "true")
    players = {"#2A": ("A", [75, 75], 10), "#2B": ("B", [100, 100], 10), "#2C": ("C", [75, 75], 0),
               "#2D": ("D", [110, 110], 10)}
    conn = db.connect(env / "frosted.db")
    with conn:
        db.upsert_members(conn, FIRE, [{"tag": t, "name": n, "townHallLevel": 18} for t, (n, _, _) in players.items()],
                          "2026-11-09T00:00:00Z")
        for t, (n, lv, don) in players.items():
            profiles.upsert_profile(conn, hero_player(t, n, 18, lv, don), "2026-10-21T00:00:00Z")
            if t != "#2D":  # D never changes again
                profiles.upsert_profile(conn, hero_player(t, n, 18, lv, don, wins=6), "2026-11-09T00:00:00Z")
        conn.execute("INSERT INTO profile_runs VALUES ('2026-11-09T00:00:00Z', 4)")
    conn.close()
    return env


def test_make_room_activity_then_weakest_heroes_then_tie_breaks(fire_four):
    players = client().get("/leaders/make-room", params={"clan": "Fire"}).json()["players"]
    # Median of 150, 150, 200, 220 is 175. D is idle 20 days, so first despite the strongest heroes. Among the active,
    # A and C tie at 85.7%; C gives no donations, the first tie-break that differs, so C goes before A.
    assert [(p["name"], p["activity"], p["hero_pct"]) for p in players] == [
        ("D", "inactive_14_plus", 125.7), ("C", "active", 85.7), ("A", "active", 85.7), ("B", "active", 114.3)]
    assert {p["cohort"] for p in players} == {"same_th"} and {p["cohort_n"] for p in players} == {4}
    assert players[0]["inactive_at_least"] is True and players[0]["days_inactive"] == 20


def test_activity_buckets():
    assert [leaders.bucket(d)[1] for d in (None, 0, 2, 3, 6, 7, 13, 14, 90)] == [
        "active", "active", "active", "inactive_3_to_6", "inactive_3_to_6", "inactive_7_to_13",
        "inactive_7_to_13", "inactive_14_plus", "inactive_14_plus"]


def test_thin_cohort_scales_by_unlocked_heroes(env):
    # One TH16 with two heroes beside three TH17s with three: the TH15-17 cohort's median sum (300) is scaled by
    # 200/300 of hero max levels, so 180 levels reads as 90% rather than 60%.
    conn = db.connect(env / "frosted.db")
    with conn:
        people = {"#3A": ("A", 17, [100, 100, 100]), "#3B": ("B", 17, [100, 100, 100]),
                  "#3C": ("C", 17, [100, 100, 100]), "#3D": ("D", 16, [90, 90])}
        db.upsert_members(conn, FIRE, [{"tag": t, "name": n} for t, (n, _, _) in people.items()], T0)
        for t, (n, th, lv) in people.items():
            profiles.upsert_profile(conn, hero_player(t, n, th, lv), T0)
    s = leaders.hero_strength(conn)
    assert (s["#3D"]["hero_pct"], s["#3D"]["cohort"], s["#3D"]["cohort_n"]) == (90.0, "thin", 4)
    assert (s["#3A"]["hero_pct"], s["#3A"]["cohort"], s["#3A"]["cohort_n"]) == (100.0, "same_th", 3)


def test_reason_codes_from_the_roster(monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: NOW)
    monkeypatch.setattr(leaders, "DONATIONS_SETTLE_DAY", 0)
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
    assert not leaders.was_active(base, {**base, "donations": 0, "donations_received": 0, "attack_wins": 0})  # season reset
    assert leaders.was_active(base, {**base, "donations": 51})
    assert leaders.was_active(base, {**base, "donations_received": 21})
    for k in ("town_hall", "exp_level", "attack_wins", "war_stars", "capital_contributions", "unit_levels"):
        assert leaders.was_active(base, {**base, k: base[k] + 1})


def test_donations_say_nothing_early_in_a_month_and_upgrades_break_ties(fire_four, monkeypatch):
    monkeypatch.setattr(leaders, "DONATIONS_SETTLE_DAY", 14)
    players = client().get("/leaders/make-room", params={"clan": "Fire"}).json()["players"]
    assert not any(r["code"] == "no_donations" for p in players for r in p["reasons"])
    assert all("last_upgrade" in p and "upgrades_30d" in p for p in players)
    # Equal activity and heroes: whoever has upgraded goes below whoever has not.
    tagged = {p["tag"]: p for p in players}
    a, b = list(tagged)[:2]
    monkeypatch.setattr(leaders, "upgrade_board", lambda conn: [{"tag": a, "last": "2026-11-09T00:00:00Z", "month": 2}])
    monkeypatch.setattr(leaders, "hero_strength", lambda conn: {})
    monkeypatch.setattr(leaders, "activity", lambda conn: {})
    order = [p["tag"] for p in client().get("/leaders/make-room", params={"clan": "Fire"}).json()["players"]]
    assert order[-1] == a
    assert next(p for p in client().get("/leaders/make-room", params={"clan": "Fire"}).json()["players"] if p["tag"] == a)["upgrades_30d"] == 2
