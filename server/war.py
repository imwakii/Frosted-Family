"""GET /war/board: each clan's war for the War tab, public.

The war being fought, else the one in preparation, else the last one for three days after it ended. During CWL a day's
war runs while the next day's prepares, so a clan can also have a next war. Bases are paired by rank on the map (a CWL
war's map positions have gaps, so each side is numbered 1 to its size), with a log of every attack, newest first: who hit whom, stars, damage, and when the collector first saw it,
since the API gives no attack times. A war the collector last saw in progress whose end has passed is over,
whatever state was stored. A war that is over has a recap: its MVP and any three-star on a town hall well above the attacker's.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone

from frosted.config import CLAN_TAGS

ENDED_SHOWN = timedelta(days=3)
UPSET_TH_GAP = 2           # one town hall up is routine now
UPSETS_SHOWN = 3
WIN_BONUS = 10             # stars a CWL win adds in the group table


def stamp(t: datetime) -> str:
    return t.strftime("%Y%m%dT%H%M%S")  # the API's time format, which sorts as text


def pick_war(conn, clan_tag: str, now: datetime):
    """A row and whether it is over, or (None, False)."""
    rows = conn.execute(
        """SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag)
           ORDER BY CASE state WHEN 'inWar' THEN 0 WHEN 'preparation' THEN 1 ELSE 2 END, preparation_start DESC""",
        (clan_tag,)).fetchall()
    now_s = stamp(now)
    for w in rows:
        if w["state"] != "warEnded" and not (w["end_time"] and w["end_time"][:15] < now_s):
            return w, False
    ended = [w for w in rows if w["end_time"]]
    ended.sort(key=lambda w: w["end_time"], reverse=True)
    if ended and ended[0]["end_time"][:15] >= stamp(now - ENDED_SHOWN):
        return ended[0], True
    return None, False


def next_war(conn, clan_tag: str, current, now: datetime):
    """The war in preparation behind the one being fought."""
    return conn.execute(
        """SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag) AND state='preparation' AND war_key<>?
           AND substr(end_time, 1, 15)>=? ORDER BY preparation_start LIMIT 1""",
        (clan_tag, current["war_key"], stamp(now))).fetchone()


def badge_of(conn, tag: str) -> str | None:
    try:
        r = conn.execute("SELECT badge FROM war_clan_badges WHERE clan_tag=?", (tag,)).fetchone()
    except sqlite3.OperationalError:  # the collector has not yet created the table
        return None
    return r[0] if r else None


def seen_times(conn, war_key: str) -> dict[int, str | None]:
    try:
        return {r[0]: r[1] for r in conn.execute("SELECT attack_order, seen_at FROM attack_seen WHERE war_key=?", (war_key,))}
    except sqlite3.OperationalError:
        return {}


def brief(b: dict) -> dict:
    return {k: b[k] for k in ("tag", "name", "th", "position")}


def recap(log: list[dict]) -> dict | None:
    """The MVP has the most stars, then the most damage, then the shortest total attack time."""
    hits: dict[str, list[dict]] = {}
    for a in log:
        if a["ours"]:
            hits.setdefault(a["attacker"]["tag"], []).append(a)
    if not hits:
        return None
    stars = lambda rows: sum(a["stars"] for a in rows)
    damage = lambda rows: sum(a["destruction"] for a in rows)
    took = lambda rows: sum(a["duration"] or 0 for a in rows) or float("inf")
    best = min(hits.values(), key=lambda rows: (-stars(rows), -damage(rows), took(rows)))
    upsets = [a for a in log if a["ours"] and a["stars"] == 3 and a["attacker"]["th"] and a["defender"]["th"]
              and a["defender"]["th"] - a["attacker"]["th"] >= UPSET_TH_GAP]
    upsets.sort(key=lambda a: a["attacker"]["th"] - a["defender"]["th"])
    return {
        "mvp": {**best[0]["attacker"], "stars": [a["stars"] for a in reversed(best)], "destruction": damage(best) / len(best),
                "tied": sum(stars(r) == stars(best) and damage(r) == damage(best) for r in hits.values())},
        "upsets": [{"attacker": a["attacker"], "defender": a["defender"]} for a in upsets[:UPSETS_SHOWN]],
    }


def war_view(conn, w, clan_tag: str, over: bool) -> dict:
    us, them = ("clan", "opponent") if w["clan_tag"] == clan_tag else ("opponent", "clan")
    allowed = w["attacks_per_member"] or (1 if w["kind"] == "cwl" else 2)
    members = conn.execute("SELECT * FROM war_members WHERE war_key=?", (w["war_key"],)).fetchall()
    ours = {m["player_tag"] for m in members if m["clan_tag"] == clan_tag}
    place = {}
    for side in (True, False):
        ranked = sorted((m for m in members if (m["player_tag"] in ours) == side), key=lambda m: m["map_position"] or 999)
        place.update({m["player_tag"]: i for i, m in enumerate(ranked, start=1)})
    bases = {m["player_tag"]: {"tag": m["player_tag"], "name": m["name"], "th": m["town_hall"], "position": place[m["player_tag"]],
                               "used": m["attacks_used"], "allowed": allowed, "best": None} for m in members}
    seen = seen_times(conn, w["war_key"])
    log = []
    # Newest first; the API's order is the order the attacks were made in.
    for a in conn.execute("SELECT * FROM attacks WHERE war_key=? ORDER BY attack_order DESC", (w["war_key"],)):
        by, on = bases.get(a["attacker_tag"]), bases.get(a["defender_tag"])
        if not by or not on:
            continue
        on["best"] = max(on["best"] or 0, a["stars"])
        log.append({"order": a["attack_order"], "ours": a["attacker_tag"] in ours, "attacker": brief(by), "defender": brief(on),
                    "stars": a["stars"], "destruction": a["destruction"], "duration": a["duration"], "seen_at": seen.get(a["attack_order"])})
    left = {b["position"]: b for t, b in bases.items() if t in ours}
    right = {b["position"]: b for t, b in bases.items() if t not in ours}
    return {
        "kind": w["kind"], "state": "warEnded" if over else w["state"], "day": w["round"], "team_size": w["team_size"],
        "updated_at": w["updated_at"],
        "preparation_start": w["preparation_start"], "start_time": w["start_time"], "end_time": w["end_time"], "attacks_allowed": allowed, "opponent": w[f"{them}_name"],
        "badge": badge_of(conn, clan_tag), "opponent_badge": badge_of(conn, w[f"{them}_tag"]),
        "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
        "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"],
        "attacks_used": w[f"{us}_attacks"], "opponent_attacks_used": w[f"{them}_attacks"],
        "pairs": [{"position": p, "us": left.get(p), "them": right.get(p)}
                  for p in sorted(x for x in set(left) | set(right) if x is not None)],
        "log": log,
        "war_key": w["war_key"],
        "recap": recap(log) if over else None,
    }


def group_table(clans: list, wars: list, now_s: str) -> list[dict]:
    """The group table as the game ranks it: stars, ten more for each win, then total destruction."""
    rows = {c["clan_tag"]: {"tag": c["clan_tag"], "name": c["name"], "stars": 0, "destruction": 0.0, "won": 0, "lost": 0,
                            "town_halls": json.loads(c["town_halls"])} for c in clans}
    for w in wars:
        sides = [(w["clan_tag"], w["clan_stars"], w["clan_destruction"]), (w["opponent_tag"], w["opponent_stars"], w["opponent_destruction"])]
        over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < now_s)
        for (tag, stars, pct), (_, their_stars, their_pct) in (sides, sides[::-1]):
            row = rows.get(tag)
            if not row:
                continue
            row["stars"] += stars
            row["destruction"] += pct * (w["team_size"] or 0)
            if over:
                beat = (stars, pct) > (their_stars, their_pct)
                row["won"] += beat
                row["lost"] += (stars, pct) < (their_stars, their_pct)
                row["stars"] += WIN_BONUS * beat
    return sorted(rows.values(), key=lambda r: (-r["stars"], -r["destruction"], r["name"] or ""))


def eight_stars(conn, clan_tag: str, season: str) -> list[dict]:
    """Each player's stars this season, toward the 8 for the CWL bonus."""
    rows = conn.execute(
        """SELECT m.player_tag AS tag, MAX(m.name) AS name, MAX(m.town_hall) AS th, COUNT(DISTINCT m.war_key) AS played,
                  COALESCE(SUM(a.stars), 0) AS stars
           FROM war_members m JOIN wars w ON w.war_key=m.war_key AND w.kind='cwl' AND w.season=? AND w.state<>'preparation'
           LEFT JOIN attacks a ON a.war_key=m.war_key AND a.attacker_tag=m.player_tag
           WHERE m.clan_tag=? GROUP BY m.player_tag ORDER BY stars DESC, played, name""", (season, clan_tag))
    return [dict(r) for r in rows]


def group_view(conn, clan_tag: str, now: datetime) -> dict | None:
    latest = conn.execute("SELECT MAX(season) FROM cwl_group_clans WHERE our_clan_tag=?", (clan_tag,)).fetchone()[0]
    if not latest:
        return None
    clans = conn.execute("SELECT * FROM cwl_group_clans WHERE season=? AND our_clan_tag=?", (latest, clan_tag)).fetchall()
    tags = [c["clan_tag"] for c in clans]
    marks = ",".join("?" * len(tags))
    wars = conn.execute(f"SELECT * FROM cwl_group_wars WHERE season=? AND clan_tag IN ({marks})", (latest, *tags)).fetchall()
    now_s = stamp(now)
    days = []
    for w in conn.execute("SELECT * FROM wars WHERE kind='cwl' AND season=? AND ? IN (clan_tag, opponent_tag) ORDER BY round", (latest, clan_tag)):
        us, them = ("clan", "opponent") if w["clan_tag"] == clan_tag else ("opponent", "clan")
        over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < now_s)
        days.append({"day": w["round"], "war_key": w["war_key"], "state": "warEnded" if over else w["state"], "opponent": w[f"{them}_name"],
                     "opponent_badge": badge_of(conn, w[f"{them}_tag"]), "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
                     "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"]})
    power = {r["clan_tag"]: r for r in conn.execute("SELECT * FROM cwl_group_strength WHERE season=? AND players>0", (latest,))}
    table = [{**r, "badge": badge_of(conn, r["tag"]), "ours": r["tag"] == clan_tag,
              "strength": {k: power[r["tag"]][k] for k in ("war_stars", "heroes", "equipment")} if r["tag"] in power else None}
             for r in group_table(clans, wars, now_s)]
    return {"season": latest, "table": table, "days": days, "eight": eight_stars(conn, clan_tag, latest)}


