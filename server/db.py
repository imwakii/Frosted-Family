"""SQLite store for the war collector: schema, idempotent upserts, and the reads the API needs.

Every upsert is keyed on something the Clash of Clans API never changes: player tags, the CWL war tag, a regular
war's clan pair and preparation start, and an attack's order within its war. Re-polling the same war rewrites the
same rows and adds none.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from frosted.config import CLAN_TAGS

SCHEMA = """
-- Each tagged player's last allocation in the roster CSV (with any publish laid over it), rewritten every collector
-- pass. It outlives their row: a player dropped from the CSV after leaving gets their slot back if they rejoin the same
-- clan (members.py).
CREATE TABLE IF NOT EXISTS slot_memory (
    player_tag TEXT PRIMARY KEY,
    name TEXT,
    clan TEXT NOT NULL,
    cwl_slot TEXT NOT NULL,
    transferred_from TEXT,
    tier TEXT,
    final_score TEXT,
    current_th TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_snapshots (
    clan_tag TEXT NOT NULL,
    player_tag TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,          -- UTC date; one row per player per clan per day, refreshed each poll
    seen_at TEXT NOT NULL,                -- last poll that saw this player in this clan
    name TEXT,
    role TEXT,
    town_hall INTEGER,
    exp_level INTEGER,
    trophies INTEGER,
    donations INTEGER,
    donations_received INTEGER,
    PRIMARY KEY (clan_tag, player_tag, snapshot_date)
);
CREATE INDEX IF NOT EXISTS ix_snap_player ON member_snapshots (player_tag, seen_at);

-- The first poll that saw each player, at poll precision (member_snapshots keeps one row a day, so its seen_at
-- moves). Backfilled from those rows for players seen before this table existed, which is right to the day.
CREATE TABLE IF NOT EXISTS member_first_seen (
    player_tag TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL
);
INSERT OR IGNORE INTO member_first_seen SELECT player_tag, MIN(seen_at) FROM member_snapshots GROUP BY player_tag;

-- The first poll each day that saw a player in a clan, so the log can time a move or a return to within a poll.
CREATE TABLE IF NOT EXISTS member_day_first (
    clan_tag TEXT NOT NULL,
    player_tag TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    first_at TEXT NOT NULL,
    PRIMARY KEY (clan_tag, player_tag, snapshot_date)
);

CREATE TABLE IF NOT EXISTS wars (
    war_key TEXT PRIMARY KEY,             -- CWL: the war tag. Regular: clan|opponent|preparationStartTime
    war_tag TEXT,
    kind TEXT NOT NULL,                   -- 'cwl' or 'regular'
    season TEXT,                          -- CWL only, e.g. 2026-11
    round INTEGER,                        -- CWL only, 1 to 7
    state TEXT,
    team_size INTEGER,
    attacks_per_member INTEGER,
    preparation_start TEXT,
    start_time TEXT,
    end_time TEXT,
    clan_tag TEXT NOT NULL,               -- the API's "clan" side, which for a CWL war may be either clan
    clan_name TEXT,
    clan_stars INTEGER,
    clan_destruction REAL,
    clan_attacks INTEGER,
    opponent_tag TEXT NOT NULL,
    opponent_name TEXT,
    opponent_stars INTEGER,
    opponent_destruction REAL,
    opponent_attacks INTEGER,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS war_members (
    war_key TEXT NOT NULL REFERENCES wars (war_key),
    player_tag TEXT NOT NULL,
    clan_tag TEXT NOT NULL,
    name TEXT,
    town_hall INTEGER,
    map_position INTEGER,
    attacks_used INTEGER NOT NULL,
    opponent_attacks INTEGER,
    PRIMARY KEY (war_key, player_tag)
);

CREATE TABLE IF NOT EXISTS attacks (
    war_key TEXT NOT NULL REFERENCES wars (war_key),
    attack_order INTEGER NOT NULL,        -- the API's "order", unique within a war
    attacker_tag TEXT NOT NULL,
    defender_tag TEXT NOT NULL,
    attacker_clan_tag TEXT NOT NULL,
    stars INTEGER NOT NULL,
    destruction REAL NOT NULL,
    duration INTEGER,
    PRIMARY KEY (war_key, attack_order)
);
CREATE INDEX IF NOT EXISTS ix_attacks_attacker ON attacks (attacker_tag);
CREATE INDEX IF NOT EXISTS ix_attacks_defender ON attacks (defender_tag);

-- Every clan in each of our clans' league groups, with the town halls of its signed-up roster, strongest first.
CREATE TABLE IF NOT EXISTS cwl_group_clans (
    season TEXT NOT NULL,
    our_clan_tag TEXT NOT NULL,
    clan_tag TEXT NOT NULL,
    name TEXT,
    town_halls TEXT NOT NULL,             -- JSON list
    PRIMARY KEY (season, our_clan_tag, clan_tag)
);

-- When the collector first saw each attack; the API gives no attack times. NULL for attacks stored before this table.
CREATE TABLE IF NOT EXISTS attack_seen (
    war_key TEXT NOT NULL,
    attack_order INTEGER NOT NULL,
    seen_at TEXT,
    PRIMARY KEY (war_key, attack_order)
);

-- The badge of any clan we have been at war with, for the enemy's side of the War tab.
CREATE TABLE IF NOT EXISTS war_clan_badges (
    clan_tag TEXT PRIMARY KEY,
    badge TEXT
);

-- The score of every war in each of our league groups, other clans' too, for the group table.
CREATE TABLE IF NOT EXISTS cwl_group_wars (
    war_tag TEXT PRIMARY KEY,
    season TEXT,
    round INTEGER,
    state TEXT,
    team_size INTEGER,
    end_time TEXT,
    clan_tag TEXT,
    clan_stars INTEGER,
    clan_destruction REAL,
    opponent_tag TEXT,
    opponent_stars INTEGER,
    opponent_destruction REAL,
    updated_at TEXT,
    clan_attacks INTEGER,
    opponent_attacks INTEGER
);

-- Each group clan's likely lineup, for comparing with ours: the averages over its 15 strongest signed-up players.
CREATE TABLE IF NOT EXISTS cwl_group_strength (
    season TEXT NOT NULL,
    clan_tag TEXT NOT NULL,
    players INTEGER,
    war_stars REAL,
    heroes REAL,                          -- total home hero levels
    equipment REAL,                       -- total hero equipment levels
    updated_at TEXT,
    PRIMARY KEY (season, clan_tag)
);

-- Each group clan's public facts for its card. Refreshed daily while the group is on, and dropped with the rest of the group.
CREATE TABLE IF NOT EXISTS cwl_group_profile (
    season TEXT NOT NULL,
    clan_tag TEXT NOT NULL,
    level INTEGER,
    war_wins INTEGER,
    win_streak INTEGER,
    war_league TEXT,
    members INTEGER,
    updated_at TEXT,
    PRIMARY KEY (season, clan_tag)
);

-- CWL war tags seen in a league group, so ended wars are not fetched again.
CREATE TABLE IF NOT EXISTS cwl_war_tags (
    war_tag TEXT PRIMARY KEY,
    season TEXT,
    round INTEGER,
    ours INTEGER,                         -- NULL until fetched; 1 if one of our clans is a side, else 0
    state TEXT
);

-- Each of our clans as /clans/{tag} last showed it: name, badge and leagues for the site's headers.
CREATE TABLE IF NOT EXISTS clans (
    clan_tag TEXT PRIMARY KEY,
    name TEXT,
    badge_small TEXT,
    badge_medium TEXT,
    badge_large TEXT,
    war_league TEXT,
    capital_league TEXT,
    clan_level INTEGER,
    members INTEGER,
    updated_at TEXT NOT NULL
);

-- One row per clan per UTC day, rewritten by each collector pass that day, so /stats/clans reads a small table.
-- Sums, not averages, so the family line can be added up from the three clans.
CREATE TABLE IF NOT EXISTS clan_daily (
    date TEXT NOT NULL,                   -- YYYY-MM-DD
    clan_tag TEXT NOT NULL,
    members INTEGER NOT NULL,
    th_sum INTEGER NOT NULL,
    hero_levels INTEGER NOT NULL,         -- members with a profile only
    hero_max INTEGER NOT NULL,
    donations INTEGER NOT NULL,           -- season to date; resets at season end
    donations_received INTEGER NOT NULL,
    capital_contributions INTEGER,        -- lifetime, members with a profile
    war_league TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (date, clan_tag)
);

CREATE TABLE IF NOT EXISTS polls (
    started_at TEXT PRIMARY KEY,
    finished_at TEXT,
    calls INTEGER,
    errors INTEGER
);

-- Player profiles from /players/{tag}, fetched every hour. Latest only; the units are replaced each fetch.
CREATE TABLE IF NOT EXISTS player_profiles (
    player_tag TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    name TEXT,
    clan_tag TEXT,
    town_hall INTEGER,
    exp_level INTEGER,
    trophies INTEGER,
    best_trophies INTEGER,
    league TEXT,
    war_stars INTEGER,
    attack_wins INTEGER,
    defense_wins INTEGER,
    donations INTEGER,
    donations_received INTEGER,
    capital_contributions INTEGER,
    clan_games INTEGER                    -- lifetime Clan Games points: the Games Champion achievement
);
CREATE TABLE IF NOT EXISTS player_units (
    player_tag TEXT NOT NULL REFERENCES player_profiles (player_tag),
    kind TEXT NOT NULL,                   -- hero, equipment, troop, super_troop, spell, pet, siege
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    max_level INTEGER,                    -- the game's max for the unit, not the player's town hall cap
    hero TEXT,                            -- equipment only: the hero it is equipped on, if any
    position INTEGER NOT NULL,            -- index in the API's list, which is the game's order
    PRIMARY KEY (player_tag, kind, name)
);
-- Every level change seen, so progress can be traced: one row when a unit first appears or its level moves.
CREATE TABLE IF NOT EXISTS player_unit_history (
    player_tag TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (player_tag, kind, name, level)
);
-- Each clan's latest raid weekend, polled with the profiles. One row per raider.
CREATE TABLE IF NOT EXISTS raid_members (
    clan_tag TEXT NOT NULL,
    start_time TEXT NOT NULL,
    player_tag TEXT NOT NULL,
    name TEXT,
    attacks INTEGER,
    looted INTEGER,
    PRIMARY KEY (clan_tag, start_time, player_tag)
);
-- A player's activity counters, one row per profile fetch where any of them moved (the first fetch always adds one).
-- The rows after the first are evidence of activity; town_hall across rows gives TH upgrades.
CREATE TABLE IF NOT EXISTS profile_snapshots (
    player_tag TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    town_hall INTEGER,
    exp_level INTEGER,
    trophies INTEGER,
    builder_trophies INTEGER,
    attack_wins INTEGER,
    war_stars INTEGER,
    donations INTEGER,
    donations_received INTEGER,
    capital_contributions INTEGER,
    unit_levels INTEGER,                  -- sum of every home unit level; it only rises, so any upgrade moves it
    clan_games INTEGER,
    PRIMARY KEY (player_tag, fetched_at)
);

CREATE TABLE IF NOT EXISTS profile_runs (
    started_at TEXT PRIMARY KEY,
    players INTEGER
);

-- The clan calendar (server/events.py): dated lines from Supercell's news posts.
CREATE TABLE IF NOT EXISTS game_posts (
    slug TEXT PRIMARY KEY,
    title TEXT,
    published TEXT,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_events (
    slug TEXT NOT NULL,
    line INTEGER NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,             -- YYYY-MM-DD, as the post dates it
    end_date TEXT NOT NULL,
    PRIMARY KEY (slug, line)
);

"""

# The API does not say a war is a friendly. The family's habit is one for each CWL clan on the 1st, before the draw, so a
# CWL clan's regular war starting that day is taken as one. It stays in the war log and out of misses, rates and scores.
_CWL_TAGS = f"('{CLAN_TAGS['Fire']}', '{CLAN_TAGS['Cake']}')"
FRIENDLY = (f"(w.kind = 'regular' AND (w.clan_tag IN {_CWL_TAGS} OR w.opponent_tag IN {_CWL_TAGS}) "
            "AND IFNULL(substr(w.start_time, 7, 2), '') = '01')")

# A missed attack is an attack slot left unused once the war has ended. Wars still running are not counted.
MISSED_VIEW = f"""CREATE VIEW missed_attacks AS
SELECT m.war_key, m.player_tag, m.clan_tag, m.name, w.kind, w.season, w.round, w.end_time,
       w.attacks_per_member - m.attacks_used AS missed
FROM war_members m JOIN wars w USING (war_key)
WHERE w.state = 'warEnded' AND m.attacks_used < w.attacks_per_member AND NOT {FRIENDLY}"""


def _ensure_missed_view(conn: sqlite3.Connection) -> None:
    """Replaced only when its definition has changed, in one transaction, so readers and other connections never see it gone."""
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='view' AND name='missed_attacks'").fetchone()
    if not row or row[0] != MISSED_VIEW:
        conn.executescript(f"BEGIN IMMEDIATE; DROP VIEW IF EXISTS missed_attacks; {MISSED_VIEW}; COMMIT;")


def clean_name(name: str | None) -> str | None:
    """A name without the replacement character a broken emoji leaves behind."""
    return name.replace("\ufffd", "").strip() if name else name


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30)  # the 10-minute and every-minute passes can overlap
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    _ensure_columns(conn)
    _ensure_missed_view(conn)
    return conn


# Columns added after a table first shipped, which an existing database gains on connect. 7 Nov 2026: attacks used on each
# side of a group war, so the group table can say who has attacks left; lifetime Clan Games points.
ADDED_COLUMNS = (("cwl_group_wars", "clan_attacks"), ("cwl_group_wars", "opponent_attacks"),
                 ("player_profiles", "clan_games"), ("profile_snapshots", "clan_games"))


def has_column(conn: sqlite3.Connection, table: str, col: str) -> bool:
    return col in {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}


def _ensure_columns(conn: sqlite3.Connection) -> None:
    for table, col in ADDED_COLUMNS:
        if not has_column(conn, table, col):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER")
            except sqlite3.OperationalError:  # an overlapping pass added it first
                pass


def connect_readonly(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def upsert_members(conn: sqlite3.Connection, clan_tag: str, items: list[dict], seen_at: str) -> int:
    day = seen_at[:10]
    rows = [
        (clan_tag, m["tag"], day, seen_at, clean_name(m.get("name")), m.get("role"), m.get("townHallLevel"), m.get("expLevel"),
         m.get("trophies"), m.get("donations"), m.get("donationsReceived"))
        for m in items
    ]
    conn.executemany(
        """INSERT INTO member_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (clan_tag, player_tag, snapshot_date) DO UPDATE SET
             seen_at=excluded.seen_at, name=excluded.name, role=excluded.role, town_hall=excluded.town_hall,
             exp_level=excluded.exp_level, trophies=excluded.trophies, donations=excluded.donations,
             donations_received=excluded.donations_received""",
        rows,
    )
    conn.executemany("INSERT OR IGNORE INTO member_first_seen VALUES (?, ?)", [(r[1], seen_at) for r in rows])
    conn.executemany("INSERT OR IGNORE INTO member_day_first VALUES (?,?,?,?)", [(clan_tag, r[1], day, seen_at) for r in rows])
    return len(rows)


def upsert_clan(conn: sqlite3.Connection, c: dict, seen_at: str) -> None:
    badge = c.get("badgeUrls") or {}
    conn.execute(
        """INSERT INTO clans VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (clan_tag) DO UPDATE SET
             name=excluded.name, badge_small=excluded.badge_small, badge_medium=excluded.badge_medium,
             badge_large=excluded.badge_large, war_league=excluded.war_league, capital_league=excluded.capital_league,
             clan_level=excluded.clan_level, members=excluded.members, updated_at=excluded.updated_at""",
        (c["tag"], c.get("name"), badge.get("small"), badge.get("medium"), badge.get("large"),
         (c.get("warLeague") or {}).get("name"), (c.get("capitalLeague") or {}).get("name"), c.get("clanLevel"),
         c.get("members"), seen_at),
    )


def war_key(war: dict, war_tag: str | None) -> str:
    if war_tag:
        return war_tag
    return f"{war['clan']['tag']}|{war['opponent']['tag']}|{war['preparationStartTime']}"


def store_badge(conn: sqlite3.Connection, clan: dict) -> None:
    urls = clan.get("badgeUrls") or {}
    badge = urls.get("medium") or urls.get("large") or urls.get("small")
    if badge:
        conn.execute("INSERT INTO war_clan_badges VALUES (?,?) ON CONFLICT (clan_tag) DO UPDATE SET badge=excluded.badge",
                     (clan["tag"], badge))


def forget_groups(conn: sqlite3.Connection, before: str, current: str | None) -> None:
    """Other clans' numbers only matter while we can still be compared with them. Our own wars are in `wars` and stay."""
    for table in ("cwl_group_clans", "cwl_group_wars", "cwl_group_strength", "cwl_group_profile", "cwl_war_tags"):
        conn.execute(f"DELETE FROM {table} WHERE season<? AND season IS NOT ?", (before, current))


def upsert_group_war(conn: sqlite3.Connection, war: dict, *, war_tag: str, season: str | None, round_no: int) -> None:
    clan, opp = war["clan"], war["opponent"]
    conn.execute(
        """INSERT OR REPLACE INTO cwl_group_wars (war_tag, season, round, state, team_size, end_time, clan_tag, clan_stars,
             clan_destruction, opponent_tag, opponent_stars, opponent_destruction, updated_at, clan_attacks, opponent_attacks)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (war_tag, season, round_no, war.get("state"), war.get("teamSize"), war.get("endTime"),
         clan["tag"], clan.get("stars", 0), clan.get("destructionPercentage", 0),
         opp["tag"], opp.get("stars", 0), opp.get("destructionPercentage", 0), utcnow(), clan.get("attacks"), opp.get("attacks")))


def upsert_war(conn: sqlite3.Connection, war: dict, *, kind: str, war_tag: str | None = None,
               season: str | None = None, round_no: int | None = None) -> str:
    """Store one war, its members and every attack in it. Returns the war key."""
    key = war_key(war, war_tag)
    clan, opp = war["clan"], war["opponent"]
    # Older payloads omit attacksPerMember; CWL has always been one attack, regular war two.
    apm = war.get("attacksPerMember") or (1 if kind == "cwl" else 2)
    conn.execute(
        """INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (war_key) DO UPDATE SET
             state=excluded.state, team_size=excluded.team_size, attacks_per_member=excluded.attacks_per_member,
             preparation_start=excluded.preparation_start, start_time=excluded.start_time,
             end_time=excluded.end_time, clan_name=excluded.clan_name, clan_stars=excluded.clan_stars,
             clan_destruction=excluded.clan_destruction, clan_attacks=excluded.clan_attacks,
             opponent_name=excluded.opponent_name, opponent_stars=excluded.opponent_stars,
             opponent_destruction=excluded.opponent_destruction, opponent_attacks=excluded.opponent_attacks,
             season=COALESCE(excluded.season, wars.season), round=COALESCE(excluded.round, wars.round),
             updated_at=excluded.updated_at""",
        (key, war_tag, kind, season, round_no, war.get("state"), war.get("teamSize"), apm,
         war.get("preparationStartTime"), war.get("startTime"), war.get("endTime"),
         clan["tag"], clan.get("name"), clan.get("stars"), clan.get("destructionPercentage"), clan.get("attacks"),
         opp["tag"], opp.get("name"), opp.get("stars"), opp.get("destructionPercentage"), opp.get("attacks"),
         utcnow()),
    )
    now = utcnow()
    # A lineup can still change in preparation: whoever has been swapped out is no longer in this war.
    if war.get("state") == "preparation":
        conn.execute("DELETE FROM war_members WHERE war_key=?", (key,))
    for side in (clan, opp):
        store_badge(conn, side)
        for m in side.get("members", []):
            attacks = m.get("attacks", [])
            for a in attacks:
                # A new attack is stamped now; one already stored before stamping began has no known time.
                stored = conn.execute("SELECT 1 FROM attacks WHERE war_key=? AND attack_order=?", (key, a["order"])).fetchone()
                conn.execute("INSERT OR IGNORE INTO attack_seen VALUES (?,?,?)", (key, a["order"], None if stored else now))
            conn.execute(
                """INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT (war_key, player_tag) DO UPDATE SET
                     name=excluded.name, town_hall=excluded.town_hall, map_position=excluded.map_position,
                     attacks_used=excluded.attacks_used, opponent_attacks=excluded.opponent_attacks""",
                (key, m["tag"], side["tag"], clean_name(m.get("name")), m.get("townhallLevel"), m.get("mapPosition"),
                 len(attacks), m.get("opponentAttacks")),
            )
            conn.executemany(
                """INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT (war_key, attack_order) DO UPDATE SET
                     stars=excluded.stars, destruction=excluded.destruction, duration=excluded.duration""",
                [(key, a["order"], a["attackerTag"], a["defenderTag"], side["tag"], a["stars"],
                  a["destructionPercentage"], a.get("duration")) for a in attacks],
            )
    return key


def missed_attacks(conn: sqlite3.Connection, clan_tags: list[str] | None = None) -> list[dict]:
    sql = "SELECT * FROM missed_attacks"
    args: list = []
    if clan_tags:
        sql += f" WHERE clan_tag IN ({','.join('?' * len(clan_tags))})"
        args = list(clan_tags)
    return [dict(r) for r in conn.execute(sql + " ORDER BY end_time, war_key, player_tag", args)]


def latest_members(conn: sqlite3.Connection) -> dict[str, dict]:
    """Each player's most recent snapshot, keyed by tag, whichever clan it was in."""
    rows = conn.execute(
        """SELECT s.* FROM member_snapshots s
           JOIN (SELECT player_tag, MAX(seen_at) AS seen_at FROM member_snapshots GROUP BY player_tag) l
             USING (player_tag, seen_at)"""
    )
    return {r["player_tag"]: dict(r) for r in rows}
