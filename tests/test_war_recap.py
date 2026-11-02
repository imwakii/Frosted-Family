from datetime import datetime, timezone

from frosted.config import CLAN_TAGS
from server import db, war

FIRE = CLAN_TAGS["Fire"]
NOW = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)


def hit(tag, stars, destruction=100.0, duration=100, th=18, on_th=18, ours=True):
    return {"ours": ours, "attacker": {"tag": tag, "name": tag, "th": th, "position": 1},
            "defender": {"tag": "#E", "name": "enemy", "th": on_th, "position": 1},
            "stars": stars, "destruction": destruction, "duration": duration}


def test_the_mvp_has_the_most_stars_then_damage_then_speed():
    assert war.recap([hit("#A", 3), hit("#B", 2)])["mvp"]["tag"] == "#A"
    assert war.recap([hit("#A", 2, 60.0), hit("#B", 2, 90.0)])["mvp"]["tag"] == "#B"
    r = war.recap([hit("#A", 3, duration=120), hit("#B", 3, duration=90)])
    assert (r["mvp"]["tag"], r["mvp"]["tied"]) == ("#B", 2)


def test_every_attack_counts_towards_the_mvp():
    r = war.recap([hit("#A", 3), hit("#B", 2), hit("#B", 2)])
    assert (r["mvp"]["tag"], r["mvp"]["stars"], r["mvp"]["tied"]) == ("#B", [2, 2], 1)


def test_the_enemy_cannot_be_mvp_and_a_war_without_our_attacks_has_no_recap():
    assert war.recap([hit("#Z", 3, ours=False)]) is None
    assert war.recap([hit("#Z", 3, ours=False), hit("#A", 1)])["mvp"]["tag"] == "#A"


def test_an_upset_needs_three_stars_on_two_town_halls_up():
    log = [hit("#A", 3, th=17, on_th=18), hit("#B", 3, th=15, on_th=17), hit("#C", 2, th=14, on_th=17), hit("#D", 3, th=13, on_th=16, ours=False)]
    assert [u["attacker"]["tag"] for u in war.recap(log)["upsets"]] == ["#B"]


def test_the_biggest_upsets_come_first_and_a_missing_time_never_wins():
    log = [hit(f"#{i}", 3, th=17 - i, on_th=18) for i in range(1, 6)]
    assert [u["attacker"]["tag"] for u in war.recap(log)["upsets"]] == ["#5", "#4", "#3"]
    assert war.recap([hit("#A", 3, duration=None), hit("#B", 3, duration=170)])["mvp"]["tag"] == "#B"


def add_war(conn, key, state, day, start, end, gaps=False):
    conn.execute("""INSERT INTO wars (war_key, kind, round, state, team_size, attacks_per_member, start_time, end_time, clan_tag,
                    opponent_tag, opponent_name, updated_at) VALUES (?,'cwl',?,?,2,1,?,?,?,'#E','Enemy','now')""", (key, day, state, start, end, FIRE))
    for i, (tag, side, pos) in enumerate((("#A", FIRE, 2), ("#B", FIRE, 8), ("#X", "#E", 1), ("#Y", "#E", 9))):
        conn.execute("INSERT INTO war_members (war_key, player_tag, clan_tag, name, town_hall, map_position, attacks_used) VALUES (?,?,?,?,18,?,0)",
                     (key, tag, side, tag, pos if gaps else i % 2 + 1))


def test_a_cwl_war_pairs_by_rank_whatever_the_map_positions(tmp_path):
    conn = db.connect(tmp_path / "f.db")
    add_war(conn, "#W1", "preparation", 1, "20261104T000000.000Z", "20261105T000000.000Z", gaps=True)
    fire = next(c for c in war.board(conn, now=NOW)["clans"] if c["clan"] == "Fire")
    pairs = fire["war"]["pairs"]
    assert [(p["position"], p["us"]["tag"], p["them"]["tag"]) for p in pairs] == [(1, "#A", "#X"), (2, "#B", "#Y")]
    assert fire["next"] is None


def test_the_next_days_preparation_shows_behind_the_live_war(tmp_path):
    conn = db.connect(tmp_path / "f.db")
    add_war(conn, "#W1", "inWar", 1, "20261103T000000.000Z", "20261104T000000.000Z")
    add_war(conn, "#W2", "preparation", 2, "20261104T000000.000Z", "20261105T000000.000Z")
    fire = next(c for c in war.board(conn, now=NOW)["clans"] if c["clan"] == "Fire")
    assert (fire["war"]["day"], fire["war"]["state"], fire["next"]["day"], fire["next"]["state"]) == (1, "inWar", 2, "preparation")



def test_someone_swapped_out_in_preparation_leaves_the_war(tmp_path):
    conn = db.connect(tmp_path / "f.db")
    def payload(state, enemies):
        return {"state": state, "teamSize": 1, "preparationStartTime": "20261103T000000.000Z",
                "startTime": "20261104T000000.000Z", "endTime": "20261105T000000.000Z",
                "clan": {"tag": FIRE, "name": "Fire", "members": [{"tag": "#A", "name": "a", "townhallLevel": 18, "mapPosition": 1}]},
                "opponent": {"tag": "#E", "name": "E", "members": [{"tag": t, "name": t, "townhallLevel": 18, "mapPosition": 1} for t in enemies]}}
    db.upsert_war(conn, payload("preparation", ["#X"]), kind="cwl", war_tag="#W", round_no=1)
    db.upsert_war(conn, payload("preparation", ["#Y"]), kind="cwl", war_tag="#W", round_no=1)
    tags = [r[0] for r in conn.execute("SELECT player_tag FROM war_members ORDER BY player_tag")]
    assert tags == ["#A", "#Y"]
