"""GET /war/board: each clan's war for the War tab, public.

The war being fought, else the one in preparation, else the last one, however long ago it ended. During CWL a day's
war runs while the next day's prepares, so a clan can also have a next war. Bases are paired by rank on the map (a CWL
war's map positions have gaps, so each side is numbered 1 to its size), with a log of every attack, newest first: who hit whom, stars, damage, and when the collector first saw it,
since the API gives no attack times. A war the collector last saw in progress whose end has passed is over,
whatever state was stored. A war that is over has a recap: any three-star on a town hall well above the attacker's.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from frosted.config import CLAN_TAGS

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
    return (ended[0], True) if ended else (None, False)


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
    """A finished war's upsets: our three-stars on a town hall well above the attacker's. The MVP went on 7 Nov 2026, as
    no rule for it was fair to everyone."""
    if not any(a["ours"] for a in log):
        return None
    upsets = [a for a in log if a["ours"] and a["stars"] == 3 and a["attacker"]["th"] and a["defender"]["th"]
              and a["defender"]["th"] - a["attacker"]["th"] >= UPSET_TH_GAP]
    upsets.sort(key=lambda a: a["attacker"]["th"] - a["defender"]["th"])
    return {
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
        "opponent_tag": w[f"{them}_tag"],
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
    """The group table as the game ranks it: stars, ten more for each win, then total destruction. `left` is the attacks a
    clan still has in a war being fought, since equal stars mean less while one side has more to come."""
    rows = {c["clan_tag"]: {"tag": c["clan_tag"], "name": c["name"], "stars": 0, "destruction": 0.0, "won": 0, "lost": 0, "left": None,
                            "town_halls": json.loads(c["town_halls"])} for c in clans}
    for w in wars:
        sides = [(w["clan_tag"], w["clan_stars"], w["clan_destruction"]), (w["opponent_tag"], w["opponent_stars"], w["opponent_destruction"])]
        over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < now_s)
        # Absent until the collector has added the columns, which the read-only API can't do itself.
        used = {w["clan_tag"]: w["clan_attacks"], w["opponent_tag"]: w["opponent_attacks"]} if "clan_attacks" in w.keys() else {}
        for (tag, stars, pct), (_, their_stars, their_pct) in (sides, sides[::-1]):
            row = rows.get(tag)
            if not row:
                continue
            if w["state"] == "inWar" and not over and used.get(tag) is not None and w["team_size"]:
                row["left"] = (row["left"] or 0) + w["team_size"] - used[tag]  # one attack each in CWL
            row["stars"] += stars
            row["destruction"] += pct * (w["team_size"] or 0)
            if over:
                beat = (stars, pct) > (their_stars, their_pct)
                row["won"] += beat
                row["lost"] += (stars, pct) < (their_stars, their_pct)
                row["stars"] += WIN_BONUS * beat
    return sorted(rows.values(), key=lambda r: (-r["stars"], -r["destruction"], r["name"] or ""))


def eight_stars(conn, clan_tag: str, season: str) -> list[dict]:
    """Each player's season so far, toward the 8 stars for the CWL bonus and for the bonus picks once it is over. `used`
    is the game's own attack count, so a missing attack row never reads as a miss, and `missed` counts ended wars only, so
    today's war isn't a miss before it is over; `hits`, `damage` and `up` (hits on a
    town hall at or above the attacker's) and `threes` come from the attacks stored."""
    rows = conn.execute(
        """SELECT m.player_tag AS tag, MAX(m.name) AS name, MAX(m.town_hall) AS th, COUNT(*) AS played, SUM(m.attacks_used) AS used,
                  COALESCE(SUM(s.stars), 0) AS stars, COALESCE(SUM(s.hits), 0) AS hits, COALESCE(SUM(s.damage), 0) AS damage,
                  COALESCE(SUM(s.up), 0) AS up, COALESCE(SUM(s.threes), 0) AS threes,
                  SUM(w.state = 'warEnded' AND m.attacks_used = 0) AS missed
           FROM war_members m JOIN wars w ON w.war_key=m.war_key AND w.kind='cwl' AND w.season=? AND w.state<>'preparation'
           LEFT JOIN (SELECT a.war_key, a.attacker_tag, SUM(a.stars) AS stars, COUNT(*) AS hits, SUM(a.destruction) AS damage,
                             SUM(COALESCE(d.town_hall >= b.town_hall, 0)) AS up, SUM(a.stars = 3) AS threes
                      FROM attacks a
                      LEFT JOIN war_members d ON d.war_key=a.war_key AND d.player_tag=a.defender_tag
                      LEFT JOIN war_members b ON b.war_key=a.war_key AND b.player_tag=a.attacker_tag
                      GROUP BY a.war_key, a.attacker_tag) s ON s.war_key=m.war_key AND s.attacker_tag=m.player_tag
           WHERE m.clan_tag=? GROUP BY m.player_tag ORDER BY stars DESC, played, name""", (season, clan_tag))
    return [dict(r) for r in rows]


def day_facts(conn, w, clan_tag: str, now_s: str) -> dict:
    us, them = ("clan", "opponent") if w["clan_tag"] == clan_tag else ("opponent", "clan")
    over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < now_s)
    return {"day": w["round"] or 0, "war_key": w["war_key"], "state": "warEnded" if over else w["state"], "opponent": w[f"{them}_name"],
            "opponent_badge": badge_of(conn, w[f"{them}_tag"]), "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
            "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"]}


