# server

War collector and read API for the Frosted Family site, on the bots droplet under `/opt/bots/frosted`.

- `collect.py` polls the official Clash of Clans API every 10 minutes (`frosted-collect.timer`) and stores member
  snapshots, wars, war members and every attack in `/opt/bots/frosted/data/frosted.db`. The API only shows the
  current war, so a war that is not polled while live is lost.
- `api.py` serves `/roster`, `/war/live` and `/player/{tag}` on 127.0.0.1:8090. Caddy publishes it at
  `FROSTED_API_HOST`, set once in `deploy/setup.sh` (provisionally `frostedcwl.duckdns.org`). The site reaches it
  through a Vercel rewrite. The `/plan/*` routes are stubs that refuse every request until leader sign-in is decided.
- `db.py` holds the schema. Missed attacks are the `missed_attacks` view: attack slots left unused in ended wars.
- `auth.py` is leader sign-in with Discord (`/auth/login`, `/auth/callback`, `/auth/me`, `/auth/logout`). A leader
  is anyone holding one of `DISCORD_LEADER_ROLE_IDS` in the family server. Writes need the `X-CSRF-Token` that
  `/auth/me` returns.
- `plan.py` is the Plan tab: `/plan/draft` (each leader's own), `/plan/drafts` (everyone's), `/plan/check` and
  `/plan/publish` (only `DISCORD_PUBLISHER_ID`, after the server re-runs the 15 CORE, 50 cap, valve and Maki
  checks). The latest publish overrides `/roster` by tag while the CSV is unchanged. `/allocation.csv` serves it.
- `pull_allocation.py` runs on the laptop: `python -m server.pull_allocation` writes the published allocation into
  `frosted_cwl_members.csv` (allocation columns only) for Ka Wai to commit. The server never writes to GitHub.
- `profiles.py` stores every member's `/players` profile twice a day and serves `/explore/{heroes|equipment|army|war|
  donations|capital}`. Percentages are progress to the game's max level, not a town hall cap: no rushed check, as
  there is no reliable current source for per-TH caps. Pets, siege machines and super troops are told apart by the
  name lists in `data/unit_kinds.json`.

`frosted_cwl_members.csv` stays canonical for allocation. The API reads it from the server's checkout, so a new
roster reaches the site when the checkout is updated (`setup.sh install` again).

Secrets live only in `/opt/bots/frosted/api.env`: `COC_API_TOKEN` and the Discord settings. Clash of Clans keys are locked to IP
addresses, so the key must list the droplet's address.

```bash
sudo bash /opt/bots/frosted/repo/server/deploy/setup.sh status
```

Tests: `tests/test_server.py`, fixture JSON in `tests/fixtures/coc/`, no live calls.
