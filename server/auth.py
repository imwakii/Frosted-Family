"""Leader sign-in with Discord OAuth2 (authorization code flow, server side).

The browser only ever talks to the site's origin: /api/auth/* on frosted-family.vercel.app is rewritten to /auth/* here,
so the session cookie is a first-party cookie on the vercel.app origin. After Discord sends the leader back, the
callback reads their roles in the family server and signs them in only if they hold a configured leader or co-leader
role. The Discord access token is used once and never stored.

The session is a signed cookie (HMAC-SHA256 over the payload, SESSION_SECRET), valid for SESSION_HOURS. It holds the
Discord user id, display name, whether they may publish, and a CSRF token. Writes must echo that token in the
X-CSRF-Token header; GET /auth/me hands it to the page.

Config, all from /opt/bots/frosted/api.env, never the repo: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID,
DISCORD_LEADER_ROLE_IDS (comma list), DISCORD_PUBLISHER_ID, SESSION_SECRET. FROSTED_SITE_URL is the public site.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from server import appdb, db

DISCORD_API = "https://discord.com/api/v10"
DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize"
SCOPES = "identify guilds.members.read"
DEFAULT_SITE = "https://frosted-family.vercel.app"
SESSION_COOKIE = "__Host-ff_session"   # __Host-: Secure, Path=/, no Domain, so no subdomain can set or read it
STATE_COOKIE = "__Host-ff_oauth"
SESSION_HOURS = 12
STATE_MINUTES = 10

router = APIRouter(prefix="/auth")


@dataclass(frozen=True)
class Config:
    client_id: str
    client_secret: str
    guild_id: str
    leader_roles: frozenset[str]
    publisher_id: str
    secret: bytes
    site: str

    @property
    def redirect_uri(self) -> str:
        return f"{self.site}/api/auth/callback"


def config() -> Config | None:
    """None until every Discord setting is in the environment; sign-in then answers 503."""
    env = os.environ
    names = ("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID", "DISCORD_LEADER_ROLE_IDS",
             "DISCORD_PUBLISHER_ID", "SESSION_SECRET")
    if not all(env.get(n) for n in names):
        return None
    return Config(
        client_id=env["DISCORD_CLIENT_ID"], client_secret=env["DISCORD_CLIENT_SECRET"],
        guild_id=env["DISCORD_GUILD_ID"],
        leader_roles=frozenset(r.strip() for r in env["DISCORD_LEADER_ROLE_IDS"].split(",") if r.strip()),
        publisher_id=env["DISCORD_PUBLISHER_ID"].strip(), secret=env["SESSION_SECRET"].encode(),
        site=env.get("FROSTED_SITE_URL", DEFAULT_SITE).rstrip("/"),
    )


def need_config() -> Config:
    cfg = config()
    if not cfg:
        raise HTTPException(503, "leader sign-in is not configured")
    return cfg


def discord_client() -> httpx.Client:
    """Replaced in tests with a MockTransport client."""
    return httpx.Client(base_url=DISCORD_API, timeout=15)


# ─── signed values ────────────────────────────────────────────────────────────

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(payload: dict, secret: bytes) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    mac = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
    return f"{body}.{mac}"


def unsign(token: str | None, secret: bytes) -> dict | None:
    """The payload if the signature holds and it has not expired, else None."""
    if not token or "." not in token:
        return None
    body, mac = token.rsplit(".", 1)
    good = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(mac, good):
        return None
    try:
        payload = json.loads(_unb64(body))
    except ValueError:
        return None
    return payload if payload.get("exp", 0) > time.time() else None


def set_cookie(resp, name: str, value: str, max_age: int) -> None:
    resp.set_cookie(name, value, max_age=max_age, path="/", secure=True, httponly=True, samesite="lax")


# ─── sessions ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Leader:
    id: str
    name: str
    avatar_url: str | None
    can_publish: bool
    csrf: str


def current_leader(ff_session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> Leader | None:
    cfg = config()
    p = unsign(ff_session, cfg.secret) if cfg else None
    if not p:
        return None
    # Publish rights are re-read from config on every request, so changing DISCORD_PUBLISHER_ID takes effect at once.
    return Leader(id=p["uid"], name=p["name"], avatar_url=p.get("avatar"), can_publish=p["uid"] == cfg.publisher_id,
                  csrf=p["csrf"])


def require_leader(leader: Leader | None = Depends(current_leader)) -> Leader:
    if not leader:
        raise HTTPException(401, "sign in as a leader")
    return leader


def require_leader_write(leader: Leader = Depends(require_leader),
                         x_csrf_token: str | None = Header(default=None)) -> Leader:
    if not x_csrf_token or not hmac.compare_digest(x_csrf_token, leader.csrf):
        raise HTTPException(403, "missing or wrong X-CSRF-Token")
    return leader


def require_publisher(leader: Leader = Depends(require_leader_write)) -> Leader:
    if not leader.can_publish:
        raise HTTPException(403, "only the publisher can publish")
    return leader


# ─── routes ───────────────────────────────────────────────────────────────────

DEFAULT_RETURN = "/#/plan"


def safe_return(path: str | None) -> str:
    """A path on the site, never another host: '/...' but not '//host', a backslash form, or control characters."""
    if not path or not path.startswith("/") or path.startswith(("//", "/\\")) or any(ord(c) < 32 for c in path):
        return DEFAULT_RETURN
    return path


def with_outcome(path: str, outcome: str) -> str:
    """'/#/plan' -> '/?signin=denied#/plan'."""
    base, hash_ = (path.split("#", 1) + [""])[:2]
    base += ("&" if "?" in base else "?") + f"signin={outcome}"
    return base + (f"#{hash_}" if hash_ else "")


@router.get("/login")
def login(return_to: str | None = None, cfg: Config = Depends(need_config)):
    state = secrets.token_urlsafe(24)
    query = urlencode({"response_type": "code", "client_id": cfg.client_id, "scope": SCOPES, "state": state,
                       "redirect_uri": cfg.redirect_uri, "prompt": "none"})
    resp = RedirectResponse(f"{DISCORD_AUTHORIZE}?{query}", status_code=302)
    saved = {"state": state, "return_to": safe_return(return_to), "exp": time.time() + STATE_MINUTES * 60}
    set_cookie(resp, STATE_COOKIE, sign(saved, cfg.secret), STATE_MINUTES * 60)
    return resp


def back_to_site(cfg: Config, path: str, outcome: str | None = None) -> RedirectResponse:
    resp = RedirectResponse(cfg.site + (with_outcome(path, outcome) if outcome else path), status_code=302)
    resp.delete_cookie(STATE_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    return resp


def avatar_url(u: dict) -> str | None:
    return f"https://cdn.discordapp.com/avatars/{u['id']}/{u['avatar']}.png?size=64" if u.get("avatar") else None


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
             cfg: Config = Depends(need_config)):
    saved = unsign(request.cookies.get(STATE_COOKIE), cfg.secret)
    back = safe_return(saved.get("return_to")) if saved else DEFAULT_RETURN
    if error or not code or not state or not saved or not hmac.compare_digest(saved["state"], state):
        return back_to_site(cfg, back, "failed")
    with discord_client() as dc:
        tok = dc.post("/oauth2/token", auth=(cfg.client_id, cfg.client_secret), data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": cfg.redirect_uri})
        if tok.status_code != 200:
            return back_to_site(cfg, back, "failed")
        bearer = {"Authorization": f"Bearer {tok.json()['access_token']}"}
        user = dc.get("/users/@me", headers=bearer)
        member = dc.get(f"/users/@me/guilds/{cfg.guild_id}/member", headers=bearer)
    if user.status_code != 200:
        return back_to_site(cfg, back, "failed")
    u = user.json()
    m = member.json() if member.status_code == 200 else {}
    if not (set(m.get("roles", [])) & cfg.leader_roles):
        return back_to_site(cfg, back, "denied")  # not in the server, or no leader role
    name = m.get("nick") or u.get("global_name") or u.get("username") or u["id"]
    with appdb.connect() as conn:
        conn.execute("""INSERT INTO leaders VALUES (?,?,?,?) ON CONFLICT (user_id) DO UPDATE SET
                          name=excluded.name, avatar_url=excluded.avatar_url, last_sign_in=excluded.last_sign_in""",
                     (u["id"], name, avatar_url(u), db.utcnow()))
    resp = back_to_site(cfg, back)
    session = {"uid": u["id"], "name": name, "avatar": avatar_url(u), "csrf": secrets.token_urlsafe(24),
               "exp": time.time() + SESSION_HOURS * 3600}
    set_cookie(resp, SESSION_COOKIE, sign(session, cfg.secret), SESSION_HOURS * 3600)
    return resp


@router.get("/me")
def me(leader: Leader | None = Depends(current_leader)):
    cfg = config()
    publishers = []
    if cfg:
        with appdb.connect() as conn:
            row = conn.execute("SELECT name FROM leaders WHERE user_id=?", (cfg.publisher_id,)).fetchone()
        publishers = [row["name"]] if row else []  # named once the publisher has signed in here
    return {
        "user": {"id": leader.id, "name": leader.name, "avatar_url": leader.avatar_url} if leader else None,
        "role": ("publisher" if leader.can_publish else "leader") if leader else None,
        "publishers": publishers,
        "csrf": leader.csrf if leader else None,
        "configured": cfg is not None,
    }


@router.post("/logout", status_code=204)
def logout():
    # No CSRF check: the worst a forged logout does is sign a leader out.
    resp = Response(status_code=204)
    resp.delete_cookie(SESSION_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    return resp
