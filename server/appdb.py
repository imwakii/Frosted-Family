"""app.db: what the API itself writes, kept apart from the collector's frosted.db. The family's shared plan draft,
every publish, and the leaders who have signed in (so /auth/me can name the publisher)."""
from __future__ import annotations

import os
import sqlite3

DEFAULT_APP_DB = "/opt/bots/frosted/data/app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS drafts (
    draft_id TEXT PRIMARY KEY,        -- 'family': one shared draft, last write wins
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
);
CREATE TABLE IF NOT EXISTS publishes (
    published_at TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT,
    base_sha256 TEXT NOT NULL,        -- the roster CSV this was published against
    override_valve INTEGER NOT NULL,
    moves TEXT NOT NULL,              -- as submitted
    allocation TEXT NOT NULL          -- {tag: {clan, cwl_slot, transferred_from}} for every tagged player
);
CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,               -- 'days' or 'lineup'
    season TEXT NOT NULL,             -- the CWL season for days; '' for lineup
    author_id TEXT NOT NULL,
    author_name TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL,             -- open, accepted, rejected or withdrawn
    updated_at TEXT NOT NULL,
    decided_by TEXT,
    decided_at TEXT
);
CREATE TABLE IF NOT EXISTS reactions (
    target TEXT NOT NULL,             -- what was reacted to: see server/reactions.py
    emoji TEXT NOT NULL,
    user_id TEXT NOT NULL,            -- Discord id
    name TEXT,                        -- their name in the family's server when they reacted
    at TEXT NOT NULL,
    PRIMARY KEY (target, emoji, user_id)
);
CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,                -- UTC
    visitor TEXT NOT NULL,            -- a random id the browser made up, tied to nothing
    PRIMARY KEY (day, visitor)
);
CREATE TABLE IF NOT EXISTS leaders (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    avatar_url TEXT,
    last_sign_in TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(os.environ.get("FROSTED_APP_DB", DEFAULT_APP_DB))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn
