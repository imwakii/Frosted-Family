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
| Frosted Cake | `#20CU2R80R` | Masters 1 |
| Frosted Flakes | `#2JJYV0JVV` | recruiting clan |

## Files

| File | Purpose |
|---|---|
| `app_frosted.py` | Streamlit dashboard. Reads only the two CSVs, so no code change is needed when the roster changes. |
| `frosted_cwl_members.csv` | Canonical roster for the current cycle. |
| `data/score_history.csv` | Every cycle re-scored with the current formula, one row per player per cycle. Drives the Trends tab. |
| `frosted/` | Scoring, tiering and shared settings used by the dashboard. |

## Scoring

```
Offense = 3★% × (1 − miss%) × min(attacks ÷ 25, 1) × (1 + 0.05 × ΔTH)
Defense = ((3 − avg stars conceded) ÷ 3 × 100) × min(defenses ÷ 20, 1) × (1 + 0.05 × (TH − 15))
Final   = Offense + Defense
```

The confidence weights (`÷ 25` on attacks, `÷ 20` on defenses) hold back players
with too small a sample to judge. `ΔTH` rewards attacking upward.

Pushing `frosted_cwl_members.csv` or `data/score_history.csv` to `main` redeploys
the dashboard automatically.
