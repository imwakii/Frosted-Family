# Frosted Family CWL Dashboard

## Files

| File | Purpose |
|------|---------|
| `app.py` | Streamlit application |
| `frosted_cwl_members.csv` | Player data — keep in the same directory |
| `requirements.txt` | Python dependencies |

## Running locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deploying (free) on Streamlit Community Cloud

1. Push all three files to a GitHub repo.
2. Go to [share.streamlit.io](https://share.streamlit.io), connect GitHub, point at `app.py`.
3. Click **Deploy** — you get a shareable URL for all clan members.

## Data source

All statistics come from **clashspot.net**, covering **1 March 2026 – 10 June 2026**.
This is shown at the top of the Overview tab.

## Tabs

| Tab | What it does |
|-----|--------------|
| **Overview** | Per-clan KPIs, core-avg bar charts, transfer log, scoring formula explainer |
| **Rosters** | Full CORE / SUB tables for all three clans |
| **Explorer** | Search, sort, filter across all members; CSV download |
| **Charts** | Offense vs Defense scatter coloured by TH (toggle TH levels); Top 25 leaderboard sorted highest→lowest; distributions |
| **TH Directory** | All members grouped by TH level |

## Sidebar filters

Clan, CWL Slot (CORE / SUB / Turtle Kingdom), TH Range, and flag-hide toggles apply to
**Overview, Explorer, Charts, and TH Directory**. The **Rosters** tab always shows the
full roster regardless of filters.

## Updating data

Replace `frosted_cwl_members.csv`, push to GitHub — Streamlit Cloud redeploys automatically.
