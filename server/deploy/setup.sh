#!/usr/bin/env bash
# Frosted Family collector and API on the bots droplet (bots-sgp1), beside the finance app. Run as root.
# Every step is idempotent, so a rerun repairs drift and doubles as the update. Nothing here holds a secret: the
# Clash of Clans token goes in /opt/bots/frosted/api.env by hand and is never printed.
#
#   bash setup.sh install   user, repo checkout (public, over HTTPS), venv, systemd units; starts the API, the
#                           30-minute roster pull (main only), and the collector timer once api.env has COC_API_TOKEN
#   bash setup.sh caddy     the API's site block for FROSTED_API_HOST, imported into /etc/caddy/Caddyfile
#   bash setup.sh status    units, last collector run, row counts
#   bash setup.sh leader-link          print the leaders' private sign-in link (makes a key the first time)
#   bash setup.sh rotate-leader-link   new key, prints the new link; every leader signed in with the old one is
#                                      signed out (when a leader leaves)
#
# Variables: FROSTED_BRANCH (main), FROSTED_API_HOST (the API's public hostname, set once below).
#
# The finance setup.sh `web` phase rewrites /etc/caddy/Caddyfile and drops the import line. Rerun `setup.sh caddy`
# after it, until the finance renderer emits the import itself.
set -euo pipefail

cd /  # the bot user cannot stat the admin's home, so sudo -u from there fails (finance setup.sh, 23 Oct 2026)
BOTS=/opt/bots
BOT=frosted
BOT_HOME="$BOTS/$BOT"
BRANCH="${FROSTED_BRANCH:-main}"
# The one place the hostname is set. A free DuckDNS name pointed at this droplet; nothing on ngkawai.dev.
FROSTED_API_HOST="${FROSTED_API_HOST:-frostedcwl.duckdns.org}"
REPO_URL=https://github.com/imwakii/Frosted-Family.git
DEPLOY="$BOT_HOME/repo/server/deploy"  # units come from the checkout, so a first run from a downloaded copy works
SITES=/etc/caddy/sites
IMPORT_LINE="import $SITES/*.caddy"

need_root() { [ "$(id -u)" -eq 0 ] || { echo "run as root (sudo bash setup.sh ...)"; exit 1; }; }
as_bot() { sudo -u "$BOT" -H "$@"; }

install_app() {
  getent group bots >/dev/null || groupadd bots
  id "$BOT" >/dev/null 2>&1 || useradd --system --home-dir "$BOT_HOME" --no-create-home --shell /usr/sbin/nologin \
    --gid bots "$BOT"
  install -d -m 755 -o "$BOT" -g bots "$BOT_HOME" "$BOT_HOME/data"
  # The token file: root only, read by systemd. Created empty; the token is pasted in by hand.
  [ -f "$BOT_HOME/api.env" ] || install -m 600 -o root -g root /dev/null "$BOT_HOME/api.env"
  # A file made by hand may be world-readable; the token is for root (systemd) only.
  chown root:root "$BOT_HOME/api.env"; chmod 600 "$BOT_HOME/api.env"

  if [ -d "$BOT_HOME/repo/.git" ]; then
    as_bot git -C "$BOT_HOME/repo" fetch -q origin "$BRANCH"
    as_bot git -C "$BOT_HOME/repo" checkout -q -B "$BRANCH" "origin/$BRANCH"
  else
    as_bot git clone -q --branch "$BRANCH" "$REPO_URL" "$BOT_HOME/repo"
  fi
  [ -x "$BOT_HOME/venv/bin/python" ] || as_bot python3 -m venv "$BOT_HOME/venv"
  as_bot "$BOT_HOME/venv/bin/pip" install -q --upgrade pip
  as_bot "$BOT_HOME/venv/bin/pip" install -q -r "$BOT_HOME/repo/server/requirements.txt"

  cp "$DEPLOY"/frosted-api.service "$DEPLOY"/frosted-collect.service "$DEPLOY"/frosted-collect.timer \
    "$DEPLOY"/frosted-pull.service "$DEPLOY"/frosted-pull.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable -q frosted-api
  systemctl restart frosted-api
  # Keeps the checkout on main so a pushed roster reaches /roster within 30 minutes. Main only: a branch install
  # (FROSTED_BRANCH=...) leaves the timer off so it cannot move the checkout back.
  if [ "$BRANCH" = main ]; then systemctl enable -q --now frosted-pull.timer; else systemctl disable -q --now frosted-pull.timer 2>/dev/null || true; fi
  if grep -q '^COC_API_TOKEN=.\+' "$BOT_HOME/api.env"; then
    systemctl enable -q --now frosted-collect.timer
    systemctl start frosted-collect.service || true  # one pass now; its outcome shows in `status`
    echo "Collector timer on (every 10 minutes)."
  else
    echo "api.env has no COC_API_TOKEN yet: add it, then rerun install to start the collector."
  fi
  echo "API on 127.0.0.1:8090, branch $BRANCH at $(as_bot git -C "$BOT_HOME/repo" rev-parse --short HEAD)."
}

