import json
from datetime import datetime, timezone

from frosted.config import CLAN_TAGS
from server import collect, db, war

FIRE = CLAN_TAGS["Fire"]
NOW = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)
ENDED = "20261104T120000.000Z"
LATER = "20261106T120000.000Z"


def row(tag, stars, pct):
    return {"tag": tag, "stars": stars, "destructionPercentage": pct}


def test_a_war_being_fought_says_how_many_attacks_each_side_has_left(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight({**row(FIRE, 12, 40.0), "attacks": 9}, {**row("#B", 3, 10.0), "attacks": 14}, state="inWar", end=LATER),
                 fight(row("#C", 20, 70.0), row("#D", 20, 80.0))])
    t = {r["tag"]: r for r in table(conn)}
    assert (t[FIRE]["left"], t["#B"]["left"], t["#C"]["left"]) == (6, 1, None)


def test_a_database_from_before_attack_counts_gains_the_columns(tmp_path):
    import sqlite3
    old = sqlite3.connect(tmp_path / "x.db")
    old.execute("CREATE TABLE cwl_group_wars (war_tag TEXT PRIMARY KEY, season TEXT, round INTEGER, state TEXT, team_size INTEGER, end_time TEXT,"
                " clan_tag TEXT, clan_stars INTEGER, clan_destruction REAL, opponent_tag TEXT, opponent_stars INTEGER, opponent_destruction REAL, updated_at TEXT)")
    old.commit()
    old.close()
    conn = db.connect(tmp_path / "x.db")
    assert {"clan_attacks", "opponent_attacks"} <= {r["name"] for r in conn.execute("PRAGMA table_info(cwl_group_wars)")}


def fight(a, b, state="warEnded", end=ENDED):
    return {"state": state, "teamSize": 15, "endTime": end, "clan": a, "opponent": b}


def setup(conn, wars):
    for c, ths in ((FIRE, [18, 17]), ("#B", [18, 18]), ("#C", [16]), ("#D", [15])):
        conn.execute("INSERT INTO cwl_group_clans VALUES (?,?,?,?,?)", ("2026-11-02", FIRE, c, c, json.dumps(ths)))
    for i, w in enumerate(wars):
        db.upsert_group_war(conn, w, war_tag=f"#W{i}", season="2026-11-02", round_no=1)


def table(conn):
    return war.group_view(conn, FIRE, NOW)["table"]


def test_a_win_adds_ten_stars_and_destruction_breaks_ties(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row(FIRE, 30, 90.0), row("#B", 28, 85.0)), fight(row("#C", 20, 70.0), row("#D", 20, 80.0))])
    t = {r["tag"]: r for r in table(conn)}
    assert (t[FIRE]["stars"], t[FIRE]["won"], t[FIRE]["destruction"]) == (40, 1, 1350.0)
    assert (t["#B"]["stars"], t["#B"]["lost"]) == (28, 1)
    assert (t["#D"]["stars"], t["#C"]["stars"]) == (30, 20)
    assert [r["tag"] for r in table(conn)] == [FIRE, "#D", "#B", "#C"]


def test_stars_in_a_war_still_on_count_but_no_win_yet(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row(FIRE, 12, 40.0), row("#B", 3, 10.0), state="inWar", end=LATER)])
    first = table(conn)[0]
    assert (first["tag"], first["stars"], first["won"]) == (FIRE, 12, 0)


def test_a_war_past_its_end_is_over_whatever_was_stored(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row(FIRE, 12, 40.0), row("#B", 3, 10.0), state="inWar", end=ENDED)])
    assert table(conn)[0]["won"] == 1


def test_a_full_draw_gives_neither_side_the_bonus(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row(FIRE, 30, 90.0), row("#B", 30, 90.0))])
    t = {r["tag"]: r for r in table(conn)}
    assert (t[FIRE]["stars"], t[FIRE]["won"], t[FIRE]["lost"], t["#B"]["stars"]) == (30, 0, 0, 30)


class FakeApi:
    def __init__(self, war_):
        self.war, self.calls = war_, 0

    def get(self, path, **_):
        self.calls += 1
        return self.war


def group():
    return {"season": "2026-11-02", "clans": [{"tag": "#B", "name": "B", "badgeUrls": {"medium": "b.png"}, "members": [{"townHallLevel": 18}]}],
            "rounds": [{"warTags": ["#X"]}]}


