"""Player profiles for the Explore tab: stored by the collector every hour, served by kind and as a level matrix.

Every current member gets a row in every kind, with null where the data is not in yet. "max" is the API's maxLevel,
the unit's maximum in the game. "cap", the maximum at the player's town hall, is always null: there is no source for
per-town-hall caps that is both official and current, so the site's rushed check stays off until there is one.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from importlib import resources
from math import ceil

from fastapi import HTTPException

from frosted.config import TAG_TO_CLAN
from server import baseline, db, gear
from server.db import FRIENDLY, clean_name, has_column

# Hourly: about 115 calls a pass, well inside the API's limits. Due after 55 minutes so it lands on the 10-minute
# pass nearest the hour instead of slipping to the next one.
PROFILE_MINUTES = 55
KINDS = json.loads(resources.files("server").joinpath("data/unit_kinds.json").read_text(encoding="utf-8"))
PETS, SIEGE, SUPER = set(KINDS["pets"]), set(KINDS["siege_machines"]), set(KINDS["super_troops"])


CARD_ATTACKS, CARD_UPGRADES, CARD_UPGRADE_DAYS = 8, 6, 30
# Bronze, silver and gold lines, set against the family's numbers on 2 Nov 2026 so gold stays rare. Keep in step with the
# ladders in web/src/components/PlayerSheet.tsx.
BADGE_MIN_RECORD = 20                  # attacks or defences before a rate counts
BADGE_THREE_STARS = (0.80, 0.85, 0.90) # three-star rate
BADGE_NO_MISS = (20, 50, 75)           # attacks with none missed
BADGE_HELD = (20, 10, 5)               # rank among members by fewest stars conceded per defence
BADGE_SLAIN = (1, 3, 5)                # three-star hits on a higher town hall
BADGE_DONORS = (10, 3, 1)              # rank among donors this season
BADGE_HEROES = (0.95, 0.99, 1.0)       # hero levels, as a share of the maximum
BADGE_UPGRADES = (5, 15, 30)           # upgrades finished in the last BADGE_UPGRADE_DAYS
BADGE_UPGRADE_DAYS = 30
BADGE_LOOT = (20_000, 25_000, 30_000)  # capital gold looted in the latest raid weekend
BADGE_CLEANUPS = (1, 3, 5)             # three-star hits on a base someone else failed to clear
BADGE_WAR_STARS = (2_000, 3_000, 5_000)  # war stars, all time
EIGHT_KEPT = timedelta(days=3)         # how long after a league the card still shows its stars
TIERS = ("bronze", "silver", "gold")

def profiles_due(conn: sqlite3.Connection, now: str) -> bool:
    last = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    if not last:
        return True
    t = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return t(now) - t(last) >= timedelta(minutes=PROFILE_MINUTES)


def troop_kind(name: str) -> str:
    return "pet" if name in PETS else "siege" if name in SIEGE else "super_troop" if name in SUPER else "troop"


def clan_games_of(p: dict) -> int | None:
    """Lifetime Clan Games points: the game keeps them as the Games Champion achievement's value."""
    return next((a.get("value") for a in p.get("achievements") or [] if a.get("name") == "Games Champion"), None)


