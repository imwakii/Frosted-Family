"""The war collector and read API, against fixture JSON in the official API's response shape. No live calls: every
request goes through httpx.MockTransport, and a request with no fixture fails the test."""
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from server import api, collect, db

FIX = Path(__file__).resolve().parent / "fixtures" / "coc"
FIRE, CAKE, FLAKES = "#CL0G80LV", "#20CU2R80R", "#2JJYV0JVV"

ROUTES = {
    "/v1/clans/%23CL0G80LV/members": "members_fire.json",
    "/v1/clans/%2320CU2R80R/members": "members_cake.json",
    "/v1/clans/%232JJYV0JVV/members": "members_flakes.json",
    "/v1/clans/%23CL0G80LV/currentwar": "currentwar_notinwar.json",
    "/v1/clans/%2320CU2R80R/currentwar": "currentwar_cake_ended.json",
    "/v1/clans/%232JJYV0JVV/currentwar": 403,           # war log private
    "/v1/clans/%23CL0G80LV/currentwar/leaguegroup": "leaguegroup.json",
    "/v1/clans/%2320CU2R80R/currentwar/leaguegroup": 404,
    "/v1/clans/%232JJYV0JVV/currentwar/leaguegroup": 404,  # Flakes sits out CWL
    "/v1/clanwarleagues/wars/%238QPY2LGR0": "cwl_war_fire_day1.json",
    "/v1/clanwarleagues/wars/%239RJ2C80GQ": "cwl_war_others.json",
    "/v1/clanwarleagues/wars/%232Y0QRLJ8P": "cwl_war_fire_day2.json",
    "/v1/clans/%23CL0G80LV/capitalraidseasons?limit=1": "raids_fire.json",
    "/v1/clans/%2320CU2R80R/capitalraidseasons?limit=1": 404,
    "/v1/clans/%232JJYV0JVV/capitalraidseasons?limit=1": 403,
    "/v1/clans/%23CL0G80LV": "clan_fire.json",
    "/v1/clans/%2320CU2R80R": "clan_cake.json",
    "/v1/clans/%232JJYV0JVV": 404,
}


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


class Recorder:
    def __init__(self, routes=ROUTES):
        self.routes = routes
        self.paths = []

    def __call__(self, request):
        path = request.url.raw_path.decode()
        self.paths.append(path)
        if path.startswith("/v1/players/%23") and path not in self.routes:
            profile = FIX / f"player_{path.rsplit('%23', 1)[1]}.json"
            return httpx.Response(200, json=fixture(profile.name)) if profile.exists() else httpx.Response(404)
        if path.startswith("/v1/clans/%23") and path.count("/") == 3 and path not in self.routes:
            return httpx.Response(404)  # a league group's other clans, for their cards
        target = self.routes[path]  # KeyError: an unexpected call fails the test
        if isinstance(target, int):
            return httpx.Response(target, json={"reason": "accessDenied" if target == 403 else "notFound"})
        return httpx.Response(200, json=fixture(target))


def poll(conn, recorder):
    with httpx.Client(base_url=collect.API, transport=httpx.MockTransport(recorder)) as client:
        return collect.run(conn, client)


def counts(conn):
    return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("member_snapshots", "wars", "war_members", "attacks", "cwl_war_tags")}


@pytest.fixture(autouse=True)
def app_db(tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_APP_DB", str(tmp_path / "app.db"))


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "frosted.db")
    yield c
    c.close()


# ─── idempotent upserts ──────────────────────────────────────────────────────

def test_repolling_adds_nothing(conn):
    first_rec, second_rec = Recorder(), Recorder()
    first = poll(conn, first_rec)
    after_first = counts(conn)
    poll(conn, second_rec)
    assert counts(conn) == after_first
    # Profiles are fetched on the first pass only: the next is due 12 hours later.
    assert sum("/players/" in p for p in first_rec.paths) == 5
    assert not any("/players/" in p for p in second_rec.paths)
    assert first.errors == 0  # the 403 and 404s are quiet
    # 5 members; Cake's regular war and Fire's two CWL wars; the other clans' war is not stored
    assert after_first == {"member_snapshots": 5, "wars": 3, "war_members": 12, "attacks": 9, "cwl_war_tags": 3}


