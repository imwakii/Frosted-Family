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
from server import baseline

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
    counters = (p.get("townHallLevel"), p.get("expLevel"), p.get("trophies"), p.get("builderBaseTrophies"),
                p.get("attackWins"), p.get("warStars"), p.get("donations"), p.get("donationsReceived"),
                p.get("clanCapitalContributions"), sum(u["level"] for _, u, _ in units))
    last = conn.execute("""SELECT town_hall, exp_level, trophies, builder_trophies, attack_wins, war_stars, donations,
                                  donations_received, capital_contributions, unit_levels FROM profile_snapshots
                           WHERE player_tag=? ORDER BY fetched_at DESC LIMIT 1""", (tag,)).fetchone()
    if last is None or tuple(last) != counters:
        conn.execute("INSERT OR REPLACE INTO profile_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                     (tag, fetched_at, *counters))


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
                  p.fetched_at, p.war_stars, p.donations, p.donations_received, p.capital_contributions
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


def recorded_counts(conn, where: str = "1", args: tuple = (), cutoffs: dict[str, str] | None = None) -> dict:
    """Raw counts per player over the recorded wars matching `where` (a condition on wars w). With cutoffs (clan tag
    -> YYYY-MM-DD), a war counts for a clan only if its battle started after that date: the export covers the rest."""
    def scoped(clan_expr: str) -> tuple[str, tuple]:
        if not cutoffs:
            return where, args
        cases = " ".join("WHEN ? THEN ?" for _ in cutoffs)
        flat = tuple(x for tag, d in cutoffs.items() for x in (tag, d.replace("-", "")))
        return (f"({where}) AND substr(w.start_time, 1, 8) > CASE {clan_expr} {cases} ELSE '' END", args + flat)

    out: dict[str, dict] = {}
    blank = lambda: {"wars": 0, "attacks": 0, "three": 0, "two": 0, "one": 0, "missed": 0, "destruction": 0.0,
                     "defenses": 0, "d_three": 0, "d_two": 0, "d_one": 0}
    w_, a_ = scoped("m.clan_tag")
    for r in conn.execute(f"""SELECT m.player_tag AS t, COUNT(*) AS n FROM war_members m JOIN wars w USING (war_key)
                              WHERE {w_} GROUP BY m.player_tag""", a_):
        out.setdefault(r["t"], blank())["wars"] = r["n"]
    w_, a_ = scoped("a.attacker_clan_tag")
    for r in conn.execute(f"""SELECT a.attacker_tag AS t, COUNT(*) AS n, SUM(a.stars = 3) AS three,
                                     SUM(a.stars = 2) AS two, SUM(a.stars = 1) AS one, SUM(a.destruction) AS d
                              FROM attacks a JOIN wars w USING (war_key) WHERE {w_} GROUP BY a.attacker_tag""", a_):
        o = out.setdefault(r["t"], blank())
        o.update(attacks=r["n"], three=r["three"], two=r["two"], one=r["one"], destruction=r["d"])
    w_, a_ = scoped("x.clan_tag")
    for r in conn.execute(f"""SELECT x.player_tag AS t, SUM(x.missed) AS n FROM missed_attacks x
                              JOIN wars w USING (war_key) WHERE {w_} GROUP BY x.player_tag""", a_):
        out.setdefault(r["t"], blank())["missed"] = r["n"]
    # A defense is an attack on the player; their clan is the side that did not attack.
    w_, a_ = scoped("CASE WHEN a.attacker_clan_tag = w.clan_tag THEN w.opponent_tag ELSE w.clan_tag END")
    for r in conn.execute(f"""SELECT a.defender_tag AS t, COUNT(*) AS n, SUM(a.stars = 3) AS three,
                                     SUM(a.stars = 2) AS two, SUM(a.stars = 1) AS one
                              FROM attacks a JOIN wars w USING (war_key) WHERE {w_} GROUP BY a.defender_tag""", a_):
        o = out.setdefault(r["t"], blank())
        o.update(defenses=r["n"], d_three=r["three"], d_two=r["two"], d_one=r["one"])
    return out


def war_view(base: dict | None, rec: dict | None) -> dict | None:
    """Export counts plus recorded counts, with rates and averages worked out from the sums. Destruction and the
    war count exist only in recorded wars, so their field names say so."""
    if not base and not rec:
        return None
    z = {"attacks": 0, "three": 0, "two": 0, "one": 0, "missed": 0, "defenses": 0, "d_three": 0, "d_two": 0,
         "d_one": 0}
    b, r = base or z, rec or {**z, "wars": 0, "destruction": 0.0}
    s = {k: b[k] + r[k] for k in z}
    stars = 3 * s["three"] + 2 * s["two"] + s["one"]
    conceded = 3 * s["d_three"] + 2 * s["d_two"] + s["d_one"]
    att, ra = s["attacks"], r["attacks"]
    return {
        "attacks": att, "stars": stars, "three_stars": s["three"], "missed": s["missed"],
        "avg_stars": round(stars / att, 2) if att else None,
        "three_star_rate": round(s["three"] / att, 3) if att else None,
        "recorded_wars": r["wars"],
        "recorded_avg_destruction": round(r["destruction"] / ra, 1) if ra else None,
        "defense": {"defenses": s["defenses"], "stars_conceded": conceded, "three_stars_conceded": s["d_three"],
                    "avg_stars_conceded": round(conceded / s["defenses"], 2) if s["defenses"] else None},
    }


def api_day(t: str | None) -> str | None:
    return f"{t[:4]}-{t[4:6]}-{t[6:8]}" if t else None  # 20261031T080000.000Z -> 2026-10-31


def war_record(conn, scope: str = "all") -> dict:
    """GET /explore/war?scope=all|cwl. Every current member's all-time war stars (profile) and their war record.

    scope=all: the latest cycle's clashspot export (baseline.py) plus the recorded wars that started after each
    clan's pull date, so no war counts twice. scope=cwl: the current league season's recorded CWL wars only.
    A member with nothing in the scope has war null. Ranked by all-time war stars in both scopes. window_from opens the
    whole window (the export's earliest war, else the first recorded one); since is the first recorded war counted."""
    if scope not in ("all", "cwl"):
        raise HTTPException(422, "scope is all or cwl")
    base = baseline.current() if scope == "all" else None
    empty = {"kind": "war", "scope": scope, "since": None, "window_from": None, "sources": [], "season": None,
             "updated_at": None, "players": []}
    if conn is None:
        return empty
    updated = conn.execute("SELECT MAX(finished_at) FROM polls").fetchone()[0]
    season = conn.execute("SELECT MAX(season) FROM wars WHERE kind='cwl'").fetchone()[0]
    if scope == "all":
        cutoffs = base.pull_dates if base else None
        rec = recorded_counts(conn, cutoffs=cutoffs)
        counted = conn.execute("SELECT MIN(start_time) FROM wars WHERE start_time IS NOT NULL" + (
            " AND (" + " OR ".join("(? IN (clan_tag, opponent_tag) AND substr(start_time, 1, 8) > ?)"
                                    for _ in cutoffs) + ")" if cutoffs else ""),
            tuple(x for t, d in (cutoffs or {}).items() for x in (t, d.replace("-", "")))).fetchone()[0]
    else:
        rec = recorded_counts(conn, "w.kind='cwl' AND w.season=?", (season,)) if season else {}
        counted = conn.execute("SELECT MIN(start_time) FROM wars WHERE kind='cwl' AND season=?",
                               (season,)).fetchone()[0] if season else None
    sources = []
    if base:
        sources.append(f"clashspot export {base.cycle}")
    if counted:
        sources.append(f"recorded since {api_day(counted)}")
    window_from = min(base.earliest.values()) if base and base.earliest else api_day(counted)
    players = base.players if base else {}
    rows = [{**row(m), "war_stars": m["war_stars"], "war": war_view(players.get(m["tag"]), rec.get(m["tag"]))}
            for m in current_members(conn)]
    return {"kind": "war", "scope": scope, "since": api_day(counted), "window_from": window_from, "sources": sources,
            "season": season, "updated_at": updated, "players": ranked(rows, lambda r: r["war_stars"])}


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


BOARDS = {"heroes": heroes, "equipment": equipment, "army": army, "donations": donations,
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
