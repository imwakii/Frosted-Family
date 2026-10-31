"""Player profiles for the Explore tab: stored by the collector every 2 hours, served by kind and as a level matrix.

Every current member gets a row in every kind, with null where the data is not in yet. "max" is the API's maxLevel,
the unit's maximum in the game. "cap", the maximum at the player's town hall, is always null: there is no source for
per-town-hall caps that is both official and current, so the site's rushed check stays off until there is one.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from importlib import resources

from fastapi import HTTPException

from frosted.config import TAG_TO_CLAN

PROFILE_HOURS = 2  # about 115 calls a pass, well inside the API's limits
KINDS = json.loads(resources.files("server").joinpath("data/unit_kinds.json").read_text(encoding="utf-8"))
PETS, SIEGE, SUPER = set(KINDS["pets"]), set(KINDS["siege_machines"]), set(KINDS["super_troops"])


def profiles_due(conn: sqlite3.Connection, now: str) -> bool:
    last = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    if not last:
        return True
    t = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return t(now) - t(last) >= timedelta(hours=PROFILE_HOURS)


def troop_kind(name: str) -> str:
    return "pet" if name in PETS else "siege" if name in SIEGE else "super_troop" if name in SUPER else "troop"


def upsert_profile(conn: sqlite3.Connection, p: dict, fetched_at: str) -> None:
    tag = p["tag"]
    league = (p.get("leagueTier") or p.get("league") or {}).get("name")
    conn.execute(
        """INSERT INTO player_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (player_tag) DO UPDATE SET fetched_at=excluded.fetched_at, name=excluded.name,
             clan_tag=excluded.clan_tag, town_hall=excluded.town_hall, exp_level=excluded.exp_level,
             trophies=excluded.trophies, best_trophies=excluded.best_trophies, league=excluded.league,
             war_stars=excluded.war_stars, attack_wins=excluded.attack_wins, defense_wins=excluded.defense_wins,
             donations=excluded.donations, donations_received=excluded.donations_received,
             capital_contributions=excluded.capital_contributions""",
        (tag, fetched_at, p.get("name"), (p.get("clan") or {}).get("tag"), p.get("townHallLevel"), p.get("expLevel"),
         p.get("trophies"), p.get("bestTrophies"), league, p.get("warStars"), p.get("attackWins"),
         p.get("defenseWins"), p.get("donations"), p.get("donationsReceived"), p.get("clanCapitalContributions")),
    )
    home = lambda xs: [x for x in xs or [] if x.get("village", "home") == "home"]
    heroes = home(p.get("heroes"))
    # The API names an equipment piece's hero only while it is equipped.
    worn = {e["name"]: h["name"] for h in heroes for e in h.get("equipment") or []}
    units = [("hero", h, None) for h in heroes]
    units += [("equipment", e, worn.get(e["name"])) for e in home(p.get("heroEquipment"))]
    units += [(troop_kind(t["name"]), t, None) for t in home(p.get("troops"))]
    units += [("spell", s, None) for s in home(p.get("spells"))]
    conn.execute("DELETE FROM player_units WHERE player_tag=?", (tag,))
    conn.executemany("INSERT OR REPLACE INTO player_units VALUES (?,?,?,?,?,?,?)",
                     [(tag, k, u["name"], u["level"], u.get("maxLevel"), hero, i)
                      for i, (k, u, hero) in enumerate(units)])
    # A level already recorded adds nothing, so a pass with no upgrades writes no history.
    conn.executemany("INSERT OR IGNORE INTO player_unit_history VALUES (?,?,?,?,?)",
                     [(tag, k, u["name"], u["level"], fetched_at) for k, u, _ in units])


def upsert_raid(conn: sqlite3.Connection, clan_tag: str, season: dict) -> None:
    conn.executemany(
        """INSERT INTO raid_members VALUES (?,?,?,?,?,?) ON CONFLICT (clan_tag, start_time, player_tag) DO UPDATE SET
             name=excluded.name, attacks=excluded.attacks, looted=excluded.looted""",
        [(clan_tag, season["startTime"], m["tag"], m.get("name"), m.get("attacks"), m.get("capitalResourcesLooted"))
         for m in season.get("members") or []],
    )


# ─── Explore ──────────────────────────────────────────────────────────────────

def ranked(rows: list[dict], score) -> list[dict]:
    """Highest first; ties share a rank (1, 2, 2, 4); rows with no score go last, unranked."""
    rows = sorted(rows, key=lambda r: (score(r) is None, -(score(r) or 0), r["name"] or ""))
    prev, rank = object(), 0
    for i, r in enumerate(rows, start=1):
        s = score(r)
        if s is None:
            r["rank"] = None
            continue
        if s != prev:
            rank, prev = i, s
        r["rank"] = rank
    return rows


def current_members(conn) -> list[dict]:
    """Everyone in the latest member poll of each clan, with their profile if one has been fetched. The clan is the
    one the member poll saw, which is fresher than the profile's."""
    rows = conn.execute(
        """SELECT s.player_tag AS tag, s.clan_tag, s.name AS snap_name, s.town_hall AS snap_th, p.name, p.town_hall,
                  p.fetched_at, p.donations, p.donations_received, p.capital_contributions
           FROM member_snapshots s
           JOIN (SELECT clan_tag, MAX(seen_at) AS seen_at FROM member_snapshots GROUP BY clan_tag) l
             USING (clan_tag, seen_at)
           LEFT JOIN player_profiles p ON p.player_tag = s.player_tag""")
    return [dict(r) for r in rows]


