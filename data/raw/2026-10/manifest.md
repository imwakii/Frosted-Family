# Cycle 2026-10 raw exports

Six clashspot.net exports, one members file and one war-statistics file
per clan. Consumed by `build_cycle.py --cycle 2026-10` to produce
`frosted_cwl_members.csv` (114 players). Recorded at build time so the export that
produced a roster is never in doubt.

```
  clan  pull_date earliest_war  attack_ceiling  players
  Cake 2026-09-29   2026-06-28            52.2       40
  Fire 2026-09-29   2026-06-11            83.2       37
Flakes 2026-09-28   2026-06-02            34.2       28
```

`pull_date` is the most recent war anyone fought and doubles as the
cycle's reference date for idle-day and tier calculations.
