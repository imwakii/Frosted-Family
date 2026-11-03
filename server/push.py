"""Phones that asked for alerts. A member turns alerts on from their own player card; the browser hands over a push address
and this keeps it with the player tags they marked as theirs and which alerts they want. No name or account is stored.
The key that signs each push (VAPID) is made on first use and stays in the data folder. server/notify.py does the sending.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server import appdb, db

MAX_SUBSCRIPTIONS = 2000
# Where browsers' push services live. Anything else would have the server post to an address a stranger chose.
PUSH_HOSTS = ("fcm.googleapis.com", ".push.apple.com", ".notify.windows.com", "push.services.mozilla.com",
              "updates.push.services.mozilla.com")
ALERTS = ("attacks", "days", "war")

router = APIRouter(prefix="/push")

SCHEMA = """
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,        -- the push address the browser gave
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    tags TEXT NOT NULL,               -- JSON list of the player tags this person marked as theirs
    alerts TEXT NOT NULL,             -- JSON {attacks, days, war}
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_sent (
    endpoint TEXT NOT NULL,
    key TEXT NOT NULL,                -- kind|war|tag: each alert goes once
    at TEXT NOT NULL,
    PRIMARY KEY (endpoint, key)
);
"""


def connect():
    conn = appdb.connect()
    conn.executescript(SCHEMA)
    return conn


def key_path() -> Path:
    return Path(os.environ.get("FROSTED_APP_DB", appdb.DEFAULT_APP_DB)).parent / "vapid.pem"


def public_key() -> str:
    """The signing key's public half, as browsers want it. Makes the pair the first time."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    path = key_path()
    if not path.exists():
        pem = ec.generate_private_key(ec.SECP256R1()).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(pem)
        os.replace(tmp, path)
    point = serialization.load_pem_private_key(path.read_bytes(), password=None).public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(point).rstrip(b"=").decode()


def allowed_endpoint(url: str) -> bool:
    u = urlparse(url)
    host = u.hostname or ""
    return u.scheme == "https" and any(host.endswith(h) if h.startswith(".") else host == h for h in PUSH_HOSTS)


class Keys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class Subscribe(BaseModel):
    endpoint: str = Field(max_length=1000)
    keys: Keys
    tags: list[str] = Field(max_length=10)
    alerts: dict[str, bool]


class Unsubscribe(BaseModel):
    endpoint: str = Field(max_length=1000)


@router.get("/key")
def get_key():
    return {"key": public_key()}


@router.post("/subscribe")
def subscribe(body: Subscribe):
    if not allowed_endpoint(body.endpoint):
        raise HTTPException(422, "not a push address")
    tags = [t for t in body.tags if t.startswith("#") and len(t) <= 15]
    alerts = {k: bool(body.alerts.get(k)) for k in ALERTS}
    with connect() as conn:
        known = conn.execute("SELECT 1 FROM push_subscriptions WHERE endpoint=?", (body.endpoint,)).fetchone()
        if not known and conn.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0] >= MAX_SUBSCRIPTIONS:
            raise HTTPException(429, "full")
        conn.execute(
            """INSERT INTO push_subscriptions VALUES (?,?,?,?,?,?) ON CONFLICT (endpoint) DO UPDATE SET
               p256dh=excluded.p256dh, auth=excluded.auth, tags=excluded.tags, alerts=excluded.alerts, updated_at=excluded.updated_at""",
            (body.endpoint, body.keys.p256dh, body.keys.auth, json.dumps(tags), json.dumps(alerts), db.utcnow()))
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(body: Unsubscribe):
    with connect() as conn:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (body.endpoint,))
        conn.execute("DELETE FROM push_sent WHERE endpoint=?", (body.endpoint,))
    return {"ok": True}