def row(m: dict) -> dict:
    return {"tag": m["tag"], "name": m["name"] or m["snap_name"], "clan": TAG_TO_CLAN.get(m["clan_tag"]),
            "th": m["town_hall"] or m["snap_th"]}


def units_of(conn, kinds: tuple[str, ...]) -> dict[str, list[sqlite3.Row]]:
    out: dict[str, list] = {}
    q = f"SELECT * FROM player_units WHERE kind IN ({','.join('?' * len(kinds))}) ORDER BY rowid"
    for u in conn.execute(q, kinds):
        out.setdefault(u["player_tag"], []).append(u)
    return out


def levels(r: dict, key: str) -> int | None:
    return sum(u["level"] for u in r[key]) if r[key] else None


def heroes(conn, ms):
    by = units_of(conn, ("hero",))
    rows = [{**row(m), "heroes": [{"name": u["name"], "level": u["level"], "cap": None, "max": u["max_level"]}
                                  for u in by.get(m["tag"], [])]} for m in ms]
    return ranked(rows, lambda r: levels(r, "heroes"))


def equipment(conn, ms):
    by = units_of(conn, ("equipment",))
    rows = [{**row(m), "equipment": [{"name": u["name"], "hero": u["hero"], "level": u["level"], "max": u["max_level"]}
                                     for u in by.get(m["tag"], [])]} for m in ms]
    return ranked(rows, lambda r: levels(r, "equipment"))


def army(conn, ms):
    # Super troops are boosted copies of base troops, so they would double-count.
    by = units_of(conn, ("troop", "spell", "pet", "siege"))
    rows = [{**row(m), "units": [{"name": u["name"], "group": u["kind"], "level": u["level"], "cap": None,
                                  "max": u["max_level"]} for u in by.get(m["tag"], [])]} for m in ms]

    def to_max(r):
        top = sum(u["max"] or 0 for u in r["units"])
        return round(sum(u["level"] for u in r["units"]) / top, 4) if top else None
    return ranked(rows, to_max)


def war(conn, ms):
    """From the wars this collector recorded, CWL and regular, not the profile's lifetime counts."""
    stats = {r["player_tag"]: dict(r) for r in conn.execute(
        """SELECT m.player_tag, COUNT(DISTINCT m.war_key) AS wars, MIN(substr(w.start_time, 1, 8)) AS first,
                  MAX(substr(w.start_time, 1, 8)) AS last
           FROM war_members m JOIN wars w USING (war_key) GROUP BY m.player_tag""")}
    hits = {r["attacker_tag"]: dict(r) for r in conn.execute(
        """SELECT attacker_tag, COUNT(*) AS attacks, SUM(stars) AS stars, SUM(stars = 3) AS three_stars,
                  ROUND(AVG(destruction), 1) AS avg_destruction FROM attacks GROUP BY attacker_tag""")}
    missed = {r["player_tag"]: r["missed"] for r in conn.execute(
        "SELECT player_tag, SUM(missed) AS missed FROM missed_attacks GROUP BY player_tag")}
    day = lambda d: f"{d[:4]}-{d[4:6]}-{d[6:8]}" if d else None
    rows = []
    for m in ms:
        s, h = stats.get(m["tag"]), hits.get(m["tag"], {})
        rows.append({**row(m), "war": None if not s else {
            "wars": s["wars"], "attacks": h.get("attacks", 0), "stars": h.get("stars", 0),
            "three_stars": h.get("three_stars", 0), "missed": missed.get(m["tag"], 0),
            "avg_destruction": h.get("avg_destruction"), "from": day(s["first"]), "to": day(s["last"])}})
    return ranked(rows, lambda r: r["war"]["stars"] if r["war"] else None)


