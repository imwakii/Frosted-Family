"""Hero equipment across the family: what members wear now, what they have worn over the last weeks, and what they own.

The game reports which two pieces sit on each hero, not what was used in an attack, so this is what people have
equipped. Each profile fetch (about hourly) adds one look per hero to gear_worn under that day, so a pair worn all
day counts many looks and a quick swap counts few. The record starts on 13 Nov 2026, when this was added.
"""
from __future__ import annotations

from datetime import timedelta

# The gear_worn table is in db.py's schema, which the collector creates.


def record(conn, tag: str, worn: dict[str, str], fetched_at: str) -> None:
    """One look per hero with equipment on, from a profile fetch. `worn` is {piece: hero}."""
    pairs: dict[str, list[str]] = {}
    for piece, hero in worn.items():
        pairs.setdefault(hero, []).append(piece)
    conn.executemany(
        """INSERT INTO gear_worn VALUES (?,?,?,?,1)
           ON CONFLICT (day, player_tag, hero, pair) DO UPDATE SET looks = looks + 1""",
        [(fetched_at[:10], tag, hero, " + ".join(sorted(pieces))) for hero, pieces in pairs.items()])


def pairs_now(conn, members: set[str]) -> dict[str, dict[tuple, int]]:
    """How many members run each pair on each hero right now: {hero: {(piece, piece): members}}."""
    on: dict[tuple, list[str]] = {}
    for u in conn.execute("SELECT player_tag, name, hero FROM player_units WHERE kind='equipment' AND hero IS NOT NULL"):
        if u["player_tag"] in members:
            on.setdefault((u["player_tag"], u["hero"]), []).append(u["name"])
    out: dict[str, dict[tuple, int]] = {}
    for (_tag, hero), pieces in on.items():
        if len(pieces) < 2:  # one piece on is a hero half-dressed, not a combo anyone picked
            continue
        pair = tuple(sorted(pieces))
        out.setdefault(hero, {})[pair] = out.get(hero, {}).get(pair, 0) + 1
    return out


def family_pick(counts: dict[tuple, int], mine: list[str], member: bool) -> dict | None:
    """For a player card: the family's most-run pair on a hero, and how many others run the player's own pair (a current
    member's own pair is in the counts, so they are taken out of it)."""
    if not counts:
        return None
    top, runs = min(counts.items(), key=lambda kv: (-kv[1], kv[0]))  # most run; a tie goes alphabetically
    same = counts.get(tuple(sorted(mine)), 0) - (1 if member and len(mine) >= 2 else 0)
    return {"top": list(top), "runs": runs, "of": sum(counts.values()), "others": max(0, same)}


def has_table(conn) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gear_worn'").fetchone() is not None


def view(conn, days: int = 30) -> dict:
    """Current members only, each with their clan, so the page can filter by clan.
    now:   [tag, hero, [pieces]] for every hero with equipment on, from the latest profile fetch
    worn:  [tag, hero, [pieces], looks] summed over the last `days` days
    owned: {tag: [[piece, level, max], ...]} every piece each member has unlocked"""
    if conn is None:
        return {"as_of": None, "since": None, "from": None, "days": days, "members": [], "now": [], "worn": [], "owned": {}}
    from server import leaders, profiles  # profiles imports this module to record looks
    # A member whose clan tag is not one of ours (mid-move between polls) is left out until the next poll places them.
    rows = {t: profiles.row(m) for t, m in leaders.members_by_tag(conn).items()}
    ms = {t: r for t, r in rows.items() if r["clan"]}
    members = [{k: r[k] for k in ("tag", "name", "clan", "th")} for r in ms.values()]
    now: dict[tuple, list[str]] = {}
    owned: dict[str, list] = {}
    for u in conn.execute("SELECT player_tag, name, level, max_level, hero FROM player_units WHERE kind='equipment' ORDER BY player_tag, position"):
        if u["player_tag"] not in ms:
            continue
        owned.setdefault(u["player_tag"], []).append([u["name"], u["level"], u["max_level"]])
        if u["hero"]:
            now.setdefault((u["player_tag"], u["hero"]), []).append(u["name"])
    worn, since = [], None
    cutoff = (leaders.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    # The window's first day, so the page can say when the record started inside it.
    first = (leaders.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    if has_table(conn):
        since = conn.execute("SELECT MIN(day) FROM gear_worn").fetchone()[0]
        for r in conn.execute("""SELECT player_tag, hero, pair, SUM(looks) AS looks FROM gear_worn WHERE day > ?
                                 GROUP BY player_tag, hero, pair""", (cutoff,)):
            if r["player_tag"] in ms:
                worn.append([r["player_tag"], r["hero"], r["pair"].split(" + "), r["looks"]])
    as_of = conn.execute("SELECT MAX(fetched_at) FROM player_profiles").fetchone()[0]
    return {"as_of": as_of, "since": since, "from": first, "days": days, "members": members,
            "now": [[t, h, sorted(p)] for (t, h), p in sorted(now.items())], "worn": worn, "owned": owned}
