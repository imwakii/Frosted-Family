# Frosted Family web app

The CWL site that replaces the Streamlit dashboard. Vite, React, TypeScript and Tailwind CSS, deployed to Vercel as `frosted-family`.

Two tabs. **CWL** shows every member's clan and slot for the coming league, the moves due before sign-up, the live war line and a player sheet with score by cycle. **Plan** is the leaders' allocation sandbox with live rule checks; it sits behind a placeholder gate until leader sign-in exists.

## Data

The site reads `/api/roster`, `/api/war/live` and `/api/player/{tag}`. `vercel.json` rewrites `/api/*` to `https://frostedcwl.duckdns.org/*` (provisional host; the `server/` package on the `cwl-server` branch). Change that one line if the host moves.

`npm run build` first runs `scripts/build-roster.mjs`, which writes `public/roster.json` from `../frosted_cwl_members.csv`, `../data/score_history.csv` and the latest `../data/raw/*/manifest.md`. The site falls back to that file whenever the API is unreachable, and always uses it for score history, rates and family rank. Tag is the key throughout; names are display only.

`cycle.json` holds what changes each month: the sign-up time and each clan's league and CWL status. Edit it alongside `CLAN_FORMAT` in `make_poster.py`.

## Commands

```bash
npm install
npm run dev       # regenerates roster.json, then serves on localhost:5173
npm run build     # roster.json, type check, production build into dist/
npm run preview   # serves dist/
```

The Plan tab is open in `npm run dev`. A deployment opens it only when the environment variable `VITE_PLAN_OPEN=1` is set, so leave that unset on the public site.