def test_the_collector_keeps_other_clans_scores_and_group_badges(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    api = FakeApi({"state": "inWar", "teamSize": 15, "endTime": LATER, "clan": {"tag": "#B", "stars": 5}, "opponent": {"tag": "#C", "stars": 2}})
    collect.collect_league_group(conn, api, group(), FIRE)
    assert conn.execute("SELECT clan_stars FROM cwl_group_wars WHERE war_tag='#X'").fetchone()[0] == 5
    assert war.badge_of(conn, "#B") == "b.png"
    assert conn.execute("SELECT COUNT(*) FROM wars").fetchone()[0] == 0  # other clans' full wars are not kept


def test_other_clans_wars_are_not_fetched_every_minute_and_ended_ones_never_again(tmp_path, monkeypatch):
    monkeypatch.setattr(collect, "collect_group_profiles", lambda *a: None)
    conn = db.connect(tmp_path / "x.db")
    api = FakeApi({"state": "inWar", "teamSize": 15, "endTime": LATER, "clan": {"tag": "#B"}, "opponent": {"tag": "#C"}})
    collect.collect_league_group(conn, api, group(), FIRE)
    collect.collect_league_group(conn, api, group(), FIRE)
    assert api.calls == 1
    conn.execute("UPDATE cwl_group_wars SET updated_at='2020-01-01T00:00:00Z'")
    api.war = {**api.war, "state": "warEnded"}
    collect.collect_league_group(conn, api, group(), FIRE)
    assert api.calls == 2
    conn.execute("UPDATE cwl_group_wars SET updated_at='2020-01-01T00:00:00Z'")
    collect.collect_league_group(conn, api, group(), FIRE)
    assert api.calls == 2


def test_strength_averages_the_15_strongest_one_clan_a_pass(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    members = [{"tag": f"#P{i}"} for i in range(16)]
    g = {"season": "2026-11-02", "clans": [{"tag": "#B", "members": members}, {"tag": "#C", "members": members[:1]}]}

    class Players:
        calls = 0

        def get(self, path, **_):
            self.calls += 1
            weak = path.endswith("P15")  # the sixteenth player is a lower town hall, so falls outside the 15
            return {"townHallLevel": 10 if weak else 18, "warStars": 0 if weak else 100,
                    "heroes": [{"level": 1 if weak else 90}, {"level": 500, "village": "builderBase"}],
                    "heroEquipment": [{"level": 20}, {"level": 7}]}
    api = Players()
    collect.collect_group_strength(conn, api, g)
    assert api.calls == 16
    r = conn.execute("SELECT * FROM cwl_group_strength WHERE clan_tag='#B'").fetchone()
    assert (r["players"], r["war_stars"], r["heroes"], r["equipment"]) == (15, 100, 90, 27)
    collect.collect_group_strength(conn, api, g)
    assert api.calls == 17  # the other clan next
    collect.collect_group_strength(conn, api, g)
    assert api.calls == 17  # nothing due until tomorrow


def test_before_is_the_regular_war_just_ahead_of_the_first_day(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [])
    side = lambda tag, stars=0: {"tag": tag, "name": tag, "stars": stars, "destructionPercentage": 0, "attacks": 0, "members": []}
    def stored(kind, start, opp, stars=0, **kw):
        w = {"state": "warEnded", "teamSize": 15, "preparationStartTime": f"202611{start}T000000.000Z", "startTime": f"202611{start}T120000.000Z",
             "endTime": f"202611{start}T235900.000Z", "clan": side(FIRE, stars), "opponent": side(opp)}
        db.upsert_war(conn, w, kind=kind, **kw)
    stored("regular", "01", "#OLD")
    stored("regular", "02", "#LAST", stars=40)
    stored("cwl", "03", "#B", war_tag="#D1", season="2026-11-02", round_no=1)
    stored("regular", "04", "#AFTER")
    g = war.group_view(conn, FIRE, NOW)
    assert (g["before"]["opponent"], g["before"]["stars"], g["before"]["day"], g["before"]["state"]) == ("#LAST", 40, 0, "warEnded")
    assert war.cwl_day(conn, "Fire", g["before"]["war_key"], NOW)["opponent"] == "#LAST"
    assert war.cwl_day(conn, "Cake", g["before"]["war_key"], NOW) is None


def test_no_cwl_war_yet_means_no_war_before(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [])
    assert war.group_view(conn, FIRE, NOW)["before"] is None


def test_a_day_is_served_only_for_a_war_of_that_clan(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    side = lambda tag: {"tag": tag, "name": tag, "stars": 0, "destructionPercentage": 0, "attacks": 0, "members": []}
    w = {"state": "inWar", "teamSize": 15, "preparationStartTime": "20261103T000000.000Z", "startTime": "20261104T000000.000Z",
         "endTime": LATER, "clan": side(FIRE), "opponent": side("#B")}
    db.upsert_war(conn, w, kind="cwl", war_tag="#W", season="2026-11-02", round_no=1)
    assert war.cwl_day(conn, "Fire", "#W", NOW)["day"] == 1
    assert war.cwl_day(conn, "Cake", "#W", NOW) is None
    assert war.cwl_day(conn, "Nope", "#W", NOW) is None
    assert war.cwl_day(conn, "Fire", "#none", NOW) is None


def test_each_group_clan_has_its_own_days_and_facts(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row("#B", 28, 85.0), row(FIRE, 30, 90.0)), fight(row("#C", 20, 70.0), row("#D", 21, 80.0))])

    class Clans:
        def get(self, path, **_):
            return None if path.endswith("C") else {"clanLevel": 20, "warWins": 300, "warWinStreak": 4, "warLeague": {"name": "Master League I"}, "members": 41}

    collect.collect_group_profiles(conn, Clans(), {"season": "2026-11-02", "clans": [{"tag": "#B"}, {"tag": "#C"}]})
    t = {r["tag"]: r for r in table(conn)}
    assert t["#B"]["profile"] == {"level": 20, "war_wins": 300, "win_streak": 4, "war_league": "Master League I", "members": 41}
    assert t["#C"]["profile"] is None
    b = t["#B"]["wars"]
    assert [(w["opponent_tag"], w["stars"], w["opponent_stars"], w["state"]) for w in b] == [(FIRE, 28, 30, "warEnded")]
    assert t[FIRE]["wars"][0]["opponent"] == "#B"


def test_a_group_is_forgotten_after_a_while_and_our_wars_stay(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    setup(conn, [fight(row(FIRE, 30, 90.0), row("#B", 28, 85.0))])
    conn.execute("INSERT INTO cwl_group_strength VALUES (?,?,?,?,?,?,?)", ("2026-09-01", "#B", 15, 1.0, 1.0, 1.0, "x"))
    conn.execute("INSERT INTO cwl_group_profile VALUES (?,?,?,?,?,?,?,?)", ("2026-09-01", "#B", 1, 1, 1, "x", 1, "x"))
    conn.execute("INSERT INTO cwl_group_clans VALUES (?,?,?,?,?)", ("2026-09-01", FIRE, "#B", "#B", "[]"))
    conn.execute("INSERT INTO wars (war_key, kind, clan_tag, opponent_tag, season, updated_at) VALUES ('w','cwl',?,'#B','2026-09-01','x')", (FIRE,))
    db.forget_groups(conn, "2026-10-01", "2026-11-02")
    for name in ("cwl_group_strength", "cwl_group_profile"):
        assert conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0] == 0
    # The group itself stays, so the War log can still open that league's Recap.
    assert {r[0] for r in conn.execute("SELECT DISTINCT season FROM cwl_group_clans")} == {"2026-09-01", "2026-11-02"}
    assert war.group_view(conn, FIRE, NOW, "2026-09-01")["season"] == "2026-09-01"
    assert war.group_view(conn, FIRE, NOW, "2025-01-01") is None
    db.forget_old_leagues(conn, "2026-10-01", "2026-11-02")  # three months on, the old league's Recap goes
    assert {r[0] for r in conn.execute("SELECT DISTINCT season FROM cwl_group_clans")} == {"2026-11-02"}
    assert conn.execute("SELECT COUNT(*) FROM wars WHERE war_key='w'").fetchone()[0] == 1
    db.forget_groups(conn, "2027-01-01", "2026-11-02")  # what the API is serving now is never dropped
    assert table(conn)


def test_the_war_log_lists_a_clans_finished_wars_newest_first(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    for key, a, b, state, end in (("a", FIRE, "#X", "warEnded", "20261001T000000.000Z"), ("b", "#Y", FIRE, "warEnded", "20261020T000000.000Z"),
                                  ("c", FIRE, "#Z", "preparation", "20261201T000000.000Z"), ("d", FIRE, "#Q", "inWar", LATER), ("e", "#P", "#R", "warEnded", ENDED)):
        conn.execute("INSERT INTO wars (war_key, kind, clan_tag, clan_name, clan_stars, opponent_tag, opponent_name, opponent_stars, state, end_time, team_size, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'x')",
                     (key, "regular", a, a, 10, b, b, 5, state, end, 15))
    log = war.war_log(conn, "Fire", NOW)["wars"]
    assert [w["war_key"] for w in log] == ["b", "a"]
    assert (log[0]["opponent"], log[0]["stars"], log[0]["opponent_stars"], log[0]["day"]) == ("#Y", 5, 10, 0)
    assert war.war_log(conn, "Nobody", NOW) is None
    assert log[0]["recap"] is False  # a regular war has no Recap


def test_season_totals_use_the_games_attack_count_and_count_hits_up(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    for i, state in enumerate(("warEnded", "warEnded", "inWar")):
        conn.execute("INSERT INTO wars (war_key, kind, season, round, state, clan_tag, opponent_tag, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                     (f"#K{i}", "cwl", "2026-11-02", i + 1, state, FIRE, "#B", ENDED))
        conn.execute("INSERT INTO war_members (war_key, player_tag, clan_tag, name, town_hall, map_position, attacks_used) VALUES (?,?,?,?,?,?,?)",
                     (f"#K{i}", "#ME", FIRE, "Me", 17, 1, 1 if i == 0 else 0))  # missed day 2, yet to attack on day 3
        conn.execute("INSERT INTO war_members (war_key, player_tag, clan_tag, name, town_hall, map_position, attacks_used) VALUES (?,?,?,?,?,?,?)",
                     (f"#K{i}", "#THEM", "#B", "Them", 18, 1, 1))
    conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", ("#K0", 1, "#ME", "#THEM", FIRE, 3, 100.0, 90))
    (me,) = war.eight_stars(conn, FIRE, "2026-11-02")
    assert (me["played"], me["used"], me["missed"], me["stars"], me["hits"], me["damage"], me["up"], me["threes"]) == (3, 1, 1, 3, 1, 100.0, 1, 1)
