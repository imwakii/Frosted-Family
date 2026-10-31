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
- `leaders.py` serves `/explore/upgrades?days=7&clan=` (public: level-ups, unlocks and TH upgrades between profile
  snapshots, newest first), `/leaders/inactivity` and `/leaders/make-room?clan=`. The last two are public while
  `LEADERS_PUBLIC` is true (the default); set it to false in api.env and restart the API to lock them. Make-room
  lists reason codes and a sort key, never a decision. Until Discord sign-in, `POST /auth/passcode` checks
  `LEADER_PASSCODE` (5 failed tries per client and 30 overall per 15 minutes) and issues a leader session that
  cannot publish or save the plan (plan writes wait for Discord). Locked, with no passcode set, `/leaders/*` is 401.
- `pull_allocation.py` runs on the laptop: `python -m server.pull_allocation` writes the published allocation into
  `frosted_cwl_members.csv` (allocation columns only) for Ka Wai to commit. The server never writes to GitHub.
- `profiles.py` stores every member's `/players` profile (each level change kept in `player_unit_history`) and each
  clan's latest raid weekend every 2 hours, and serves `/explore/matrix?cat=heroes|equipment|troops|spells|pets|sieges` and
  `/explore/{heroes|equipment|army|donations|capital}`, one row per current member. `/explore/war?scope=all|cwl` is all-time war
  stars from the profile plus the war record: the latest cycle's clashspot war-statistics export (`baseline.py`) and,
  on top, the recorded wars whose battle started after each clan's `pull_date` in that cycle's manifest, so nothing
  counts twice. scope=cwl is the current season's recorded CWL wars only. Each unit has `max` (the game's max level) and `cap` (the max at the player's town hall),
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
