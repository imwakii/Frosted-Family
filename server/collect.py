"""War collector: one pass over the three clans, run every 10 minutes by frosted-collect.timer.

The official API only ever shows the current war, so anything not polled while it is live is lost. Each pass stores
member snapshots, the current regular war, the CWL league group and each of its rounds' wars that involve one of our
clans. A 403 (war log private), 404 (not in war, not in CWL) or a network failure is logged as a status code and the
pass moves on. The token comes from COC_API_TOKEN and is never printed.

    python -m server.collect                 # uses FROSTED_DB, default /opt/bots/frosted/data/frosted.db
    python -m server.collect --profiles      # also fetch every member's profile now (otherwise every hour)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from frosted.config import CLAN_TAGS
from server import db, profiles, stats

API = "https://api.clashofclans.com/v1"
DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
OUR_TAGS = set(CLAN_TAGS.values())
OTHER_WARS_EVERY = timedelta(minutes=10)
STRENGTH_EVERY = timedelta(days=1)
LINEUP = 15


class Api:
    """Thin GET wrapper. Returns parsed JSON, or None on a quiet status and on any other failure after logging it.

    403 is quiet only for the war endpoints (war log private). On /members it means a bad token or an IP the key
    does not allow, so it is logged and counted.
    """

    def __init__(self, client: httpx.Client):
        self.client = client
        self.calls = 0
        self.errors = 0

    def get(self, path: str, quiet: tuple[int, ...] = (403, 404)) -> dict | None:
        self.calls += 1
        try:
            r = self.client.get(path)
        except httpx.HTTPError as e:
            self.errors += 1
            log(f"{path}: {type(e).__name__}")
            return None
        if r.status_code in quiet:
            return None
        if r.status_code != 200:
            self.errors += 1
            log(f"{path}: HTTP {r.status_code}")
            return None
        return r.json()


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def enc(tag: str) -> str:
    return quote(tag, safe="")


def collect_clan(conn, api: Api, clan_tag: str, now: str) -> list[str]:
    """One clan's details, members and wars. Returns the member tags."""
    clan = api.get(f"/clans/{enc(clan_tag)}", quiet=(404,))
    if clan:
        db.upsert_clan(conn, clan, now)
    members = api.get(f"/clans/{enc(clan_tag)}/members", quiet=(404,))
    items = members.get("items", []) if members else []
    if members is not None:
        db.upsert_members(conn, clan_tag, items, now)
    collect_wars(conn, api, clan_tag)
    return [m["tag"] for m in items]


def collect_wars(conn, api: Api, clan_tag: str) -> None:
    """One clan's current war and its league group's wars."""
    war = api.get(f"/clans/{enc(clan_tag)}/currentwar")
    # During CWL this endpoint reports notInWar; the league wars come through the group below.
    if war and war.get("state") not in (None, "notInWar") and "preparationStartTime" in war:
        db.upsert_war(conn, war, kind="regular")

    group = api.get(f"/clans/{enc(clan_tag)}/currentwar/leaguegroup")
    if group:
        collect_league_group(conn, api, group, clan_tag)


def strength(p: dict) -> dict:
    return {
        "th": p.get("townHallLevel") or 0,
        "war_stars": p.get("warStars") or 0,
        "heroes": sum(h.get("level", 0) for h in p.get("heroes") or [] if h.get("village", "home") == "home"),
        "equipment": sum(e.get("level", 0) for e in p.get("heroEquipment") or [] if e.get("village", "home") == "home"),
    }


