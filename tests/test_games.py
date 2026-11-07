"""Clan Games points by month, from each profile's Games Champion achievement."""
import sqlite3
from datetime import datetime, timezone

from frosted.config import CLAN_TAGS
from server import db, profiles

FIRE = CLAN_TAGS["Fire"]
NOW = datetime(2026, 11, 29, 12, tzinfo=timezone.utc)


def profile(tag, points):
    return {"tag": tag, "name": tag[1:], "townHallLevel": 17, "clan": {"tag": FIRE},
            "achievements": [{"name": "Games Champion", "value": points}, {"name": "Friend in Need", "value": 9}]}


def board(conn, readings):
    db.upsert_members(conn, FIRE, [{"tag": t, "name": t[1:], "townHallLevel": 17} for t in {t for t, _, _ in readings}], "2026-11-29T00:00:00Z")
    for tag, at, points in readings:
        profiles.upsert_profile(conn, profile(tag, points), at)
    return {r["tag"]: r["games"] for r in profiles.games(conn, profiles.current_members(conn), NOW)}


def test_a_month_is_the_rise_from_the_last_reading_before_it(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    got = board(conn, [("#A", "2026-10-20T00:00:00Z", 50_000), ("#A", "2026-10-29T00:00:00Z", 54_000),
                       ("#A", "2026-11-28T00:00:00Z", 58_000)])
    assert got["#A"] == {"month": 4_000, "last_month": 4_000, "total": 58_000}


def test_tracking_that_starts_mid_month_counts_from_its_first_reading(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    got = board(conn, [("#A", "2026-11-07T00:00:00Z", 50_000), ("#A", "2026-11-28T00:00:00Z", 52_500)])
    assert got["#A"] == {"month": 2_500, "last_month": None, "total": 52_500}


def test_no_games_this_month_reads_zero(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    got = board(conn, [("#A", "2026-11-07T00:00:00Z", 50_000), ("#B", "2026-11-07T00:00:00Z", 10_000),
                       ("#B", "2026-11-28T00:00:00Z", 14_000)])
    assert got["#A"]["month"] == 0
    assert [r["tag"] for r in profiles.games(conn, profiles.current_members(conn), NOW)] == ["#B", "#A"]


def test_an_older_database_gains_the_columns(tmp_path):
    old = sqlite3.connect(tmp_path / "x.db")
    old.execute("CREATE TABLE profile_snapshots (player_tag TEXT NOT NULL, fetched_at TEXT NOT NULL, town_hall INTEGER, exp_level INTEGER,"
                " trophies INTEGER, builder_trophies INTEGER, attack_wins INTEGER, war_stars INTEGER, donations INTEGER,"
                " donations_received INTEGER, capital_contributions INTEGER, unit_levels INTEGER, PRIMARY KEY (player_tag, fetched_at))")
    old.commit()
    old.close()
    conn = db.connect(tmp_path / "x.db")
    assert "clan_games" in {r["name"] for r in conn.execute("PRAGMA table_info(profile_snapshots)")}


def test_the_read_only_api_copes_before_the_collector_adds_the_columns(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    db.upsert_members(conn, FIRE, [{"tag": "#A", "name": "A", "townHallLevel": 17}], "2026-11-29T00:00:00Z")
    conn.commit()
    for table, col in db.ADDED_COLUMNS:
        conn.execute(f"ALTER TABLE {table} DROP COLUMN {col}")
    conn.commit()
    ro = db.connect_readonly(tmp_path / "x.db")
    assert profiles.games(ro, profiles.current_members(ro), NOW)[0]["games"] is None
