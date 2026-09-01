# Frosted Family CWL

Data pipeline and dashboard for monthly Clan War League roster allocation across a three-clan Clash of Clans family. Ka Wai (in-game: Waki) runs the family and is the sole decision authority on allocation.

## Critical constraints

**Never push to `main`.** This repo auto-deploys to https://frosted-family.streamlit.app on push, and that URL is printed on the roster poster handed to ~100 clan members. Work on a branch, verify locally, and stop. Ka Wai merges.

**Never commit working artefacts.** `*_pool_diagnostic.csv`, `*_move_checklist.csv`, `*_moves.md` and anything else naming who is being benched or pruned stay out of the repo. They go stale within days and they publish decisions that are not meant to be public. Only `frosted_cwl_members.csv`, `app.py`, the two poster scripts, the `frosted/` package, `requirements.txt`, and `docs/` belong here.

**Allocation is a human decision.** Which player lands in which clan and slot is Ka Wai's call, informed by things absent from the data: co-leader status, retention risk, who actually moves when told to. Never infer, adjust, or "improve" `clan`, `cwl_slot`, or `transferred_from`. Compute scores, surface implications, stop.

## Domain glossary

**The three clans.** Fire (`#CL0G80LV`), flagship, Champion 3, TH18-only. Cake (`#20CU2R80R`), Champion 3, expected to demote to Masters 1. Flakes (`#2JJYV0JVV`), currently sitting out CWL, used as a recruiting and holding pen.

**TH** is town hall level, 7–18. Higher is stronger. TH18 is current max. A clan's CWL roster is sorted by strength, so TH18s are placed at the top of the war map and must attack the opponent's strongest bases. This is why a TH16 with a high score cannot fill a TH18 slot, and why benched players routinely outscore starters. It is not a bug in the model.

**CWL** runs seven consecutive war days once a month. Rosters are locked at sign-up.

**`cwl_slot`** is one of `CORE` (starting lineup), `SUB` (bench), or `Sitting Out` (in the clan, not on the roster). An older label `Turtle Kingdom` is retired and must not be reintroduced — it once caused a live bug where a player's row was silently unselectable across several app views.

**Alts** are secondary accounts. They compete on merit like any other account. An older rule forcing alts to `SUB` was retired in July 2026.

## Data flow

Six raw exports from clashspot.net per cycle, one members file and one war-statistics file per clan, land in `data/raw/YYYY-MM/`. These are ingested and scored into `frosted_cwl_members.csv`, which is canonical and drives three consumers: `app.py`, `make_poster.py`, and `make_directory_poster.py`. Nothing downstream reads the raw exports.

**`tag` is the primary key.** Clash of Clans player tags (`#R2PPV8CL`) are immutable. Display names are not — `#20G28UPQG` went from `Jules` to `juna the zealot` between the July and September exports, and a name-keyed join reads that as one departure plus one arrival. Never join on `name`. Names also carry emoji, CJK, and occasional mojibake; the poster scripts strip unrenderable glyphs and carry a `NAME_ALIAS` map for cases like `ジェイ` → `Jay`.

**Verify all six exports share the same date window before scoring.** A short window on one clan silently deflates every player in it through the confidence weight, and the output looks plausible rather than broken. This happened once in July 2026: Hallelou read 18.6 instead of 105.2 and Cake's reliable pool read as 3 players instead of 37.

## Scoring

Fully deterministic. The formula, every flag threshold, and the activity tier rules are specified in `docs/specs/01-scoring-core.md` — read it there rather than inferring from the CSV. Scoring lives in `frosted/scoring.py` as pure functions: DataFrame in, DataFrame out, no I/O, no printing, no globals.

The confidence weights (attacks capped at 25, defenses at 20) are load-bearing. They stop a five-attack hot streak from outranking a proven sixty-attack record. A consequence worth knowing: any short-window analysis gets crushed by them, so recency must be a separate indicator and never a term in the main score.

`tests/test_reproducibility.py` asserts the committed CSV is reproducible from the archived raw exports. **If it fails, do not tune the formula to make it pass.** Report the players whose scores differ, with both values, and stop.

## Commands

```bash
streamlit run app.py                    # dashboard; add FROSTED_EDIT=1 for local allocation mode
python -m pytest                        # all tests
python make_poster.py --csv frosted_cwl_members.csv --date "2 SEPTEMBER 2026" --time "18:00 UTC"
python make_directory_poster.py --csv frosted_cwl_members.csv --date "2 SEPTEMBER 2026"
```

Both poster scripts have per-cycle config blocks at the top (`CLAN_FORMAT`, `CLAN_STATUS`) that change when leagues change on promotion or demotion. Palette and threshold constants live in `frosted/config.py` and must appear exactly once in the codebase.

## Conventions

Python, pandas, PIL for posters, plotly in the app. Prefer editing the existing poster scripts over rewriting them; the layout is tuned and matches published output. Ask before changing anything that alters rendered poster geometry, since posters are archived and compared cycle to cycle.

Surface decisions before making them. When a task touches a CORE/SUB line, a clan assignment, or a contradiction between the brief and the data, stop and ask. Formatting and cosmetic issues can be auto-resolved and mentioned in the summary.
