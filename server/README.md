# server

War collector and read API for the Frosted Family site, on the bots droplet under `/opt/bots/frosted`.

- `collect.py` polls the official Clash of Clans API every 10 minutes (`frosted-collect.timer`) and stores member
  snapshots, wars, war members and every attack in `/opt/bots/frosted/data/frosted.db`. The API only shows the
  current war, so a war that is not polled while live is lost.
- `api.py` serves `/roster`, `/war/live` and `/player/{tag}` on 127.0.0.1:8090. Caddy publishes it as
  `cwl-api.ngkawai.dev`; the site reaches it through a Vercel rewrite. The `/plan/*` routes are stubs that refuse
  every request until leader sign-in is decided.
- `db.py` holds the schema. Missed attacks are the `missed_attacks` view: attack slots left unused in ended wars.

`frosted_cwl_members.csv` stays canonical for allocation. The API reads it from the server's checkout, so a new
roster reaches the site when the checkout is updated (`setup.sh install` again).

The token lives only in `/opt/bots/frosted/api.env` as `COC_API_TOKEN=...`. Clash of Clans keys are locked to IP
addresses, so the key must list the droplet's address.

```bash
sudo bash /opt/bots/frosted/repo/server/deploy/setup.sh status
```

Tests: `tests/test_server.py`, fixture JSON in `tests/fixtures/coc/`, no live calls.
