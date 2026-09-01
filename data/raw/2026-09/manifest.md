# Cycle 2026-09 raw exports

Six clashspot.net exports, one members file and one war-statistics file
per clan. Consumed by `build_cycle.py --cycle 2026-09` to produce
`frosted_cwl_members.csv` (110 players). Recorded at build time so the export that
produced a roster is never in doubt.

```
  clan  pull_date earliest_war  attack_ceiling  players
  Cake 2026-08-27   2026-06-03            74.6       39
  Fire 2026-08-27   2026-05-02            96.4       25
Flakes 2026-08-27   2026-05-31            68.8       37
```

`pull_date` is the most recent war anyone fought and doubles as the
cycle's reference date for idle-day and tier calculations.

Pulled 27-29 August 2026. Verified: reproduces frosted_cwl_members.csv to MAE 0.71 over 100 players, against 4.96 or worse for every other roster.

NOT the exact pull the committed roster was built from. That roster was rebuilt on 30 August after late churn and its export was never archived: Waki reads 100 attacks there and 98 here. This is why test_reproducible_from_raw is xfail. From 2026-10, build_cycle.py writes this file at build time and the gap closes.
