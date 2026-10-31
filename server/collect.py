"""War collector: one pass over the three clans, run every 10 minutes by frosted-collect.timer.

The official API only ever shows the current war, so anything not polled while it is live is lost. Each pass stores
member snapshots, the current regular war, the CWL league group and each of its rounds' wars that involve one of our
clans. A 403 (war log private), 404 (not in war, not in CWL) or a network failure is logged as a status code and the
pass moves on. The token comes from COC_API_TOKEN and is never printed.

    python -m server.collect                 # uses FROSTED_DB, default /opt/bots/frosted/data/frosted.db
    python -m server.collect --profiles      # also fetch every member's profile now (otherwise every 12 hours)
"""
from __future__ import annotations

import os
import sys
from urllib.parse import quote

import httpx

from frosted.config import CLAN_TAGS
from server import db, profiles

API = "https://api.clashofclans.com/v1"
DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
OUR_TAGS = set(CLAN_TAGS.values())


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
    """One clan's members and wars. Returns the member tags."""
    members = api.get(f"/clans/{enc(clan_tag)}/members", quiet=(404,))
    items = members.get("items", []) if members else []
    if members is not None:
        db.upsert_members(conn, clan_tag, items, now)

    war = api.get(f"/clans/{enc(clan_tag)}/currentwar")
    # During CWL this endpoint reports notInWar; the league wars come through the group below.
    if war and war.get("state") not in (None, "notInWar") and "preparationStartTime" in war:
        db.upsert_war(conn, war, kind="regular")

    group = api.get(f"/clans/{enc(clan_tag)}/currentwar/leaguegroup")
    if group:
        collect_league_group(conn, api, group)
    return [m["tag"] for m in items]


def collect_league_group(conn, api: Api, group: dict) -> None:
    season = group.get("season")
    for i, rnd in enumerate(group.get("rounds", []), start=1):
        for tag in rnd.get("warTags", []):
            if tag == "#0":  # round not drawn yet
                continue
            known = conn.execute("SELECT ours, state FROM cwl_war_tags WHERE war_tag=?", (tag,)).fetchone()
            if known and (known["ours"] == 0 or known["state"] == "warEnded"):
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
            if ours:
                db.upsert_war(conn, war, kind="cwl", war_tag=tag, season=season, round_no=i)


def collect_profiles(conn, api: Api, tags: list[str], now: str) -> None:
    """Every current member's /players profile, and each clan's latest raid weekend. About twice a day: profiles change
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
    with conn:
        conn.execute("INSERT OR REPLACE INTO polls VALUES (?,?,?,?)", (started, db.utcnow(), api.calls, api.errors))
    return api


def main() -> int:
    token = os.environ.get("COC_API_TOKEN")
    if not token:
        log("COC_API_TOKEN is not set")
        return 2
    conn = db.connect(os.environ.get("FROSTED_DB", DEFAULT_DB))
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    with httpx.Client(base_url=API, headers=headers, timeout=20) as client:
        api = run(conn, client, force_profiles="--profiles" in sys.argv)
    log(f"poll done: {api.calls} calls, {api.errors} errors")
    # A pass where every call failed (bad token, IP not on the key) should show as a failed unit.
    return 1 if api.calls and api.errors == api.calls else 0


if __name__ == "__main__":
    sys.exit(main())