def cwl_groups(conn, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {"clans": [{"clan": name, "group": group_view(conn, tag, now) if conn else None} for name, tag in CLAN_TAGS.items()]}


def cwl_day(conn, clan: str, war_key: str, now: datetime | None = None) -> dict | None:
    """One clan's CWL war by its key, for the day strip. Any other war is not served here."""
    tag = CLAN_TAGS.get(clan)
    w = conn.execute("SELECT * FROM wars WHERE war_key=? AND kind='cwl' AND ? IN (clan_tag, opponent_tag)", (war_key, tag)).fetchone() if conn and tag else None
    if not w:
        return None
    over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < stamp(now or datetime.now(timezone.utc)))
    return war_view(conn, w, tag, over)


def board(conn, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    clans = []
    for name, clan_tag in CLAN_TAGS.items():
        w, over = pick_war(conn, clan_tag, now) if conn else (None, False)
        following = next_war(conn, clan_tag, w, now) if w and not over and w["state"] == "inWar" else None
        clans.append({"clan": name, "war": war_view(conn, w, clan_tag, over) if w else None,
                      "next": war_view(conn, following, clan_tag, False) if following else None})
    last = conn.execute("SELECT MAX(finished_at) FROM polls").fetchone()[0] if conn else None
    return {"clans": clans, "last_poll": last}
