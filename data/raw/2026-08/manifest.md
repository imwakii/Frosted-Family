# Cycle 2026-08 raw exports

Six clashspot.net exports, one members file and one war-statistics file
per clan. Consumed by `build_cycle.py --cycle 2026-08` to produce
`archive/rosters/2026-08.csv` (119 players). Recorded at build time so the export that
produced a roster is never in doubt.

```
  clan  pull_date earliest_war  attack_ceiling  players
  Cake 2026-07-26   2026-06-02            88.8       49
  Fire 2026-07-27   2026-04-18           103.0       21
Flakes 2026-07-26   2026-04-03            75.7       42
```

`pull_date` is the most recent war anyone fought and doubles as the
cycle's reference date for idle-day and tier calculations.

Pulled 26-27 July 2026, one cycle ahead of the folder name. Verified: recomputing offense from these files reproduces archive/rosters/2026-08.csv to MAE 0.81 over 120 players, against 4.96 or worse for every other roster, so the pairing is unambiguous.