def collect_group_strength(conn, api: Api, group: dict) -> None:
    """One group clan per pass, oldest first, so a day's refresh never lands as one burst of calls. The 15 strongest
    signed-up players stand in for the lineup, which is not known until each war is drawn."""
    season = group.get("season")
    since = (datetime.now(timezone.utc) - STRENGTH_EVERY).strftime("%Y-%m-%dT%H:%M:%SZ")
    done = {r["clan_tag"]: r["updated_at"] for r in conn.execute("SELECT clan_tag, updated_at FROM cwl_group_strength WHERE season=?", (season,))}
    due = sorted((c for c in group.get("clans", []) if done.get(c["tag"], "") < since and any(m.get("tag") for m in c.get("members", []))),
                 key=lambda c: done.get(c["tag"], ""))
    if not due:
        return
    clan = due[0]
    found = (api.get(f"/players/{enc(m['tag'])}", quiet=(404,)) for m in clan["members"] if m.get("tag"))
    rows = sorted((strength(p) for p in found if p), key=lambda r: (r["th"], r["heroes"]), reverse=True)[:LINEUP]
    avg = lambda k: sum(r[k] for r in rows) / len(rows) if rows else None
    # Stamped even when nothing came back, so a failing clan is tried again tomorrow rather than every minute.
    conn.execute("INSERT OR REPLACE INTO cwl_group_strength VALUES (?,?,?,?,?,?,?)",
                 (season, clan["tag"], len(rows), avg("war_stars"), avg("heroes"), avg("equipment"), db.utcnow()))


def collect_league_group(conn, api: Api, group: dict, our_clan_tag: str) -> None:
    season = group.get("season")
    # Other clans' wars only feed the group table, so they need not be as fresh as ours.
    others_from = (datetime.now(timezone.utc) - OTHER_WARS_EVERY).strftime("%Y-%m-%dT%H:%M:%SZ")
    for c in group.get("clans", []):
        db.store_badge(conn, c)
        ths = sorted((m["townHallLevel"] for m in c.get("members", []) if m.get("townHallLevel")), reverse=True)
        if ths:
            conn.execute(
                """INSERT INTO cwl_group_clans VALUES (?,?,?,?,?) ON CONFLICT (season, our_clan_tag, clan_tag)
                   DO UPDATE SET name=excluded.name, town_halls=excluded.town_halls""",
                (season, our_clan_tag, c["tag"], c.get("name"), json.dumps(ths)))
    for i, rnd in enumerate(group.get("rounds", []), start=1):
        for tag in rnd.get("warTags", []):
            if tag == "#0":  # round not drawn yet
                continue
            known = conn.execute(
                """SELECT t.ours, t.state, g.state AS group_state, g.updated_at FROM cwl_war_tags t
                   LEFT JOIN cwl_group_wars g USING (war_tag) WHERE t.war_tag=?""", (tag,)).fetchone()
            if known and known["group_state"] == "warEnded":
                continue
            if known and known["ours"] == 0 and known["updated_at"] and known["updated_at"] >= others_from:
                continue
            war = api.get(f"/clanwarleagues/wars/{enc(tag)}")
            if not war or war.get("state") in (None, "notInWar"):
                continue
            ours = int(war["clan"]["tag"] in OUR_TAGS or war["opponent"]["tag"] in OUR_TAGS)
            conn.execute(
                """INSERT INTO cwl_war_tags VALUES (?,?,?,?,?)
                   ON CONFLICT (war_tag) DO UPDATE SET ours=excluded.ours, state=excluded.state""",
                (tag, season, i, ours, war.get("state")),
            )
            db.upsert_group_war(conn, war, war_tag=tag, season=season, round_no=i)
            if ours:
                db.upsert_war(conn, war, kind="cwl", war_tag=tag, season=season, round_no=i)
    collect_group_strength(conn, api, group)


def collect_profiles(conn, api: Api, tags: list[str], now: str) -> None:
    """Every current member's /players profile, and each clan's latest raid weekend. Every hour: profiles change
    slowly and cost one call each."""
    stored = 0
    for tag in tags:
        p = api.get(f"/players/{enc(tag)}", quiet=(404,))
        if p:
            with conn:
                profiles.upsert_profile(conn, p, now)
            stored += 1
    # Each clan's latest raid weekend, for the capital board. 404 or 403 (no raids, private) is quiet.
    for clan_tag in CLAN_TAGS.values():
        raids = api.get(f"/clans/{enc(clan_tag)}/capitalraidseasons?limit=1")
        if raids and raids.get("items"):
            with conn:
                profiles.upsert_raid(conn, clan_tag, raids["items"][0])
    with conn:
        conn.execute("INSERT OR REPLACE INTO profile_runs VALUES (?,?)", (now, stored))


