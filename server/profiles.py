"""Player profiles for the Explore tab: stored by the collector about twice a day, ranked by the API.

Levels are compared with the API's maxLevel, which is the unit's maximum in the game, not the cap at the player's town
hall. So a percentage here is progress to max, not a rushed check. A per-town-hall cap table would be needed for that,
and there is no source for one that is both official and current, so it is left out.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from importlib import resources

from fastapi import HTTPException

from frosted.config import TAG_TO_CLAN

PROFILE_HOURS = 12
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
    units = []
    home = lambda xs: [x for x in xs or [] if x.get("village", "home") == "home"]
    for h in home(p.get("heroes")):
        units.append(("hero", h))
    for e in home(p.get("heroEquipment")):
        units.append(("equipment", e))
    for t in home(p.get("troops")):
        units.append((troop_kind(t["name"]), t))
    for s in home(p.get("spells")):
        units.append(("spell", s))
    conn.execute("DELETE FROM player_units WHERE player_tag=?", (tag,))
    conn.executemany("INSERT OR REPLACE INTO player_units VALUES (?,?,?,?,?)",
                     [(tag, k, u["name"], u["level"], u.get("maxLevel")) for k, u in units])


# ─── Explore ──────────────────────────────────────────────────────────────────

def ranked(rows: list[dict], key: str) -> list[dict]:
    """Highest first; ties share a rank (1, 2, 2, 4)."""
    rows = sorted(rows, key=lambda r: (-(r[key] if r[key] is not None else -1), r["name"] or ""))
    prev, rank = object(), 0
    for i, r in enumerate(rows, start=1):
        if r[key] != prev:
            rank, prev = i, r[key]
        r["rank"] = rank
    return rows


def members(conn) -> list[dict]:
    """Profiles of players whose profile says they are in one of our clans."""
    rows = conn.execute(
        f"SELECT * FROM player_profiles WHERE clan_tag IN ({','.join('?' * len(TAG_TO_CLAN))})", list(TAG_TO_CLAN))
    return [dict(r) for r in rows]


def base(p: dict) -> dict:
    return {"tag": p["player_tag"], "name": p["name"], "clan": TAG_TO_CLAN.get(p["clan_tag"]), "th": p["town_hall"]}


def units_by_player(conn, kinds: tuple[str, ...]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for u in conn.execute(f"SELECT * FROM player_units WHERE kind IN ({','.join('?' * len(kinds))})", kinds):
        out.setdefault(u["player_tag"], []).append({"kind": u["kind"], "name": u["name"], "level": u["level"],
                                                    "max": u["max_level"]})
    return out


def progress(units: list[dict]) -> float | None:
    top = sum(u["max"] or 0 for u in units)
    return round(100 * sum(u["level"] for u in units) / top, 1) if top else None


def unit_board(conn, kinds: tuple[str, ...], value: str) -> list[dict]:
    by = units_by_player(conn, kinds)
    rows = []
    for p in members(conn):
        us = by.get(p["player_tag"], [])
        rows.append({**base(p), "levels": sum(u["level"] for u in us), "progress_pct": progress(us), "units": us})
    return ranked(rows, value)


def stat_board(conn, cols: dict[str, str], key: str) -> list[dict]:
    return ranked([{**base(p), **{out: p[col] for out, col in cols.items()}} for p in members(conn)], key)


BOARDS = {
    # Ranked by total levels: a player with more heroes unlocked ranks above one with fewer.
    "heroes": lambda c: unit_board(c, ("hero",), "levels"),
    "equipment": lambda c: unit_board(c, ("equipment",), "levels"),
    # Super troops are boosted copies of base troops, so they would double-count.
    "army": lambda c: unit_board(c, ("troop", "spell", "siege", "pet"), "progress_pct"),
    "war": lambda c: stat_board(c, {"war_stars": "war_stars", "attack_wins": "attack_wins",
                                    "defense_wins": "defense_wins"}, "war_stars"),
    "donations": lambda c: stat_board(c, {"donations": "donations", "received": "donations_received"}, "donations"),
    "capital": lambda c: stat_board(c, {"contributions": "capital_contributions"}, "contributions"),
}


def board(conn, name: str) -> dict:
    if name not in BOARDS:
        raise HTTPException(404, f"no board {name}; try {', '.join(BOARDS)}")
    if conn is None:
        return {"board": name, "as_of": None, "players": []}
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"board": name, "as_of": as_of, "players": BOARDS[name](conn)}