def test_upsert_war_twice_keeps_one_copy_and_updates_score(conn):
    war = fixture("cwl_war_fire_day2.json")
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#2Y0QRLJ8P", season="2026-11", round_no=2)
    war["clan"]["stars"] = 6
    war["clan"]["members"][1]["attacks"] = [{"attackerTag": "#Q8VJ2L0C", "defenderTag": "#8L0QYJ2V", "stars": 3,
                                             "destructionPercentage": 100, "order": 2, "duration": 120}]
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#2Y0QRLJ8P", season="2026-11", round_no=2)
    assert counts(conn)["wars"] == 1
    assert conn.execute("SELECT clan_stars FROM wars").fetchone()[0] == 6
    assert conn.execute("SELECT COUNT(*) FROM attacks").fetchone()[0] == 2


def test_ended_and_foreign_cwl_wars_are_not_refetched(conn):
    poll(conn, Recorder())
    second = Recorder()
    poll(conn, second)
    wars = [p for p in second.paths if "/clanwarleagues/wars/" in p]  # profiles are not due on the second pass
    assert wars == ["/v1/clanwarleagues/wars/%232Y0QRLJ8P"]  # only the war still running


def test_bad_token_on_members_is_an_error(conn):
    routes = {**ROUTES, "/v1/clans/%23CL0G80LV/members": 403}
    assert poll(conn, Recorder(routes)).errors == 1


# ─── missed attacks ──────────────────────────────────────────────────────────

def test_missed_attacks_derived_from_ended_wars_only(conn):
    poll(conn, Recorder())
    missed = {(m["player_tag"], m["kind"]): m["missed"] for m in db.missed_attacks(conn, [FIRE, CAKE])}
    # newbie skipped CWL day 1; Maki used 1 of 2 in the regular war. Day 2 is still in war, so newbie's
    # unused attack there is not yet missed, and nobody who used every attack appears.
    assert missed == {("#Q8VJ2L0C", "cwl"): 1, ("#CGJ8YR8J", "regular"): 1}


def test_missed_attacks_default_when_payload_omits_attacks_per_member(conn):
    war = fixture("cwl_war_fire_day1.json")
    del war["attacksPerMember"]
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#8QPY2LGR0")
    assert [m["missed"] for m in db.missed_attacks(conn, [FIRE])] == [1]


# ─── API ─────────────────────────────────────────────────────────────────────

ROSTER_CSV = """row,tag,name,clan,cwl_slot,transferred_from,tier,final_score,current_th,flags
1,#R2PPV8CL,Waki,Fire,CORE,,PROVEN,122.19,18,
2,#CGJ8YR8J,Maki,Cake,CORE,,PROVEN,108.71,18,
3,#LJ2Q0Y9P,newbie,Fire,SUB,Flakes,NEW,0,17,NO DATA
4,,rudra,Cake,CORE,,NEW,0,18,
"""


@pytest.fixture
def client(conn, tmp_path, monkeypatch):
    poll(conn, Recorder())
    (tmp_path / "roster.csv").write_text(ROSTER_CSV, encoding="utf-8")
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "frosted.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(tmp_path / "roster.csv"))
    return TestClient(api.app)


def test_roster_joins_on_tag_never_name(client):
    players = {p["name"]: p for p in client.get("/roster").json()["players"] if not p["new"]}
    # Renamed in game: still joined, by tag.
    assert players["Waki"]["snapshot"]["name"] == "Waki renamed"
    assert players["Waki"]["snapshot"]["clan"] == "Fire"
    # Same name as a live member but a different tag: not joined.
    assert players["newbie"]["snapshot"] is None
    # No tag: listed, never joined.
    assert players["rudra"]["tag"] is None and players["rudra"]["snapshot"] is None
    # Allocation comes from the CSV untouched.
    assert (players["newbie"]["clan"], players["newbie"]["cwl_slot"], players["newbie"]["transferred_from"]) == \
        ("Fire", "SUB", "Flakes")