def run(conn, client: httpx.Client, force_profiles: bool = False) -> Api:
    api = Api(client)
    started = db.utcnow()
    tags: list[str] = []
    for clan_tag in CLAN_TAGS.values():
        # One transaction per clan: a crash mid-pass keeps what earlier clans stored.
        with conn:
            tags += collect_clan(conn, api, clan_tag, started)
    if tags and (force_profiles or profiles.profiles_due(conn, started)):
        collect_profiles(conn, api, tags, started)
    elif tags:
        # A member with no profile yet (just joined) is fetched now, not at the next hourly run, so they show on
        # every Stats board within 10 minutes. Not a profile run: the hourly schedule is unchanged.
        # Only members first seen since the last run, so a profile that cannot be fetched is not retried every pass.
        have = {r[0] for r in conn.execute("SELECT player_tag FROM player_profiles")}
        last = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0] or ""
        joined = {r[0] for r in conn.execute("SELECT player_tag FROM member_first_seen WHERE first_seen > ?", (last,))}
        for tag in (t for t in tags if t not in have and t in joined):
            p = api.get(f"/players/{enc(tag)}", quiet=(404,))
            if p:
                with conn:
                    profiles.upsert_profile(conn, p, started)
    with conn:
        stats.record_day(conn, started)  # today's clan_daily rows for /stats/clans
        conn.execute("INSERT OR REPLACE INTO polls VALUES (?,?,?,?)", (started, db.utcnow(), api.calls, api.errors))
    try:
        # Each player's allocation, kept after their CSV row goes, so a rejoiner gets their slot back.
        from server import members, plan
        with conn:
            members.remember_slots(conn, plan.effective_roster()[0], started)
    except Exception as e:  # never let the roster file stop war collection
        log(f"slot memory not updated: {e}")
    return api


def run_wars(conn, client: httpx.Client, now: datetime | None = None) -> Api:
    """The every-minute pass: only the wars of clans with one on or in preparation, so the War tab stays current without
    storing members or profiles more often. With no war on it calls nothing; the 10-minute pass finds new wars."""
    api = Api(client)
    # A war whose end passed over an hour ago and never showed as ended is left to the 10-minute pass.
    since = ((now or datetime.now(timezone.utc)) - timedelta(hours=1)).strftime("%Y%m%dT%H%M%S")
    for clan_tag in CLAN_TAGS.values():
        on = conn.execute(
            """SELECT 1 FROM wars WHERE ? IN (clan_tag, opponent_tag) AND state IN ('inWar', 'preparation')
               AND substr(end_time, 1, 15) >= ? LIMIT 1""", (clan_tag, since)).fetchone()
        if on:
            with conn:
                collect_wars(conn, api, clan_tag)
    return api


def main() -> int:
    token = os.environ.get("COC_API_TOKEN")
    if not token:
        log("COC_API_TOKEN is not set")
        return 2
    conn = db.connect(os.environ.get("FROSTED_DB", DEFAULT_DB))
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    with httpx.Client(base_url=API, headers=headers, timeout=20) as client:
        api = run_wars(conn, client) if "--wars" in sys.argv else run(conn, client, force_profiles="--profiles" in sys.argv)
    log(f"poll done: {api.calls} calls, {api.errors} errors")
    # A pass where every call failed (bad token, IP not on the key) should show as a failed unit.
    return 1 if api.calls and api.errors == api.calls else 0


if __name__ == "__main__":
    sys.exit(main())