caddy_site() {
  install -d -m 755 "$SITES"
  sed "s/__FROSTED_API_HOST__/$FROSTED_API_HOST/g" "$DEPLOY/frosted.caddy" > "$SITES/frosted.caddy"
  chmod 644 "$SITES/frosted.caddy"
  grep -qxF "$IMPORT_LINE" /etc/caddy/Caddyfile || printf '\n%s\n' "$IMPORT_LINE" >> /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  systemctl reload caddy
  echo "$FROSTED_API_HOST served (the DuckDNS name must point at this droplet before Caddy can get a certificate)."
}

status() {
  systemctl --no-pager --lines=0 status frosted-api frosted-collect.timer frosted-pull.timer || true
  echo "checkout: $(as_bot git -C "$BOT_HOME/repo" rev-parse --abbrev-ref HEAD) at $(as_bot git -C "$BOT_HOME/repo" rev-parse --short HEAD)"
  journalctl -u frosted-collect --no-pager -n 5 -o cat || true
  if [ -f "$BOT_HOME/data/frosted.db" ]; then
    as_bot "$BOT_HOME/venv/bin/python" - "$BOT_HOME/data/frosted.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
for t in ("polls", "member_snapshots", "wars", "war_members", "attacks"):
    print(f"{t:18} {c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
print("last poll        ", c.execute("SELECT MAX(finished_at) FROM polls").fetchone()[0])
PY
  fi
}

# ─── the leaders' private link ───────────────────────────────────────────────
# The key lives only in api.env as LEADER_LINK_KEY (an older LEADER_PASSCODE line is read the same way). These
# commands print the link on the server for Ka Wai to copy; the key never goes anywhere else.
SITE_URL=https://frosted-family.vercel.app

current_key() {
  local k
  k="$(sed -n 's/^LEADER_LINK_KEY=//p' "$BOT_HOME/api.env" | tail -n1)"
  [ -n "$k" ] || k="$(sed -n 's/^LEADER_PASSCODE=//p' "$BOT_HOME/api.env" | tail -n1)"
  printf '%s' "$k"
}

print_link() { echo "$SITE_URL/api/auth/leader-link?k=$(current_key)"; }

rotate_leader_link() {
  local key tmp
  # 32 random bytes, base64url without padding: 43 characters, safe in a URL as is.
  key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  tmp="$(mktemp "$BOT_HOME/api.env.XXXXXX")"
  grep -v -e '^LEADER_LINK_KEY=' -e '^LEADER_PASSCODE=' "$BOT_HOME/api.env" > "$tmp" || true
  echo "LEADER_LINK_KEY=$key" >> "$tmp"
  chown root:root "$tmp"; chmod 600 "$tmp"; mv "$tmp" "$BOT_HOME/api.env"
  systemctl restart frosted-api  # reads the new key; sessions made with the old one stop working
  echo "New leaders' link (the old one and every session made with it no longer work):"
  print_link
}

leader_link() {
  if [ -z "$(current_key)" ]; then rotate_leader_link; return; fi
  print_link
}

# Sourced with SETUP_SOURCE_ONLY=1 to try the functions without root.
[ "${SETUP_SOURCE_ONLY:-}" = 1 ] && return 0

need_root
case "${1:-}" in
  install) install_app ;;
  caddy) caddy_site ;;
  status) status ;;
  leader-link) leader_link ;;
  rotate-leader-link) rotate_leader_link ;;
  *) sed -n 2,18p "$0"; exit 1 ;;
esac
