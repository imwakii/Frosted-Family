# Frosted Family CWL Dashboard

Interactive Streamlit app for exploring CWL roster data, scores, and allocations.

## Files

| File | Purpose |
|------|---------|
| `app.py` | Main Streamlit application |
| `frosted_cwl_members.csv` | Player data — place in the same directory as `app.py` |
| `requirements.txt` | Python dependencies |

## Running locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deploying to Streamlit Community Cloud

1. Push all three files to a GitHub repository (public or private).
2. Go to [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
3. Click **New app**, select your repo, set the main file to `app.py`.
4. Click **Deploy** — the app will be live at a shareable URL.

## Updating data

When you run a new CWL cycle:
1. Regenerate `frosted_cwl_members.csv` from the planning notebook.
2. Replace the file in the repo and push.
3. Streamlit Cloud redeploys automatically.

## Tabs

| Tab | What it shows |
|-----|---------------|
| **Overview** | Per-clan KPIs, core averages, bar charts, scoring formula |
| **Rosters** | Full clan tables with CORE / SUB labels and progress bars |
| **Explorer** | Searchable, sortable table of all members with download |
| **Charts** | Offense vs Defense scatter, Top 25 ranking, score distributions, TH breakdown |
| **TH Directory** | All members grouped and ranked by TH level |

## Sidebar filters

- **Clan** — show Fire, Cake, Flakes individually or together
- **CWL Slot** — filter to CORE only, or include SUBs
- **TH Range** — slider to narrow by townhall level
- **Hide HM / ND / LTD** — toggle out flagged players from the Explorer
