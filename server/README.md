# server

War collector and read API for the Frosted Family site, on the bots droplet under `/opt/bots/frosted`.

- `collect.py` polls the official Clash of Clans API every 10 minutes (`frosted-collect.timer`) and stores member
  snapshots, wars, war members and every attack in `/opt/bots/frosted/data/frosted.db`. The API only shows the
  current war, so a war that is not polled while live is lost.
- `api.py` serves `/roster`, `/war/live` and `/player/{tag}` on 127.0.0.1:8090. Caddy publishes it at
  `FROSTED_API_HOST`, set once in `deploy/setup.sh` (provisionally `frostedcwl.duckdns.org`). The site reaches it
  through a Vercel rewrite.
- `db.py` holds the collector's schema. Missed attacks are the `missed_attacks` view: attack slots left unused in
  ended wars. `appdb.py` holds what the API writes (`app.db`): the shared draft, publishes, signed-in leaders.
- `auth.py` is leader sign-in with Discord (`/auth/login?return_to=`, `/auth/callback`, `/auth/me`,
  `/auth/logout`). A leader is anyone holding one of `DISCORD_LEADER_ROLE_IDS` in the family server. Writes need
  the `X-CSRF-Token` that `/auth/me` returns.
- `plan.py` is the Plan tab: `/plan/draft` (one shared draft, last write wins), `/plan/check` and `/plan/publish`
  (only `DISCORD_PUBLISHER_ID`, after the server re-runs the 15 CORE, 50 cap, valve and Maki checks; a failure is
  422 with the problems). The latest publish overrides `/roster` by tag while the CSV is unchanged.
  `/allocation.csv` serves it.
- `pull_allocation.py` runs on the laptop: `python -m server.pull_allocation` writes the published allocation into
  `frosted_cwl_members.csv` (allocation columns only) for Ka Wai to commit. The server never writes to GitHub.
- `profiles.py` stores every member's `/players` profile and each clan's latest raid weekend twice a day, and serves
  `/explore/{heroes|equipment|army|war|donations|capital}`, one row per current member. `war` counts the wars this
  collector recorded. Each unit has `max` (the game's max level) and `cap` (the max at the player's town hall),
  which is always null: no source for per-TH caps is both official and current, so there is no rushed check yet.
  Pets, siege machines and super troops are told apart by the name lists in `data/unit_kinds.json`.

`frosted_cwl_members.csv` stays canonical for allocation. The API reads it from the server's checkout, so a new
roster reaches the site when the checkout is updated (`setup.sh install` again).

Secrets live only in `/opt/bots/frosted/api.env`: `COC_API_TOKEN`, the Discord settings and `SESSION_SECRET`.
Clash of Clans keys are locked to IP addresses, so the key must list the droplet's address.

```bash
sudo bash /opt/bots/frosted/repo/server/deploy/setup.sh status
```

Tests: `tests/test_server.py` and `tests/test_leaders.py`, fixture JSON in `tests/fixtures/coc/`, Discord mocked,
no live calls.