def test_roster_without_database(tmp_path, monkeypatch):
    (tmp_path / "roster.csv").write_text(ROSTER_CSV, encoding="utf-8")
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "absent.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(tmp_path / "roster.csv"))
    body = TestClient(api.app).get("/roster").json()
    assert len(body["players"]) == 4 and body["last_poll"] is None


def test_real_roster_loads(repo, roster, tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "absent.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(repo / "frosted_cwl_members.csv"))
    assert len(TestClient(api.app).get("/roster").json()["players"]) == len(roster)


def test_war_live_orients_each_clan(client):
    clans = {c["clan"]: c["war"] for c in client.get("/war/live").json()["clans"]}
    fire = clans["Fire"]
    # Day 2 is in war, so it wins over day 1; Fire is the API's "clan" side in this one.
    assert (fire["kind"], fire["day"], fire["state"], fire["opponent"]["name"]) == ("cwl", 2, "inWar", "Other A")
    assert (fire["stars"], fire["attacks_used"], fire["attacks_allowed"]) == (3, 1, 2)
    assert clans["Cake"]["kind"] == "regular" and clans["Cake"]["opponent"]["tag"] == "#2LQ8PYV0"
    assert clans["Flakes"] is None


def test_player_reports_wars_attacks_and_misses(client):
    body = client.get("/player/q8vj2l0c").json()  # case and missing # are normalised
    assert body["tag"] == "#Q8VJ2L0C" and body["allocation"] is None
    day1 = next(w for w in body["wars"] if w["day"] == 1)
    # Fire was the API's "opponent" side on day 1; the view is flipped to Fire's.
    assert (day1["clan"], day1["opponent"]["name"], day1["stars"], day1["attacks"]) == ("Fire", "Enemy", 3, [])
    assert body["missed_attacks"] == 1
    assert client.get("/player/%23R2PPV8CL").json()["allocation"]["name"] == "Waki"
    assert client.get("/player/%2399999999").status_code == 404


def test_clans_serves_badges_and_league(client):
    clans = {c["clan"]: c for c in client.get("/clans").json()["clans"]}
    assert clans["Fire"]["badge_urls"]["large"].endswith("/512/fire.png")
    assert clans["Fire"]["war_league"] == "Champion League III" and clans["Fire"]["members"] == 37
    assert clans["Cake"]["capital_league"] is None
    # Flakes' details 404ed: listed with nulls, never dropped.
    assert clans["Flakes"]["name"] is None and clans["Flakes"]["badge_urls"] == {"small": None, "medium": None,
                                                                                "large": None}


def test_leader_endpoints_refuse_until_auth_exists(client):
    assert client.get("/plan/draft").status_code == 401
    assert client.put("/plan/draft").status_code == 401
    assert client.post("/plan/publish", headers={"Authorization": "Bearer x"}).status_code == 401


def test_war_board_pairs_bases_and_shows_who_hit_whom(conn):
    from datetime import datetime, timezone
    from server import war
    poll(conn, Recorder())
    clans = {c["clan"]: c for c in war.board(conn, now=datetime(2026, 11, 4, 12, tzinfo=timezone.utc))["clans"]}
    fire = clans["Fire"]["war"]
    assert (fire["kind"], fire["state"], fire["day"], fire["attacks_allowed"]) == ("cwl", "inWar", 2, 1)
    assert clans["Flakes"]["war"] is None
    ours = [p["us"] for p in fire["pairs"] if p["us"]]
    assert {(m["name"], m["used"], m["allowed"]) for m in ours} == {("newbie", 0, 1), ("Waki renamed", 1, 1)}
    # The log says who hit whom, with stars and damage; the base they hit shows the best stars taken.
    hit = next(a for a in fire["log"] if a["attacker"]["name"] == "Waki renamed")
    assert hit["ours"] and {"stars", "destruction", "seen_at"} <= set(hit) and hit["seen_at"]
    base = next(p["them"] for p in fire["pairs"] if p["them"] and p["them"]["tag"] == hit["defender"]["tag"])
    assert base["best"] == hit["stars"]
    # Once its end has passed the war is over, and stays until the clan's next war, however long that takes.
    later = {c["clan"]: c for c in war.board(conn, now=datetime(2026, 11, 6, tzinfo=timezone.utc))["clans"]}
    assert later["Fire"]["war"]["state"] == "warEnded"
    months = {c["clan"]: c for c in war.board(conn, now=datetime(2027, 3, 1, tzinfo=timezone.utc))["clans"]}
    assert months["Fire"]["war"]["state"] == "warEnded"


def test_a_member_who_joins_between_profile_runs_is_fetched_on_the_next_pass(conn):
    poll(conn, Recorder())  # the first pass is an hourly profile run
    fetched = [t for (t,) in conn.execute("SELECT player_tag FROM player_profiles")]
    assert fetched
    # As if they joined after that run: no profile yet, first seen after it.
    with conn:
        for table in ("player_units", "player_profiles"):
            conn.execute(f"DELETE FROM {table} WHERE player_tag = ?", (fetched[0],))
        conn.execute("UPDATE member_first_seen SET first_seen = '2099-01-01T00:00:00Z' WHERE player_tag = ?",
                     (fetched[0],))
    second = Recorder()
    poll(conn, second)  # minutes later: not a profile run, but the one missing profile is fetched
    players = [p for p in second.paths if p.startswith("/v1/players/")]
    assert players == [f"/v1/players/%23{fetched[0].lstrip('#')}"]
    assert conn.execute("SELECT COUNT(*) FROM player_profiles WHERE player_tag = ?", (fetched[0],)).fetchone()[0] == 1


def test_day_planner_sees_each_cwl_day_with_lineup_and_stars(conn):
    from server import days
    poll(conn, Recorder())
    season = conn.execute("SELECT season FROM wars WHERE kind='cwl' LIMIT 1").fetchone()[0]
    fire = days.wars(conn, season)["Fire"]
    assert fire and all(set(w) >= {"state", "opponent", "opponent_th", "lineup", "stars", "missed"} for w in fire.values())
    day = fire[max(fire, key=int)]
    assert set(day["stars"]) <= set(day["lineup"])


def test_expected_enemy_is_the_mean_top_15_of_group_clans_not_yet_faced(conn, monkeypatch):
    from frosted.config import CLAN_TAGS
    from server import collect, days
    fire = CLAN_TAGS["Fire"]
    roster = lambda th: [{"tag": f"#{i}", "townHallLevel": th} for i in range(20)]
    group = {"season": "2031-01", "rounds": [], "clans": [
        {"tag": fire, "name": "Fire", "members": roster(18)},
        {"tag": "#A", "name": "Strong", "members": roster(18)},
        {"tag": "#B", "name": "Weak", "members": roster(14)},
        {"tag": "#C", "name": "Faced", "members": roster(10)}]}
    monkeypatch.setattr(collect, "collect_group_strength", lambda *a: None)
    monkeypatch.setattr(collect, "collect_group_profiles", lambda *a: None)
    collect.collect_league_group(conn, Recorder(), group, fire)
    assert days.upcoming(conn, "2031-01", "Fire", {"#C"}) == [16.0] * 15
    assert days.upcoming(conn, "2031-01", "Fire", {"#A", "#B", "#C"}) == []
    assert days.upcoming(conn, "2031-01", "Cake", set()) == []


def test_an_attack_stored_before_stamping_has_no_time(conn):
    from datetime import datetime, timezone
    from server import war
    poll(conn, Recorder())
    with conn:
        conn.execute("DELETE FROM attack_seen")
    poll(conn, Recorder())
    fire = next(c for c in war.board(conn, now=datetime(2026, 11, 4, 12, tzinfo=timezone.utc))["clans"] if c["clan"] == "Fire")["war"]
    assert fire["log"] and all(a["seen_at"] is None for a in fire["log"])


def test_the_minute_pass_only_touches_clans_with_a_war_on(conn):
    from datetime import datetime, timezone
    poll(conn, Recorder())
    minute = Recorder()
    with httpx.Client(base_url=collect.API, transport=httpx.MockTransport(minute)) as client:
        collect.run_wars(conn, client, now=datetime(2026, 11, 4, 12, tzinfo=timezone.utc))
    assert minute.paths and all("currentwar" in p or "clanwarleagues" in p for p in minute.paths)
    assert any("%23CL0G80LV" in p for p in minute.paths)  # Fire has a war on
    assert not any("%232JJYV0JVV" in p for p in minute.paths)  # Flakes does not

    # Long after the war's end, nothing is called.
    quiet = Recorder()
    with httpx.Client(base_url=collect.API, transport=httpx.MockTransport(quiet)) as client:
        collect.run_wars(conn, client, now=datetime(2027, 1, 1, tzinfo=timezone.utc))
    assert quiet.paths == []


def test_the_player_card_has_heroes_totals_attacks_and_upgrades(conn):
    from server import profiles
    poll(conn, Recorder())
    tag = conn.execute("SELECT attacker_tag FROM attacks WHERE attacker_tag IN (SELECT player_tag FROM player_profiles) LIMIT 1").fetchone()[0]
    card = profiles.player_card(conn, tag)
    assert card["heroes"] and {"name", "level", "max"} <= set(card["heroes"][0])
    assert card["war_stars"] is not None and "upgrades" in card
    hit = card["attacks"][0]
    assert {"stars", "destruction", "opponent", "target"} <= set(hit) and hit["opponent"]
    assert card["record"]["attacks"] >= 1 and {"from", "missed", "three_star_rate"} <= set(card["record"])
    assert card["tracked_from"]  # streaks say how far back they go
    nobody = profiles.player_card(conn, "#NOBODY")
    assert nobody["tracked_from"] == card["tracked_from"]
    del nobody["tracked_from"]
    del nobody["family_since"]
    assert nobody == {
        "heroes": [], "attacks": [], "upgrades": [], "badges": [], "record": None, "war_stars": None, "donations": None,
        "donations_received": None, "capital": None,
        "streaks": {"three_stars": 0, "three_stars_best": 0, "clean_wars": 0}}


def _attack(conn, key, order, tag, stars):
    conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", (key, order, tag, "#D", "#C", stars, 90.0, 60))


def _war(conn, key, prep, state="warEnded"):
    conn.execute("""INSERT INTO wars (war_key, kind, state, attacks_per_member, preparation_start, clan_tag, opponent_tag, updated_at)
                    VALUES (?,'regular',?,2,?,'#C','#O','x')""", (key, state, prep))


def test_streaks_count_the_current_and_best_runs_and_clean_wars(conn):
    from server import profiles
    with conn:
        _war(conn, "old", "2026-01"), _war(conn, "mid", "2026-02"), _war(conn, "new", "2026-03")
        # Oldest first: 3, 3, 3, 1, then 3, 3: a best run of three, and two right now.
        for key, order, stars in (("old", 1, 3), ("old", 2, 3), ("mid", 1, 3), ("mid", 2, 1), ("new", 1, 3), ("new", 2, 3)):
            _attack(conn, key, order, "#P", stars)
        # All attacks used in the newest two; one missed in the oldest.
        for key, used in (("old", 1), ("mid", 2), ("new", 2)):
            conn.execute("INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)", (key, "#P", "#C", "P", 18, 1, used, 0))
    assert profiles.streaks_for(conn, "#P") == {"three_stars": 2, "three_stars_best": 3, "clean_wars": 2}


def test_badges_are_earned_at_a_tier_gold_first(conn, monkeypatch):
    from server import profiles
    war = lambda attacks, three, missed, conceded, defenses=30: {
        "attacks": attacks, "three_star_rate": three, "missed": missed,
        "defense": {"defenses": defenses, "avg_stars_conceded": conceded}}
    rows = [{"tag": "#ACE", "war": war(60, 0.92, 0, 1.0)}, {"tag": "#NEW", "war": war(5, 1.0, 0, 3.0, defenses=2)}]
    rows += [{"tag": f"#X{i}", "war": war(40, 0.5, 3, 1.5 + i / 10)} for i in range(30)]
    monkeypatch.setattr(profiles, "war_record", lambda c: {"players": rows})
    monkeypatch.setattr(profiles, "current_members", lambda c: [{"tag": t, "donations": d} for t, d in (("#ACE", 900), ("#X1", 800), ("#X0", 0))])
    tiers = lambda tag, heroes=(): {b["id"]: b["tier"] for b in profiles.badges_for(conn, tag, list(heroes))}
    h = lambda level: [{"level": level, "max": 100}]
    assert tiers("#ACE", h(100)) == {"sharpshooter": "gold", "never_misses": "silver", "wall": "gold", "top_donor": "gold", "maxed_heroes": "gold"}
    assert tiers("#NEW") == {}  # too few attacks or defences to count
    # Places: ACE first, then X0 second, so X3 is fifth (gold), X4 sixth (silver), X9 eleventh (bronze), X19 past it.
    assert tiers("#X3")["wall"] == "gold" and tiers("#X4")["wall"] == "silver" and tiers("#X9")["wall"] == "bronze"
    assert "wall" not in tiers("#X19")
    assert tiers("#X1")["top_donor"] == "silver"
    assert tiers("#X0", h(99))["maxed_heroes"] == "silver" and tiers("#X0", h(95))["maxed_heroes"] == "bronze"
    assert "maxed_heroes" not in tiers("#X0", h(90))
    order = [b["tier"] for b in profiles.badges_for(conn, "#X3", h(95))]
    assert order == sorted(order, key=lambda t: -profiles.TIERS.index(t))


def test_tier_lines():
    from server.profiles import tier_by_rank, tier_of
    assert tier_of(0.79, (0.8, 0.85, 0.9)) is None and tier_of(0.8, (0.8, 0.85, 0.9)) == "bronze"
    assert tier_of(0.9, (0.8, 0.85, 0.9)) == "gold"
    assert tier_by_rank(1, (10, 3, 1)) == "gold" and tier_by_rank(3, (10, 3, 1)) == "silver"
    assert tier_by_rank(11, (10, 3, 1)) is None and tier_by_rank(None, (10, 3, 1)) is None


def test_the_badges_board_lists_every_member_with_their_badges(conn, monkeypatch):
    from server import profiles
    poll(conn, Recorder())
    war = lambda rate: {"attacks": 40, "three_star_rate": rate, "missed": 1, "defense": {"defenses": 0, "avg_stars_conceded": None}}
    ms = profiles.current_members(conn)
    rows = [{"tag": m["tag"], "war": war(0.95 if i == 0 else 0.5)} for i, m in enumerate(ms)]
    monkeypatch.setattr(profiles, "war_record", lambda c: {"players": rows})
    board = profiles.board(conn, "badges")["players"]
    assert {r["tag"] for r in board} == {m["tag"] for m in ms}
    ace = next(r for r in board if r["tag"] == ms[0]["tag"])
    general = next(b for b in ace["badges"] if b["id"] == "sharpshooter")
    assert general["tier"] == "gold" and general["value"] == 0.95 and {"name", "clan", "th"} <= set(ace)


def test_the_newer_badges_come_from_raids_upgrades_cleanups_and_stars(conn, monkeypatch):
    from server import leaders, profiles
    monkeypatch.setattr(profiles, "war_record", lambda c: {"players": []})
    monkeypatch.setattr(profiles, "current_members", lambda c: [{"tag": "#VET", "donations": 0, "war_stars": 3500}, {"tag": "#B", "donations": 0, "war_stars": 100}])
    monkeypatch.setattr(leaders, "upgrades", lambda c, d: {"upgrades": [{"tag": "#BOB"}] * 16})
    with conn:
        _war(conn, "w", "2026-01")
        # A falls short on the base, B clears it, C hits it again already cleared.
        _attack(conn, "w", 1, "#A", 2), _attack(conn, "w", 2, "#B", 3), _attack(conn, "w", 3, "#C", 3)
        conn.execute("INSERT INTO raid_members (clan_tag, player_tag, start_time, looted, attacks) VALUES ('#C','#OLD','1',99999,6), ('#C','#R','2',26000,6)")
    tiers = lambda tag: {b["id"]: b["tier"] for b in profiles.badges_for(conn, tag, [])}
    assert tiers("#B") == {"cleanup": "bronze"} and tiers("#A") == {} and tiers("#C") == {}
    assert tiers("#VET") == {"war_hero": "silver"}
    assert tiers("#BOB") == {"builder": "silver"}
    assert tiers("#R") == {"raider": "silver"} and tiers("#OLD") == {}  # the latest raid only


def test_history_gives_first_dates_and_never_a_clan_size(conn, tmp_path, monkeypatch):
    from server import history, profiles
    (tmp_path / "h.json").write_text(json.dumps({"read_at": "x", "clans": {
        "fire": [["Old", "#OLD", "Member", "November 29, 2017", "Still a Member"], ["Gone", "#GONE", "?", "January 8, 2018", "January 10, 2018"]],
        "cake": [["Old", "#OLD", "Elder", "May 2, 2021", "June 1, 2021"], ["Newer", "#NEW", "Member", "March 3, 2021", "Still a Member"]],
        "flakes": []}}), encoding="utf-8")
    monkeypatch.setenv("FROSTED_HISTORY", str(tmp_path / "h.json"))
    monkeypatch.setattr(profiles, "current_members", lambda c: [
        {"tag": "#NEW", "name": "Newer", "snap_name": None, "clan_tag": "#X", "town_hall": 15, "snap_th": None},
        {"tag": "#OLD", "name": "Old", "snap_name": None, "clan_tag": "#X", "town_hall": 18, "snap_th": None},
        {"tag": "#NONE", "name": "Unseen", "snap_name": None, "clan_tag": "#X", "town_hall": 9, "snap_th": None}])
    # The earliest date in any clan, across clans.
    assert history.since("#OLD") == "2017-11-29" and history.since("#UNKNOWN") is None
    t = history.timeline(conn)
    assert t["players"] == 3 and t["in_several"] == 1
    assert [c["first"] for c in t["clans"][:2]] == ["2017-11-29", "2021-03-03"]
    assert {y["year"]: (y["Fire"], y["Cake"]) for y in t["years"]} == {"2017": (1, 0), "2018": (1, 0), "2021": (0, 2)}
    assert [r["tag"] for r in t["longest"]] == ["#OLD", "#NEW"]  # oldest first; a member with no record is left out
    # Someone who joined after the import takes the collector's date; the earlier date wins if both exist.
    with conn:
        conn.execute("INSERT INTO member_first_seen (player_tag, first_seen) VALUES ('#NONE', '2026-11-05T01:00:00Z'), ('#OLD', '2026-10-31T20:30:04Z')")
    assert history.since("#NONE", conn) == "2026-11-05" and history.since("#OLD", conn) == "2017-11-29"
    assert [r["tag"] for r in history.timeline(conn)["longest"]] == ["#OLD", "#NEW", "#NONE"]


def test_history_is_absent_without_its_file(conn, tmp_path, monkeypatch):
    from server import history
    monkeypatch.setenv("FROSTED_HISTORY", str(tmp_path / "none.json"))
    assert history.load() is None and history.since("#X") is None and history.timeline(conn) is None


def test_the_family_history_file_is_well_formed():
    from server import history
    h = history.load()
    assert h and h["rows"] and len(h["by_tag"]) > 2000
    assert all(r["tag"].startswith("#") and len(r["first"]) == 10 for r in h["rows"])
