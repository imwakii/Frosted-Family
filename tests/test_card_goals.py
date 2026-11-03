"""The goals on a player's own card: stars toward 8 this CWL, and the badge they are closest to."""
from datetime import datetime, timedelta, timezone

from frosted.config import CLAN_TAGS
from server import db, profiles

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
FIRE = CLAN_TAGS["Fire"]
ME = "#AAA"


def stamp(d):
    return d.strftime("%Y%m%dT%H%M%S.000Z")


def war(conn, key, round_no, state, end, season="2026-11-02"):
    conn.execute("INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (key, key, "cwl", season, round_no, state, 15, 1, stamp(end - timedelta(days=2)), stamp(end - timedelta(days=1)), stamp(end),
                  "#ENEMY", "Rivals", 0, 0, 0, FIRE, "Fire", 0, 0, 0, "x"))
    conn.execute("INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)", (key, ME, FIRE, "Waki", 18, 1, 1, 0))


def attack(conn, key, stars):
    conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", (key, 1, ME, "#ENEMY1", FIRE, stars, 100.0, 60))


def test_stars_toward_eight_count_this_cwl_only(tmp_path):
    conn = db.connect(tmp_path / "game.db")
    war(conn, "old", 7, "warEnded", NOW - timedelta(days=30), season="2026-10-02")
    attack(conn, "old", 3)
    war(conn, "d1", 1, "warEnded", NOW - timedelta(days=1))
    attack(conn, "d1", 3)
    war(conn, "d2", 2, "inWar", NOW + timedelta(hours=5))
    attack(conn, "d2", 2)
    war(conn, "d3", 3, "preparation", NOW + timedelta(days=1))
    conn.commit()
    assert profiles.eight_for(conn, ME, NOW) == {"season": "2026-11-02", "stars": 5, "played": 2, "begun": 2}
    assert profiles.eight_for(conn, "#NOBODY", NOW) == {"season": "2026-11-02", "stars": 0, "played": 0, "begun": 2}


def test_nothing_about_eight_once_cwl_is_well_over(tmp_path):
    conn = db.connect(tmp_path / "game.db")
    assert profiles.eight_for(conn, ME, NOW) is None
    war(conn, "d7", 7, "warEnded", NOW - timedelta(days=4))
    conn.commit()
    assert profiles.eight_for(conn, ME, NOW) is None


def ctx(**kw):
    return {"war": {}, "slain": {}, "cleanups": {}, "war_stars": {}, "upgrades": {}, **kw}


def test_the_next_badge_is_the_one_closest_to_its_line():
    got = profiles.next_badge(ME, [], ctx(upgrades={ME: 4}, war_stars={ME: 500}))
    assert got == {"id": "builder", "label": "Master Builder", "tier": "bronze", "text": "1 more upgrade in 30 days", "pct": 80}


def test_a_held_tier_points_at_the_next_one_and_gold_is_the_end():
    got = profiles.next_badge(ME, [], ctx(slain={ME: 3}))
    assert (got["id"], got["tier"], got["text"]) == ("giant_slayer", "gold", "2 more three-star hits on a higher town hall")
    assert profiles.next_badge(ME, [], ctx(slain={ME: 5})) is None


def test_rates_need_a_record_and_a_miss_ends_battle_ready():
    few = {ME: {"attacks": 5, "missed": 0, "three_star_rate": 0.7}}
    assert profiles.next_badge(ME, [], ctx(war=few)) is None
    missed = {ME: {"attacks": 40, "missed": 2, "three_star_rate": 0.78}}
    got = profiles.next_badge(ME, [], ctx(war=missed))
    assert (got["id"], got["tier"], got["text"]) == ("sharpshooter", "bronze", "2.0% more three stars")
    clean = {ME: {"attacks": 45, "missed": 0, "three_star_rate": 0.5}}
    got = profiles.next_badge(ME, [], ctx(war=clean))
    assert (got["id"], got["text"]) == ("never_misses", "5 more attacks, none missed")


def test_heroes_count_levels_still_to_go():
    heroes = [{"name": "King", "level": 90, "max": 100}, {"name": "Queen", "level": 90, "max": 100}]
    got = profiles.next_badge(ME, heroes, ctx())
    assert (got["id"], got["tier"], got["text"]) == ("maxed_heroes", "bronze", "10 more hero levels")
