# Cycle 2026-11 raw exports

Six clashspot.net exports, one members file and one war-statistics file
per clan. Consumed by `build_cycle.py --cycle 2026-11` to produce
`frosted_cwl_members.csv` (114 players). Recorded at build time so the export that
produced a roster is never in doubt.

```
  clan  pull_date earliest_war  attack_ceiling  players
  Cake 2026-10-29   2026-07-14            63.6       45
  Fire 2026-10-29   2026-07-24            94.0       35
Flakes 2026-10-30   2026-07-18            46.0       19
```

`pull_date` is the most recent war anyone fought and doubles as the
cycle's reference date for idle-day and tier calculations.
