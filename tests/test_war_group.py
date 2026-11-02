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


def test_other_clans_wars_are_not_fetched_every_minute_and_ended_ones_never_again(tmp_path):
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


def test_a_day_is_served_only_for_a_cwl_war_of_that_clan(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    side = lambda tag: {"tag": tag, "name": tag, "stars": 0, "destructionPercentage": 0, "attacks": 0, "members": []}
    w = {"state": "inWar", "teamSize": 15, "preparationStartTime": "20261103T000000.000Z", "startTime": "20261104T000000.000Z",
         "endTime": LATER, "clan": side(FIRE), "opponent": side("#B")}
    db.upsert_war(conn, w, kind="cwl", war_tag="#W", season="2026-11-02", round_no=1)
    assert war.cwl_day(conn, "Fire", "#W", NOW)["day"] == 1
    assert war.cwl_day(conn, "Cake", "#W", NOW) is None
    assert war.cwl_day(conn, "Nope", "#W", NOW) is None
    assert war.cwl_day(conn, "Fire", "#none", NOW) is None
