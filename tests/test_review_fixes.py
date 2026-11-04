"""Friendlies stay out of the numbers, and levels gained away from the family are not upgrades."""
from frosted.config import CLAN_TAGS
from server import db, leaders, profiles, recap

FIRE, FLAKES = CLAN_TAGS["Fire"], CLAN_TAGS["Flakes"]


def war(conn, key, start, clan=FIRE, state="warEnded", kind="regular"):
    conn.execute("INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (key, key, kind, None, None, state, 15, 2, start, start, start, clan, "x", 9, 0, 0, "#ENEMY", "y", 3, 0, 0, "x"))
    conn.execute("INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)", (key, "#A", clan, "Ann", 17, 1, 0, 0))
    conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", (key, 1, "#A", "#E", clan, 3, 100.0, 60))


def test_a_friendly_on_the_1st_is_left_out_but_other_wars_count(tmp_path):
    conn = db.connect(tmp_path / "game.db")
    war(conn, "friendly", "20261101T100000.000Z")
    war(conn, "real", "20261105T100000.000Z")
    war(conn, "flakes", "20261101T100000.000Z", FLAKES)  # Flakes has no CWL, so no friendly habit
    conn.commit()
    assert sorted(m["war_key"] for m in db.missed_attacks(conn)) == ["flakes", "real"]
    rec = profiles.recorded_counts(conn)["#A"]
    assert (rec["wars"], rec["attacks"], rec["missed"]) == (2, 2, 4)
    assert recap.recap(conn, "2026-11")["race"]["war_stars"]["Fire"] == 9


def snap(conn, tag, day):
    conn.execute("INSERT INTO member_snapshots (clan_tag, player_tag, snapshot_date, seen_at) VALUES (?,?,?,?)", (FIRE, tag, day, f"{day}T12:00:00Z"))


def test_levels_gained_while_away_are_not_upgrades(tmp_path):
    conn = db.connect(tmp_path / "game.db")
    days = [f"2026-11-{d:02d}" for d in range(1, 21)]
    for d in days:
        snap(conn, "#STAY", d)
    for d in days[:5] + days[14:]:
        snap(conn, "#BACK", d)
    for tag in ("#STAY", "#BACK"):
        conn.execute("INSERT INTO profile_snapshots (player_tag, fetched_at) VALUES (?, '2026-11-01T00:00:00Z')", (tag,))
        conn.execute("INSERT INTO player_unit_history VALUES (?, 'troop', 'Golem', 1, '2026-11-01T00:00:00Z')", (tag,))
    rows = [("#BACK", 2, "2026-11-15T01:00:00Z"), ("#BACK", 3, "2026-11-16T01:00:00Z"), ("#BACK", 4, "2026-11-18T01:00:00Z"), ("#STAY", 2, "2026-11-15T01:00:00Z")]
    for tag, level, at in rows:
        conn.execute("INSERT INTO player_unit_history VALUES (?, 'troop', 'Golem', ?, ?)", (tag, level, at))
    conn.commit()
    got = sorted((e[0], e[4]) for e in leaders.upgrade_events(conn))
    assert got == [("#BACK", 4), ("#STAY", 2)]


def test_a_collector_outage_is_not_everyone_having_been_away(tmp_path):
    conn = db.connect(tmp_path / "game.db")
    for d in ("2026-11-01", "2026-11-02", "2026-11-12", "2026-11-13"):
        snap(conn, "#A", d)
    conn.commit()
    assert leaders.returned_on(conn) == {}


def test_season_reset_of_attack_wins_is_not_activity():
    base = {"town_hall": 17, "exp_level": 200, "attack_wins": 30, "war_stars": 500, "capital_contributions": 10,
            "unit_levels": 400, "donations": 50, "donations_received": 20, "trophies": 5000, "builder_trophies": 3000}
    assert not leaders.was_active(base, {**base, "attack_wins": 0})
    assert leaders.was_active(base, {**base, "attack_wins": 31})


def test_the_missed_view_is_left_alone_unless_it_changed(tmp_path):
    path = tmp_path / "game.db"
    conn = db.connect(path)
    conn.execute("DROP VIEW missed_attacks")
    conn.execute("CREATE VIEW missed_attacks AS SELECT 1 AS old")  # an older definition
    conn.commit()
    conn.close()
    conn = db.connect(path)
    assert conn.execute("SELECT sql FROM sqlite_master WHERE name='missed_attacks'").fetchone()[0] == db.MISSED_VIEW
    version = conn.execute("PRAGMA schema_version").fetchone()[0]
    conn.close()
    conn = db.connect(path)
    assert conn.execute("PRAGMA schema_version").fetchone()[0] == version  # no rewrite on an ordinary connect
