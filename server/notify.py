"""Sends the alerts members asked for, once a minute (frosted-notify.timer). Apart from the collector, so a push failing
can never stop war collection. Reads the collector's database and writes only app.db.

    attacks   a member of a war has an attack left with two hours or less to go
    days      the round in preparation, for a member the published day plan has on that day
    war       a war has just started, for a clan one of the member's accounts is in. Off unless asked for.
    hello     once, when a phone signs up, so its owner knows alerts reach them

Each goes once per phone, per war and per player. A push service saying the phone has gone removes it.

    python -m server.notify
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import db, push

DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
SITE = "https://frosted-family.vercel.app"
ATTACK_WINDOW = timedelta(hours=2)
STARTED_WINDOW = timedelta(minutes=30)
STALE = timedelta(minutes=15)  # older than this, "has an attack left" may no longer be true
KEEP_SENT = timedelta(days=60)
OURS = set(CLAN_TAGS.values())


class Gone(Exception):
    """The push service says this phone no longer exists."""


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def when(s: str | None) -> datetime | None:
    return datetime.strptime(s[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc) if s else None


def span(d: timedelta) -> str:
    mins = max(1, round(d.total_seconds() / 60))
    if mins < 60:
        return f"{mins} minutes" if mins > 1 else "1 minute"
    hours = round(mins / 60)
    return f"{hours} hours" if hours > 1 else "1 hour"


def sides(w) -> tuple[str | None, str | None]:
    """Our clan's name and the opponent's, whichever side the API put us on."""
    if w["clan_tag"] in OURS:
        return TAG_TO_CLAN.get(w["clan_tag"]), w["opponent_name"]
    if w["opponent_tag"] in OURS:
        return TAG_TO_CLAN.get(w["opponent_tag"]), w["clan_name"]
    return None, None


def published_days(app, season: str | None) -> dict:
    try:
        row = app.execute("SELECT body FROM day_plans WHERE season=? AND state='published'", ((season or "")[:7],)).fetchone()  # plans are kept by month
    except sqlite3.OperationalError:  # no plan has ever been saved
        return {}
    return json.loads(row["body"]) if row else {}


def alerts_for(sub: dict, wars: list, members: dict, game, app, now: datetime) -> list[dict]:
    """Every alert this phone should have now, whether or not it has gone; the caller skips what has."""
    out = [{"key": "hello", "title": "Alerts are on", "body": "Frosted will tell you here.", "url": "#/war"}]
    tags, want = sub["tags"], sub["alerts"]
    for w in wars:
        clan, rival = sides(w)
        if not clan:
            continue
        start, end = when(w["start_time"]), when(w["end_time"])
        fresh = w["updated_at"] >= (now - STALE).strftime("%Y-%m-%dT%H:%M:%SZ")
        if want.get("attacks") and w["state"] == "inWar" and fresh and end and now < end <= now + ATTACK_WINDOW:
            allowed = w["attacks_per_member"] or (1 if w["kind"] == "cwl" else 2)
            for tag in tags:
                m = game.execute("SELECT name, attacks_used FROM war_members WHERE war_key=? AND player_tag=?", (w["war_key"], tag)).fetchone()
                if m and m["attacks_used"] < allowed:
                    left = allowed - m["attacks_used"]
                    out.append({"key": f"attacks|{w['war_key']}|{tag}", "title": f"{m['name']} has {'an attack' if left == 1 else f'{left} attacks'} left",
                                "body": f"{clan} v {rival} ends in {span(end - now)}.", "url": "#/war"})
        if want.get("days") and w["kind"] == "cwl" and w["state"] == "preparation" and start and start > now:
            day = published_days(app, w["season"]).get(clan, {}).get(str(w["round"]), [])
            for tag in tags:
                if tag in day:
                    name = members.get(tag, {}).get("name")
                    out.append({"key": f"days|{w['war_key']}|{tag}", "title": f"Day {w['round']}: {name} is in" if name else f"Day {w['round']}: you're in",
                                "body": f"{clan} v {rival} starts in {span(start - now)}.", "url": "#/cwl"})
        if want.get("war") and w["state"] == "inWar" and start and now - STARTED_WINDOW <= start <= now:
            if any(TAG_TO_CLAN.get(members.get(t, {}).get("clan_tag")) == clan for t in tags):
                out.append({"key": f"war|{w['war_key']}", "title": f"{clan} war started", "body": f"{clan} v {rival} is on.", "url": "#/war"})
    return out


def web_push(sub: dict, message: dict) -> None:
    """Sends one push. Raises Gone when the phone has gone; anything else that fails is tried again next minute."""
    from pywebpush import WebPushException, webpush
    push.public_key()  # makes the signing key if the API has not yet
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=json.dumps({k: message[k] for k in ("title", "body", "url")}), ttl=3600, timeout=15,
                vapid_private_key=str(push.key_path()), vapid_claims={"sub": SITE})
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            raise Gone from e
        raise


def run(game, app, send: Callable[[dict, dict], None] = web_push, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    subs = [{**dict(r), "tags": json.loads(r["tags"]), "alerts": json.loads(r["alerts"])} for r in app.execute("SELECT * FROM push_subscriptions")]
    if not subs:
        return 0
    wars = game.execute("SELECT * FROM wars WHERE state IN ('inWar', 'preparation')").fetchall()
    members = db.latest_members(game)
    sent = 0
    for sub in subs:
        have = {r["key"] for r in app.execute("SELECT key FROM push_sent WHERE endpoint=?", (sub["endpoint"],))}
        for message in alerts_for(sub, wars, members, game, app, now):
            if message["key"] in have:
                continue
            try:
                send(sub, message)
            except Gone:
                with app:
                    app.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (sub["endpoint"],))
                    app.execute("DELETE FROM push_sent WHERE endpoint=?", (sub["endpoint"],))
                break
            except Exception as e:  # one phone's failure must not stop the others; the address is never printed
                log(f"push failed: {type(e).__name__}")
                continue
            with app:
                app.execute("INSERT OR REPLACE INTO push_sent VALUES (?,?,?)", (sub["endpoint"], message["key"], db.utcnow()))
            sent += 1
    with app:
        # hello stays, or a phone would be greeted again two months on.
        app.execute("DELETE FROM push_sent WHERE key != 'hello' AND at < ?", ((now - KEEP_SENT).strftime("%Y-%m-%dT%H:%M:%SZ"),))
    return sent


def main() -> int:
    path = os.environ.get("FROSTED_DB", DEFAULT_DB)
    if not Path(path).exists():
        return 0
    sent = run(db.connect_readonly(path), push.connect())
    if sent:
        log(f"{sent} alerts sent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