def donations(conn, ms):
    rows = [{**row(m), "donations": None if m["fetched_at"] is None else
             {"donated": m["donations"], "received": m["donations_received"]}} for m in ms]
    return ranked(rows, lambda r: r["donations"]["donated"] if r["donations"] else None)


def capital(conn, ms):
    latest = {r["clan_tag"]: r["start_time"] for r in conn.execute(
        "SELECT clan_tag, MAX(start_time) AS start_time FROM raid_members GROUP BY clan_tag")}
    raids = {(r["clan_tag"], r["player_tag"]): r for r in conn.execute(
        """SELECT r.* FROM raid_members r JOIN (SELECT clan_tag, MAX(start_time) AS start_time FROM raid_members
             GROUP BY clan_tag) l USING (clan_tag, start_time)""")}
    rows = []
    for m in ms:
        raid = raids.get((m["clan_tag"], m["tag"])) if m["clan_tag"] in latest else None
        rows.append({**row(m), "capital": {"contributed": m["capital_contributions"],
                                           "raid_loot": raid["looted"] if raid else None,
                                           "raid_attacks": raid["attacks"] if raid else None}})
    return ranked(rows, lambda r: r["capital"]["contributed"])


BOARDS = {"heroes": heroes, "equipment": equipment, "army": army, "war": war, "donations": donations,
          "capital": capital}


# ─── Matrix: every member against every unit of one category ─────────────────

MATRIX = {"heroes": "hero", "equipment": "equipment", "troops": "troop", "spells": "spell", "pets": "pet",
          "sieges": "siege"}
CLAN_ORDER = {"Fire": 0, "Cake": 1, "Flakes": 2}


def matrix(conn, cat: str) -> dict:
    """Columns in the game's order, a row per current member, 0 for a unit the player has not unlocked. A member
    whose profile has not been fetched yet has levels null."""
    if cat not in MATRIX:
        raise HTTPException(404, f"no category {cat}; try {', '.join(MATRIX)}")
    if conn is None:
        return {"cat": cat, "as_of": None, "units": [], "players": []}
    by: dict[str, dict[str, sqlite3.Row]] = {}
    for u in conn.execute("SELECT * FROM player_units WHERE kind=? ORDER BY player_tag, position", (MATRIX[cat],)):
        by.setdefault(u["player_tag"], {})[u["name"]] = u
    # The API lists only unlocked units, in game order. Merging the lists, longest first, recovers the full order.
    order: list[str] = []
    top: dict[str, int | None] = {}
    for units in sorted(by.values(), key=len, reverse=True):
        for name, u in units.items():
            if name not in top:
                order.append(name)
                top[name] = u["max_level"]
            elif u["max_level"] and (top[name] or 0) < u["max_level"]:
                top[name] = u["max_level"]
    players = []
    for m in current_members(conn):
        mine = by.get(m["tag"])
        levels = None if m["fetched_at"] is None else [mine[n]["level"] if mine and n in mine else 0 for n in order]
        players.append({**row(m), "levels": levels})
    players.sort(key=lambda p: (CLAN_ORDER.get(p["clan"], 9), -(p["th"] or 0), (p["name"] or "").lower()))
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"cat": cat, "as_of": as_of, "units": [{"name": n, "max": top[n]} for n in order], "players": players}


def board(conn, kind: str) -> dict:
    if kind not in BOARDS:
        raise HTTPException(404, f"no kind {kind}; try {', '.join(BOARDS)}")
    if conn is None:
        return {"kind": kind, "updated_at": None, "players": []}
    updated = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"kind": kind, "updated_at": updated, "players": BOARDS[kind](conn, current_members(conn))}
