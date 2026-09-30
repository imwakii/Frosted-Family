Frosted Family is a three-clan Clash of Clans family, and this is the dashboard and data pipeline behind its monthly Clan War League roster. It scores every member on their war record, sorts them into starting lineups and benches across the three clans, and renders the posters that get handed to the clan.

Live dashboard: **[frosted-family.streamlit.app](https://frosted-family.streamlit.app)**

## The monthly cycle

Pull six exports from clashspot.net, one members file and one war-statistics file per clan, into `data/raw/YYYY-MM/`. Then:

```bash
python build_cycle.py --cycle 2026-10          # score, tier, carry allocations forward
python build_cycle.py --cycle 2026-10 --dry-run   # report first, write nothing
```

That produces `frosted_cwl_members.csv`, the canonical roster and the single input to everything downstream. It computes scores, flags and activity tiers, and carries `clan`, `cwl_slot` and `transferred_from` forward from the previous cycle on player tag. New players arrive with no slot, waiting for a decision.

**Allocation is not automated and will not be.** Which player lands in which clan and slot depends on co-leader status, retention risk, and who actually moves when told — none of which is in the data. Fill in `cwl_slot` by hand, then render:

```bash
python make_poster.py --csv frosted_cwl_members.csv \
    --date "2 OCTOBER 2026" --time "18:00 UTC"      # the CWL lineup poster
python make_directory_poster.py --csv frosted_cwl_members.csv \
    --date "2 OCTOBER 2026" --mode after            # the full membership directory
streamlit run app_frosted.py                                # the dashboard, locally
python -m pytest                                     # the tests
```

Both poster scripts have a per-cycle config block at the top (`CLAN_FORMAT`, `CLAN_STATUS`) that changes when leagues change on promotion or demotion.

## Layout

| Path | What it is |
|---|---|
| `frosted_cwl_members.csv` | The canonical roster. Keyed on player tag. |
| `frosted/` | `config` (palette and thresholds, defined exactly once), `scoring`, `tiering`, `ingest`, `fonts` |
| `build_cycle.py` | Six raw exports in, canonical roster out |
| `app_frosted.py` | The Streamlit dashboard |
| `make_poster.py`, `make_directory_poster.py` | The two posters |
| `data/raw/YYYY-MM/` | Archived exports, one folder per cycle, each with a `manifest.md` |
| `docs/specs/` | How the scoring works, and why |
| `archive/` | Past posters, superseded rosters, ad-hoc exports. Untracked. |

## Two things that will bite you

**`tag` is the primary key. Never join on `name`.** Player tags are immutable; display names are not. `#20G28UPQG` went from `Jules` to `juna the zealot` between the July and September exports, and a name-keyed join reads that as one departure plus one arrival. That player ended up in Cake CORE.

**All six exports must cover the same window.** A short window on one clan silently deflates every player in it through the confidence weight, and the output looks plausible rather than broken. This happened in July 2026: one player read 18.6 instead of 105.2, and a clan's reliable pool read as 3 players instead of 37. `build_cycle.py` refuses to score when it detects this, and says which clan to re-export.

## Setup

```bash
pip install -r requirements.txt              # the dashboard
pip install -r requirements-posters.txt      # plus the poster and test tooling
```

The posters render with DejaVu Sans, which `frosted/fonts.py` finds either in the system font directory or in matplotlib's bundle. Rendered geometry depends on the exact font file, so it resolves DejaVu itself rather than substituting a lookalike.

## Deploying

The dashboard auto-deploys from `main` to Streamlit Community Cloud. That URL is printed on the poster handed to around 100 clan members, so `main` is not a working branch: work on a branch, verify locally, and let Ka Wai merge.