def upsert_profile(conn: sqlite3.Connection, p: dict, fetched_at: str) -> None:
    tag = p["tag"]
    league = (p.get("leagueTier") or p.get("league") or {}).get("name")
    games = clan_games_of(p)
    conn.execute(
        """INSERT INTO player_profiles (player_tag, fetched_at, name, clan_tag, town_hall, exp_level, trophies, best_trophies,
             league, war_stars, attack_wins, defense_wins, donations, donations_received, capital_contributions, clan_games)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (player_tag) DO UPDATE SET fetched_at=excluded.fetched_at, name=excluded.name,
             clan_tag=excluded.clan_tag, town_hall=excluded.town_hall, exp_level=excluded.exp_level,
             trophies=excluded.trophies, best_trophies=excluded.best_trophies, league=excluded.league,
             war_stars=excluded.war_stars, attack_wins=excluded.attack_wins, defense_wins=excluded.defense_wins,
             donations=excluded.donations, donations_received=excluded.donations_received,
             capital_contributions=excluded.capital_contributions, clan_games=excluded.clan_games""",
        (tag, fetched_at, clean_name(p.get("name")), (p.get("clan") or {}).get("tag"), p.get("townHallLevel"), p.get("expLevel"),
         p.get("trophies"), p.get("bestTrophies"), league, p.get("warStars"), p.get("attackWins"),
         p.get("defenseWins"), p.get("donations"), p.get("donationsReceived"), p.get("clanCapitalContributions"), games),
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
    gear.record(conn, tag, worn, fetched_at)
    # A level already recorded adds nothing, so a pass with no upgrades writes no history.
    conn.executemany("INSERT OR IGNORE INTO player_unit_history VALUES (?,?,?,?,?)",
                     [(tag, k, u["name"], u["level"], fetched_at) for k, u, _ in units])
    counters = (p.get("townHallLevel"), p.get("expLevel"), p.get("trophies"), p.get("builderBaseTrophies"),
                p.get("attackWins"), p.get("warStars"), p.get("donations"), p.get("donationsReceived"),
                p.get("clanCapitalContributions"), sum(u["level"] for _, u, _ in units), games)
    last = conn.execute("""SELECT town_hall, exp_level, trophies, builder_trophies, attack_wins, war_stars, donations,
                                  donations_received, capital_contributions, unit_levels, clan_games FROM profile_snapshots
                           WHERE player_tag=? ORDER BY fetched_at DESC LIMIT 1""", (tag,)).fetchone()
    if last is None or tuple(last) != counters:
        conn.execute("""INSERT OR REPLACE INTO profile_snapshots (player_tag, fetched_at, town_hall, exp_level, trophies,
                          builder_trophies, attack_wins, war_stars, donations, donations_received, capital_contributions,
                          unit_levels, clan_games) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (tag, fetched_at, *counters))


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
    # The read-only API can start before the collector has added clan_games.
    games = "p.clan_games" if has_column(conn, "player_profiles", "clan_games") else "NULL AS clan_games"
    rows = conn.execute(
        f"""SELECT s.player_tag AS tag, s.clan_tag, s.name AS snap_name, s.town_hall AS snap_th, p.name, p.town_hall,
                  p.fetched_at, p.war_stars, p.donations, p.donations_received, p.capital_contributions, {games}
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
    where = f"({where}) AND NOT {FRIENDLY}"

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
    return db.memo(conn, f"war_record:{scope}", WAR_INPUTS, lambda: _war_record(conn, scope), baseline_files())


def _war_record(conn, scope: str = "all") -> dict:
    """GET /explore/war?scope=all|cwl. Every current member's all-time war stars (profile) and their war record.

    scope=all: the tally's clashspot export (baseline.py) plus the recorded wars that started after each
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
    # history says where a player's record comes from. "recorded only" (no export row: joined after the cycle's
    # pull, or the CWL scope) means the API has nothing from before the collector first saw them.
    rows = [{**row(m), "war_stars": m["war_stars"], "war": war_view(players.get(m["tag"]), rec.get(m["tag"])),
             "history": "export + recorded" if m["tag"] in players else "recorded only"}
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


def month_start(now: datetime, back: int = 0) -> str:
    y, m = now.year, now.month - back
    while m < 1:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}-01"


def games(conn, ms, now: datetime | None = None):
    """Clan Games points by month. Clan Games run once a month and nothing else moves Games Champion, so a month's rise
    in it is that month's games. A month counts from the last reading before it began, else its own first reading."""
    now = now or datetime.now(timezone.utc)
    this, last = month_start(now), month_start(now, 1)
    seen: dict[str, list[tuple[str, int]]] = {}
    if has_column(conn, "profile_snapshots", "clan_games"):
        for r in conn.execute("SELECT player_tag, fetched_at, clan_games FROM profile_snapshots WHERE clan_games IS NOT NULL ORDER BY fetched_at"):
            seen.setdefault(r[0], []).append((r[1], r[2]))

    def start(rows, day, end):
        before = [v for t, v in rows if t < day]
        inside = [v for t, v in rows if day <= t < end]
        return before[-1] if before else inside[0] if inside else None

    rows = []
    for m in ms:
        mine, total = seen.get(m["tag"], []), m["clan_games"]
        a, b = start(mine, this, "9999"), start(mine, last, this)
        ended = [v for t, v in mine if t < this]
        rows.append({**row(m), "games": None if total is None else {
            "month": total - a if a is not None else None,
            "last_month": ended[-1] - b if ended and b is not None else None,
            "total": total}})
    return ranked(rows, lambda r: r["games"]["month"] if r["games"] else None)


def badges(conn, ms):
    """Every member's badges. The page ranks them, as it filters by clan and by badge."""
    ctx = badge_context(conn)
    heroes = units_of(conn, ("hero",))
    rows = []
    for m in ms:
        mine = [{"level": u["level"], "max": u["max_level"]} for u in heroes.get(m["tag"], [])]
        rows.append({**row(m), "badges": badges_for(conn, m["tag"], mine, ctx)})
    return rows


BOARDS = {"badges": badges, "heroes": heroes, "equipment": equipment, "army": army, "donations": donations,
          "capital": capital, "games": games}


# ─── The player card ──────────────────────────────────────────────────────────

def streaks_for(conn, tag: str) -> dict:
    """Over the wars the collector has recorded: the current and best run of three-star attacks, and how many ended
    wars in a row, newest back, the player used every attack."""
    now = best = run = 0
    current = True
    for a in conn.execute(f"""SELECT a.stars FROM attacks a JOIN wars w USING (war_key) WHERE a.attacker_tag=? AND NOT {FRIENDLY}
                             ORDER BY w.preparation_start DESC, a.attack_order DESC""", (tag,)):
        if a["stars"] == 3:
            run += 1
            now += current
        else:
            current = False
            run = 0
        best = max(best, run)
    clean = 0
    for w in conn.execute(f"""SELECT m.attacks_used, w.attacks_per_member AS allowed FROM war_members m JOIN wars w USING (war_key)
                             WHERE m.player_tag=? AND w.state='warEnded' AND NOT {FRIENDLY} ORDER BY w.preparation_start DESC""", (tag,)):
        if w["attacks_used"] < (w["allowed"] or 1):
            break
        clean += 1
    return {"three_stars": now, "three_stars_best": best, "clean_wars": clean}


def tier_of(value, lines) -> str | None:
    """The highest tier a value reaches, lines running bronze to gold, upward."""
    reached = [t for t, line in zip(TIERS, lines) if value >= line]
    return reached[-1] if reached else None


def tier_by_rank(rank: int | None, lines) -> str | None:
    """The same for a rank, where lower is better: lines give the last rank each tier reaches."""
    reached = [t for t, line in zip(TIERS, lines) if rank is not None and rank <= line]
    return reached[-1] if reached else None


# What the war record and badges read. Wars are updated in place, so their updated_at stands in for their rowid.
WAR_INPUTS = ("SELECT MAX(rowid) FROM attacks", "SELECT MAX(updated_at) FROM wars", "SELECT MAX(rowid) FROM war_members",
              "SELECT MAX(seen_at) FROM member_snapshots", "SELECT MAX(fetched_at) FROM player_profiles",
              "SELECT MAX(finished_at) FROM polls", "SELECT MAX(started_at) FROM profile_runs")


def baseline_files() -> tuple:
    """The exports on disk, so a new cycle's files clear anything kept from the old ones."""
    d = baseline.raw_dir()
    return (str(d), tuple(sorted(os.listdir(d))) if d.is_dir() else ())


def badge_context(conn, record: dict | None = None) -> dict:
    """What the badges compare against, worked out once so a whole family's badges can share it. Its upgrade count
    covers a rolling window, so it is also kept no longer than the hour."""
    from server import leaders  # leaders imports this module
    if record is not None and record.get("scope", "all") != "all":
        return _badge_context(conn, record)  # only the all-wars record is kept
    hour = leaders.now().strftime("%Y-%m-%dT%H")
    return db.memo(conn, "badge_context", WAR_INPUTS + leaders.UPGRADE_INPUTS, lambda: _badge_context(conn, record),
                   (hour, baseline_files()))


def _badge_context(conn, record: dict | None = None) -> dict:
    from server import leaders  # leaders imports this module
    rows = (record or war_record(conn))["players"]
    members = current_members(conn)
    held = sorted((r["war"]["defense"]["avg_stars_conceded"], r["tag"]) for r in rows
                  if r["war"] and r["war"]["defense"]["defenses"] >= BADGE_MIN_RECORD)
    givers = sorted((m for m in members if m["donations"]), key=lambda m: -m["donations"])
    upgrades: dict[str, int] = {}
    for u in leaders.upgrades(conn, BADGE_UPGRADE_DAYS)["upgrades"]:
        upgrades[u["tag"]] = upgrades.get(u["tag"], 0) + leaders.levels(u["from"], u["to"])
    # In attack order within each war: a cleanup is a three-star hit after a base's earlier attackers fell short.
    cleanups: dict[str, int] = {}
    best: dict[tuple, int] = {}
    for a in conn.execute(f"SELECT a.war_key, a.attacker_tag, a.defender_tag, a.stars FROM attacks a JOIN wars w USING (war_key) WHERE NOT {FRIENDLY} ORDER BY a.war_key, a.attack_order"):
        base = (a["war_key"], a["defender_tag"])
        if base in best and best[base] < 3 and a["stars"] == 3:
            cleanups[a["attacker_tag"]] = cleanups.get(a["attacker_tag"], 0) + 1
        best[base] = max(best.get(base, 0), a["stars"])
    return {
        "war": {r["tag"]: r["war"] for r in rows},
        "held": {t: (i + 1, v) for i, (v, t) in enumerate(held)},
        "givers": {m["tag"]: i + 1 for i, m in enumerate(givers)},
        "war_stars": {m["tag"]: m.get("war_stars") for m in members},
        "upgrades": upgrades,
        "cleanups": cleanups,
        "slain": {r[0]: r[1] for r in conn.execute(f"""SELECT a.attacker_tag, COUNT(*) FROM attacks a
            JOIN wars w USING (war_key)
            JOIN war_members m ON m.war_key = a.war_key AND m.player_tag = a.attacker_tag
            JOIN war_members d ON d.war_key = a.war_key AND d.player_tag = a.defender_tag
            WHERE a.stars = 3 AND d.town_hall > m.town_hall AND NOT {FRIENDLY} GROUP BY a.attacker_tag""")},
        "loot": {r["player_tag"]: r["looted"] for r in conn.execute("""SELECT r.player_tag, r.looted FROM raid_members r
            JOIN (SELECT clan_tag, MAX(start_time) AS start_time FROM raid_members GROUP BY clan_tag) l
            USING (clan_tag, start_time)""")},
    }


def badges_for(conn, tag: str, heroes: list[dict], ctx: dict | None = None) -> list[dict]:
    """Earned from the player's war record (the export plus recorded wars), profile, raids and upgrades, each at a tier,
    gold first, with what earned it."""
    ctx = ctx or badge_context(conn)
    out = []

    # value orders the holders of a badge within a tier, higher first.
    def earn(id_, label, tier, detail, value):
        if tier:
            out.append({"id": id_, "label": label, "tier": tier, "detail": detail, "value": value})

    w = ctx["war"].get(tag)
    if w and w["attacks"] >= BADGE_MIN_RECORD:
        rate = w["three_star_rate"] or 0
        earn("sharpshooter", "Three-Star General", tier_of(rate, BADGE_THREE_STARS), f"{rate * 100:.1f}% three stars", rate)
        if w["missed"] == 0:
            earn("never_misses", "Battle Ready", tier_of(w["attacks"], BADGE_NO_MISS), f"{w['attacks']} attacks, none missed", w["attacks"])
    if tag in ctx["held"]:
        place, conceded = ctx["held"][tag]
        earn("wall", "Unbreakable", tier_by_rank(place, BADGE_HELD), f"#{place} in the family, {conceded} stars conceded per attack", -place)
    slain = ctx["slain"].get(tag, 0)
    earn("giant_slayer", "Giant Slayer", tier_of(slain, BADGE_SLAIN), f"{slain} three-star {'hit' if slain == 1 else 'hits'} on a higher town hall", slain)
    cleanups = ctx["cleanups"].get(tag, 0)
    earn("cleanup", "Cleanup Crew", tier_of(cleanups, BADGE_CLEANUPS), f"Cleared {cleanups} {'base' if cleanups == 1 else 'bases'} others couldn't", cleanups)
    stars = ctx["war_stars"].get(tag)
    if stars:
        earn("war_hero", "War Hero", tier_of(stars, BADGE_WAR_STARS), f"{stars:,} war stars, all time", stars)
    if tag in ctx["givers"]:
        rank = ctx["givers"][tag]
        earn("top_donor", "Friend in Need", tier_by_rank(rank, BADGE_DONORS), f"#{rank} donor in the family this season", -rank)
    loot = ctx["loot"].get(tag, 0)
    earn("raider", "Capital Raider", tier_of(loot, BADGE_LOOT), f"{loot:,} capital gold in the latest raid weekend", loot)
    done = ctx["upgrades"].get(tag, 0)
    earn("builder", "Master Builder", tier_of(done, BADGE_UPGRADES), f"{done} upgrades in the last {BADGE_UPGRADE_DAYS} days", done)
    top = sum(h["max"] or 0 for h in heroes)
    if heroes and top:
        share = sum(h["level"] for h in heroes) / top
        earn("maxed_heroes", "Hero Hall Legend", tier_of(share, BADGE_HEROES), f"Heroes at {int(share * 100)}% of max level", share)
    return sorted(out, key=lambda b: -TIERS.index(b["tier"]))


def next_badge(tag: str, heroes: list[dict], ctx: dict) -> dict | None:
    """The badge tier this player is closest to, out of those they have started on. Rank badges depend on everyone else, and a
    raid's loot starts again each weekend, so neither is a goal to count down to."""
    options = []

    def near(id_, label, value, lines, text):
        for tier, line in zip(TIERS, lines):
            if value < line:
                if value > 0:
                    options.append({"id": id_, "label": label, "tier": tier, "text": text(line - value), "pct": round(100 * value / line)})
                return

    w = ctx["war"].get(tag)
    if w and w["attacks"] >= BADGE_MIN_RECORD:
        near("sharpshooter", "Three-Star General", w["three_star_rate"] or 0, BADGE_THREE_STARS, lambda g: f"{g * 100:.1f}% more three stars")
        if w["missed"] == 0:
            near("never_misses", "Battle Ready", w["attacks"], BADGE_NO_MISS, lambda n: f"{n} more {'attack' if n == 1 else 'attacks'}, none missed")
    near("giant_slayer", "Giant Slayer", ctx["slain"].get(tag, 0), BADGE_SLAIN, lambda n: f"{n} more three-star {'hit' if n == 1 else 'hits'} on a higher town hall")
    near("cleanup", "Cleanup Crew", ctx["cleanups"].get(tag, 0), BADGE_CLEANUPS, lambda n: f"{n} more {'base' if n == 1 else 'bases'} others couldn't clear")
    near("war_hero", "War Hero", ctx["war_stars"].get(tag) or 0, BADGE_WAR_STARS, lambda n: f"{n:,} more war stars")
    near("builder", "Master Builder", ctx["upgrades"].get(tag, 0), BADGE_UPGRADES, lambda n: f"{n} more {'upgrade' if n == 1 else 'upgrades'} in {BADGE_UPGRADE_DAYS} days")
    top = sum(h["max"] or 0 for h in heroes)
    if top:
        have = sum(h["level"] for h in heroes)
        near("maxed_heroes", "Hero Hall Legend", have / top, BADGE_HEROES, lambda g: f"{ceil(g * top)} more hero levels")
    return max(options, key=lambda o: o["pct"]) if options else None


def eight_for(conn, tag: str, now: datetime | None = None) -> dict | None:
    """The player's stars toward the 8 for the CWL bonus, while a league is on or just over; otherwise nothing to show."""
    now = now or datetime.now(timezone.utc)
    last = conn.execute("SELECT season, MAX(end_time) AS end_time FROM wars WHERE kind='cwl' AND season IS NOT NULL GROUP BY season ORDER BY end_time DESC LIMIT 1").fetchone()
    if not last or not last["end_time"] or last["end_time"][:15] < (now - EIGHT_KEPT).strftime("%Y%m%dT%H%M%S"):
        return None
    me = conn.execute("""SELECT COUNT(DISTINCT m.war_key) AS played, COALESCE(SUM(a.stars), 0) AS stars
                         FROM war_members m JOIN wars w ON w.war_key=m.war_key AND w.kind='cwl' AND w.season=? AND w.state<>'preparation'
                         LEFT JOIN attacks a ON a.war_key=m.war_key AND a.attacker_tag=m.player_tag
                         WHERE m.player_tag=?""", (last["season"], tag)).fetchone()
    begun = conn.execute("SELECT MAX(round) FROM wars WHERE kind='cwl' AND season=? AND state<>'preparation'", (last["season"],)).fetchone()[0]
    return {"season": last["season"], "stars": me["stars"], "played": me["played"], "begun": begun or 0}


def attack_history(conn, tag: str, now: datetime | None = None) -> list[dict]:
    """Every attack this player made in the last 30 days, newest war first, for the card that opens from Latest attacks."""
    since = ((now or datetime.now(timezone.utc)) - timedelta(days=CARD_UPGRADE_DAYS)).strftime("%Y%m%dT%H%M%S")
    return [{"war_key": a["war_key"], "date": api_day(a["start_time"]), "stars": a["stars"], "destruction": a["destruction"], "kind": a["kind"], "day": a["round"],
             "opponent": a["opponent_name"] if a["attacker_clan_tag"] == a["clan_tag"] else a["clan_name"],
             "target": a["target"], "target_th": a["target_th"], "target_position": a["target_position"]}
            for a in conn.execute(
                """SELECT a.war_key, a.stars, a.destruction, a.attacker_clan_tag, w.start_time, w.kind, w.round, w.clan_tag, w.clan_name, w.opponent_name,
                          d.name AS target, d.town_hall AS target_th, d.map_position AS target_position
                   FROM attacks a JOIN wars w USING (war_key)
                   LEFT JOIN war_members d ON d.war_key = a.war_key AND d.player_tag = a.defender_tag
                   WHERE a.attacker_tag=? AND w.start_time >= ? ORDER BY w.start_time DESC, a.attack_order DESC""", (tag, since))]


def player_card(conn, tag: str) -> dict:
    """What the player sheet adds to the roster row: heroes and their gear, badges, streaks, season totals, latest
    attacks and upgrades. Each block says what period it covers: the war record runs from the export's window to now,
    the same figures the War record board and the badges use, and streaks only over the wars the collector has seen."""
    from server import history, leaders  # both import this module
    record = war_record(conn)
    own = next((r["war"] for r in record["players"] if r["tag"] == tag), None)
    first = conn.execute("SELECT MIN(start_time) FROM wars WHERE start_time IS NOT NULL").fetchone()[0]
    prof = conn.execute("SELECT * FROM player_profiles WHERE player_tag=?", (tag,)).fetchone()
    on_hero: dict[str, list[dict]] = {}
    for u in conn.execute("""SELECT * FROM player_units WHERE player_tag=? AND kind='equipment' AND hero IS NOT NULL
                             ORDER BY position""", (tag,)):
        on_hero.setdefault(u["hero"], []).append({"name": u["name"], "level": u["level"], "max": u["max_level"]})
    # Each hero's gear beside the family's: its most-run pair, and how many members run the same two as this player.
    members = set(leaders.members_by_tag(conn))
    fam = gear.pairs_now(conn, members)
    heroes = [{"name": u["name"], "level": u["level"], "max": u["max_level"], "gear": on_hero.get(u["name"], []),
               "family": gear.family_pick(fam.get(u["name"], {}), [g["name"] for g in on_hero.get(u["name"], [])], tag in members) if on_hero.get(u["name"]) else None}
              for u in conn.execute("SELECT * FROM player_units WHERE player_tag=? AND kind='hero' ORDER BY position", (tag,))]
    attacks = []
    for a in conn.execute(
        """SELECT a.stars, a.destruction, a.attacker_clan_tag, w.kind, w.round, w.clan_tag, w.clan_name, w.opponent_name,
                  d.name AS target, d.town_hall AS target_th, d.map_position AS target_position
           FROM attacks a JOIN wars w USING (war_key)
           LEFT JOIN war_members d ON d.war_key = a.war_key AND d.player_tag = a.defender_tag
           WHERE a.attacker_tag=? ORDER BY w.preparation_start DESC, a.attack_order DESC LIMIT ?""", (tag, CARD_ATTACKS)):
        attacks.append({"stars": a["stars"], "destruction": a["destruction"], "kind": a["kind"], "day": a["round"],
                        "opponent": a["opponent_name"] if a["attacker_clan_tag"] == a["clan_tag"] else a["clan_name"],
                        "target": a["target"], "target_th": a["target_th"], "target_position": a["target_position"]})
    history_30d = [u for u in leaders.upgrades(conn, CARD_UPGRADE_DAYS)["upgrades"] if u["tag"] == tag]
    mine = history_30d[:CARD_UPGRADES]
    ctx = badge_context(conn, record)
    return {
        "heroes": heroes, "attacks": attacks, "upgrades": mine, "upgrade_history": history_30d, "badges": badges_for(conn, tag, heroes, ctx),
        "next_badge": next_badge(tag, heroes, ctx), "eight": eight_for(conn, tag), "attack_history": attack_history(conn, tag),
        "record": own and {"from": record["window_from"], "attacks": own["attacks"], "missed": own["missed"],
                           "three_star_rate": own["three_star_rate"]},
        "tracked_from": api_day(first),
        "family_since": history.since(tag, conn),
        "streaks": streaks_for(conn, tag),
        "war_stars": prof["war_stars"] if prof else None, "donations": prof["donations"] if prof else None,
        "donations_received": prof["donations_received"] if prof else None,
        "capital": prof["capital_contributions"] if prof else None,
    }


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
