"""SQLite store for the war collector: schema, idempotent upserts, and the reads the API needs.

Every upsert is keyed on something the Clash of Clans API never changes: player tags, the CWL war tag, a regular
war's clan pair and preparation start, and an attack's order within its war. Re-polling the same war rewrites the
same rows and adds none.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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

-- CWL war tags seen in a league group, so ended wars and other clans' wars are not fetched again.
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
    capital_contributions INTEGER
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
    PRIMARY KEY (player_tag, fetched_at)
);

CREATE TABLE IF NOT EXISTS profile_runs (
    started_at TEXT PRIMARY KEY,
    players INTEGER
);

-- A missed attack is an attack slot left unused once the war has ended. Wars still running are not counted.
CREATE VIEW IF NOT EXISTS missed_attacks AS
SELECT m.war_key, m.player_tag, m.clan_tag, m.name, w.kind, w.season, w.round, w.end_time,
       w.attacks_per_member - m.attacks_used AS missed
FROM war_members m JOIN wars w USING (war_key)
WHERE w.state = 'warEnded' AND m.attacks_used < w.attacks_per_member;
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def connect_readonly(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def upsert_members(conn: sqlite3.Connection, clan_tag: str, items: list[dict], seen_at: str) -> int:
    day = seen_at[:10]
    rows = [
        (clan_tag, m["tag"], day, seen_at, m.get("name"), m.get("role"), m.get("townHallLevel"), m.get("expLevel"),
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
    for side in (clan, opp):
        for m in side.get("members", []):
            attacks = m.get("attacks", [])
            conn.execute(
                """INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT (war_key, player_tag) DO UPDATE SET
                     name=excluded.name, town_hall=excluded.town_hall, map_position=excluded.map_position,
                     attacks_used=excluded.attacks_used, opponent_attacks=excluded.opponent_attacks""",
                (key, m["tag"], side["tag"], m.get("name"), m.get("townhallLevel"), m.get("mapPosition"),
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
