"""A month in the family: three awards, the clan race, who came and went, and the milestones. For Log's Recap sub-tab.

Months are UTC, and friendlies don't count. Awards go to people still here; the race counts everything a clan did that month, whoever has left since.
The collector began on 31 Oct 2026, so a recap starts with November: October would be one day's upgrades passed off as a month.
"""
from __future__ import annotations

from collections import Counter
from datetime import date

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import clanlog, leaders, profiles
from server.db import FRIENDLY

MIN_ATTACKS = 5  # a Three-Star General has to have fought; CWL alone gives 7 at most, so this has to stay below that
MAX_GAP_DAYS = 2  # donation rows further apart than this are someone coming back, and what they gave away is unknown
EARLY_DAYS = 3   # for the first days of a month, the page opens on the month just finished
PLACES = 3       # the winner and who came next
FIRST_MONTH = "2026-11"


def month_now() -> str:
    return leaders.now().strftime("%Y-%m")


def months(conn) -> list[str]:
    """Every month since records began with an attack or upgrade, and this one, newest first."""
    found = {month_now()}
    for r in conn.execute("SELECT DISTINCT substr(w.start_time, 1, 6) AS m FROM attacks a JOIN wars w USING (war_key)"):
        if r["m"]:
            found.add(f'{r["m"][:4]}-{r["m"][4:]}')
    found.update(e[5][:7] for e in leaders.upgrade_events(conn))
    return sorted((m for m in found if m >= FIRST_MONTH), reverse=True)


def _war_month(conn, month: str) -> tuple[dict[str, dict], Counter]:
    """Each player's attacks and three-stars this month, and each of our clans' stars as the game scores them: the best
    on each base, as the War tab shows. A war between two of our clans is on record from both sides, so it counts once."""
    players: dict[str, dict] = {}
    stars: Counter = Counter()
    pairs: set[tuple] = set()
    keep: set[str] = set()
    for w in conn.execute(f"SELECT * FROM wars w WHERE start_time LIKE ? AND NOT {FRIENDLY}", (month.replace("-", "") + "%",)):
        pair = (frozenset((w["clan_tag"], w["opponent_tag"])), w["start_time"])
        if pair in pairs:
            continue
        pairs.add(pair)
        keep.add(w["war_key"])
        for side, score in ((w["clan_tag"], w["clan_stars"]), (w["opponent_tag"], w["opponent_stars"])):
            clan = TAG_TO_CLAN.get(side)
            if clan:
                stars[clan] += score or 0
    for r in conn.execute("""SELECT a.war_key, a.attacker_tag, a.attacker_clan_tag, a.stars FROM attacks a JOIN wars w USING (war_key)
                             WHERE w.start_time LIKE ?""", (month.replace("-", "") + "%",)):
        if r["war_key"] not in keep or r["attacker_clan_tag"] not in TAG_TO_CLAN:
            continue  # the same war from the other side, or the enemy's attacks
        p = players.setdefault(r["attacker_tag"], {"attacks": 0, "three": 0})
        p["attacks"] += 1
        p["three"] += r["stars"] == 3
    return players, stars


def _donated(conn, month: str) -> tuple[Counter, Counter]:
    """Troops given this month, by player and by clan. Clash's count only runs up until it resets, so each rise between
    daily rows is what was given, and a drop means it reset. A player's first row has nothing to compare with, and nor does
    someone coming back after a gap, so those add nothing."""
    players: Counter = Counter()
    clans: Counter = Counter()
    before: dict[str, tuple[int, str]] = {}
    for r in conn.execute("""SELECT player_tag, clan_tag, snapshot_date, donations FROM member_snapshots
                             WHERE donations IS NOT NULL ORDER BY player_tag, snapshot_date, seen_at"""):
        tag, now_at = r["player_tag"], r["donations"]
        was = before.get(tag)
        before[tag] = (now_at, r["snapshot_date"])
        if was is None or r["snapshot_date"][:7] != month:
            continue
        if (date.fromisoformat(r["snapshot_date"]) - date.fromisoformat(was[1])).days > MAX_GAP_DAYS:
            continue
        given = now_at - was[0] if now_at >= was[0] else now_at
        clan = TAG_TO_CLAN.get(r["clan_tag"])
        if given and clan:
            players[tag] += given
            clans[clan] += given
    return players, clans


def recap(conn, month: str | None = None) -> dict:
    if not month:
        month = month_now()
        if conn is not None and leaders.now().day <= EARLY_DAYS and len(found := months(conn)) > 1:
            month = found[1]
    empty = {c: 0 for c in CLAN_TAGS}
    out = {"month": month, "live": month == month_now(), "min_attacks": MIN_ATTACKS, "months": [month],
           "awards": {"three_star": [], "builder": [], "donor": []},
           "race": {"war_stars": dict(empty), "upgrades": dict(empty), "donations": dict(empty)},
           "comings": {"joined": 0, "left": 0, "moved": 0}, "milestones": []}
    if conn is None:
        return out
    out["months"] = months(conn)
    ms = leaders.members_by_tag(conn)
    row = lambda tag: profiles.row(ms[tag])

    fought, stars = _war_month(conn, month)
    out["race"]["war_stars"].update(stars)
    ranked = sorted(((t, p) for t, p in fought.items() if t in ms and p["attacks"] >= MIN_ATTACKS),
                    key=lambda x: (-x[1]["three"] / x[1]["attacks"], -x[1]["attacks"], row(x[0])["name"] or ""))
    out["awards"]["three_star"] = [{**row(t), **p, "rate": p["three"] / p["attacks"]} for t, p in ranked[:PLACES]]

    built: Counter = Counter()
    for tag, _unit, _cat, _frm, _to, at, _change in leaders.upgrade_events(conn):
        if at[:7] == month and tag in ms:
            built[tag] += 1
    top = sorted(built.items(), key=lambda x: (-x[1], row(x[0])["name"] or ""))
    out["awards"]["builder"] = [{**row(t), "n": n} for t, n in top[:PLACES]]
    for c in leaders.upgrade_counts(conn):
        if c["day"][:7] == month:
            out["race"]["upgrades"][c["clan"]] += c["n"]

    given, by_clan = _donated(conn, month)
    out["race"]["donations"].update(by_clan)
    top = sorted(((t, n) for t, n in given.items() if t in ms), key=lambda x: (-x[1], row(x[0])["name"] or ""))
    out["awards"]["donor"] = [{**row(t), "n": n} for t, n in top[:PLACES]]

    for e in clanlog.member_events(conn):
        if e["at"][:7] == month:
            key = {"joined": "joined", "rejoined": "joined", "left": "left", "moved": "moved"}.get(e["kind"])
            if key:
                out["comings"][key] += 1
    out["milestones"] = [m for m in clanlog.milestones(conn, days=None) if m["at"][:7] == month]
    return out