def group_clan_wars(conn, wars: list, tag: str, names: dict, now_s: str) -> list[dict]:
    """One group clan's days so far, from the scores stored for the group table."""
    rows = []
    for w in sorted(wars, key=lambda w: w["round"] or 0):
        if tag not in (w["clan_tag"], w["opponent_tag"]):
            continue
        us, them = ("clan", "opponent") if w["clan_tag"] == tag else ("opponent", "clan")
        over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < now_s)
        rows.append({"day": w["round"], "state": "warEnded" if over else w["state"], "opponent_tag": w[f"{them}_tag"], "opponent": names.get(w[f"{them}_tag"]),
                     "opponent_badge": badge_of(conn, w[f"{them}_tag"]), "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
                     "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"]})
    return rows


def group_view(conn, clan_tag: str, now: datetime, season: str | None = None) -> dict | None:
    """A clan's league group: the latest, or the season asked for, from the War log."""
    latest = season or conn.execute("SELECT MAX(season) FROM cwl_group_clans WHERE our_clan_tag=?", (clan_tag,)).fetchone()[0]
    if not latest:
        return None
    clans = conn.execute("SELECT * FROM cwl_group_clans WHERE season=? AND our_clan_tag=?", (latest, clan_tag)).fetchall()
    if not clans:
        return None
    tags = [c["clan_tag"] for c in clans]
    marks = ",".join("?" * len(tags))
    wars = conn.execute(f"SELECT * FROM cwl_group_wars WHERE season=? AND clan_tag IN ({marks})", (latest, *tags)).fetchall()
    now_s = stamp(now)
    rounds = conn.execute("SELECT * FROM wars WHERE kind='cwl' AND season=? AND ? IN (clan_tag, opponent_tag) ORDER BY round", (latest, clan_tag)).fetchall()
    days = [day_facts(conn, w, clan_tag, now_s) for w in rounds]
    # The regular war that came just before this CWL's first.
    first = min((w["preparation_start"] for w in rounds if w["preparation_start"]), default=None)
    last = conn.execute(
        """SELECT * FROM wars WHERE kind='regular' AND ? IN (clan_tag, opponent_tag) AND preparation_start<?
           ORDER BY preparation_start DESC LIMIT 1""", (clan_tag, first)).fetchone() if first else None
    power = {r["clan_tag"]: r for r in conn.execute("SELECT * FROM cwl_group_strength WHERE season=? AND players>0", (latest,))}
    facts = {r["clan_tag"]: r for r in conn.execute("SELECT * FROM cwl_group_profile WHERE season=? AND level IS NOT NULL", (latest,))}
    names = {c["clan_tag"]: c["name"] for c in clans}
    table = [{**r, "badge": badge_of(conn, r["tag"]), "ours": r["tag"] == clan_tag,
              "strength": {k: power[r["tag"]][k] for k in ("war_stars", "heroes", "equipment")} if r["tag"] in power else None,
              "profile": {k: facts[r["tag"]][k] for k in ("level", "war_wins", "win_streak", "war_league", "members")} if r["tag"] in facts else None,
              "wars": group_clan_wars(conn, wars, r["tag"], names, now_s)}
             for r in group_table(clans, wars, now_s)]
    return {"season": latest, "table": table, "days": days, "before": day_facts(conn, last, clan_tag, now_s) if last else None,
            "eight": eight_stars(conn, clan_tag, latest)}


def cwl_groups(conn, now: datetime | None = None, season: str | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {"clans": [{"clan": name, "group": group_view(conn, tag, now, season) if conn else None} for name, tag in CLAN_TAGS.items()]}


def cwl_day(conn, clan: str, war_key: str, now: datetime | None = None) -> dict | None:
    """One of a clan's wars by its key, for the day row: a CWL day or the war before them. Another clan's war is not served here."""
    tag = CLAN_TAGS.get(clan)
    w = conn.execute("SELECT * FROM wars WHERE war_key=? AND ? IN (clan_tag, opponent_tag)", (war_key, tag)).fetchone() if conn and tag else None
    if not w:
        return None
    over = w["state"] == "warEnded" or bool(w["end_time"] and w["end_time"][:15] < stamp(now or datetime.now(timezone.utc)))
    return war_view(conn, w, tag, over)


def war_log(conn, clan: str, now: datetime | None = None) -> dict | None:
    """Every finished war we hold for a clan, newest first."""
    tag = CLAN_TAGS.get(clan)
    if not tag:
        return None
    now_s = stamp(now or datetime.now(timezone.utc))
    rows = conn.execute("SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag) AND state<>'preparation' ORDER BY end_time DESC", (tag,)).fetchall() if conn else []
    # A CWL day carries its season, and whether that league's group is held, so the log can open its Recap.
    held = {r[0] for r in conn.execute("SELECT DISTINCT season FROM cwl_group_clans WHERE our_clan_tag=?", (tag,))} if conn else set()
    facts = ({**day_facts(conn, w, tag, now_s), "kind": w["kind"], "end_time": w["end_time"], "team_size": w["team_size"],
              "season": w["season"], "recap": w["kind"] == "cwl" and w["season"] in held} for w in rows)
    return {"clan": clan, "wars": [f for f in facts if f["state"] == "warEnded"]}


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
