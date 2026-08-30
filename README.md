# Frosted Family CWL

Clan War League roster planning for the Frosted Family Clash of Clans clan group.

**Live dashboard:** https://frosted-family.streamlit.app/

Every member is scored on their war record — three-star rate, missed attacks and
stars conceded, all weighted by sample size and by the town hall levels they
actually faced — and allocated across the family's clans for each CWL cycle.

## Clans

| Clan | Tag | League |
|---|---|---|
| Frosted Fire | `#CL0G80LV` | Champion 3 |
| Frosted Cake | `#20CU2R80R` | Champion 3 |
| Frosted Flakes | `#2JJYV0JVV` | recruiting clan |

## Files

| File | Purpose |
|---|---|
| `app.py` | Streamlit dashboard. Reads only the CSV — no code change needed when the roster changes. |
| `frosted_cwl_members.csv` | Canonical roster. Drives the dashboard and both posters. |
| `make_poster.py` | CWL lineup poster — participating clans, core plus top substitutes. |
| `make_directory_poster.py` | Full membership directory — every member, with activity status tags. |

## Scoring

```
Offense = 3★% × (1 − miss%) × min(attacks ÷ 25, 1) × (1 + 0.05 × ΔTH)
Defense = ((3 − avg stars conceded) ÷ 3 × 100) × min(defenses ÷ 20, 1) × (1 + 0.05 × (TH − 15))
Final   = Offense + Defense
```

The confidence weights (`÷ 25` on attacks, `÷ 20` on defenses) hold back players
with too small a sample to judge. `ΔTH` rewards attacking upward.

## Generating the posters

```bash
python3 make_poster.py --csv frosted_cwl_members.csv \
  --date "2 SEPTEMBER 2026" --time "18:00 UTC" \
  --out frosted-cwl-roster.png

python3 make_directory_poster.py --csv frosted_cwl_members.csv \
  --diag pool_diagnostic.csv --date "2 SEPTEMBER 2026" \
  --mode after --out frosted-family-directory.png
```

Pushing `frosted_cwl_members.csv` to this repo redeploys the dashboard
automatically.
