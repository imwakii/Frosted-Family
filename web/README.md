# Frosted Family web app

The CWL site that replaces the Streamlit dashboard. Vite, React, TypeScript and Tailwind CSS, deployed to Vercel as `frosted-family`.

Three tabs. **CWL** shows every member's clan and slot for the coming league, the moves due before sign-up, the live war line and a player sheet with score by cycle. **Explore** compares every member's heroes, equipment, troops, spells, pets and sieges: a sortable matrix on desktop, a ranked list per unit on phones, with a gold ★ on maxed levels. **Plan** is the leaders' allocation sandbox with live rule checks, behind Discord sign-in: leaders save a shared draft and the publisher publishes it.

## Data

The site reads `/api/roster`, `/api/war/live`, `/api/player/{tag}`, `/api/explore/matrix?cat=…`, `/api/clans`, `/api/auth/*` and `/api/plan/*`. `vercel.json` rewrites `/api/*` to `https://frostedcwl.duckdns.org/*` (the `server/` package). Change that one line if the host moves.

Unit, town hall and CWL league art lives in `public/icons/` (unit names snake_cased, e.g. `barbarian_king.png`) and `public/leagues/`. A unit with no icon shows its name, and a town hall with no image shows its number. Clan badges are not bundled; they load at runtime from the badge URLs `/api/clans` returns.

`npm run build` first runs `scripts/build-roster.mjs`, which writes `public/roster.json` from `../frosted_cwl_members.csv`, `../data/score_history.csv` and the latest `../data/raw/*/manifest.md`. The site falls back to that file whenever the API is unreachable, and always uses it for score history, rates and family rank. Tag is the key throughout; names are display only.

`cycle.json` holds what changes each month: the sign-up time and each clan's league and CWL status. Edit it alongside `CLAN_FORMAT` in `make_poster.py`.

## Commands

```bash
npm install
npm run dev       # regenerates roster.json, then serves on localhost:5173
npm run build     # roster.json, type check, production build into dist/
npm run preview   # serves dist/
```

In `npm run dev`, `?mock` fills Explore with synthetic levels and `?as=publisher`, `?as=leader` or `?as=member` previews the Plan tab signed in. Neither is in the production build.
