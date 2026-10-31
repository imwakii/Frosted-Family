import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// Shapes agreed with the backend session for GET /api/explore/{kind}.
export type Item = { name: string; level: number; cap?: number | null; max?: number | null }
export type ExploreRow = {
  tag: string
  name: string
  clan: ClanName
  th: number | null
  heroes?: Item[]
  equipment?: (Item & { hero?: string })[]
  units?: (Item & { group: 'troop' | 'spell' | 'pet' | 'siege' })[]
  war?: { wars: number; attacks: number; stars: number; three_stars: number; missed: number; avg_destruction: number | null }
  donations?: { donated: number; received: number }
  capital?: { contributed: number | null; raid_loot: number | null; raid_attacks: number | null }
}
type Payload = { kind: string; updated_at: string | null; players: ExploreRow[] }

export type Source = 'heroes' | 'equipment' | 'army' | 'war' | 'donations' | 'capital'

const cache = new Map<Source, Promise<Payload | null>>()

function fetchSource(src: Source): Promise<Payload | null> {
  if (!cache.has(src)) {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')) {
      cache.set(src, import('./devMock').then((m) => m.mockPayload(src)))
      return cache.get(src)!
    }
    cache.set(src, fetch(`/api/explore/${src}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then((d: Payload | null) => (d && Array.isArray(d.players) && d.players.length ? d : null))
      .catch(() => null))
  }
  return cache.get(src)!
}

/** Rows for an explorer, merged on tag when it reads more than one source. */
export function useExplore(sources: Source[]) {
  const key = sources.join(',')
  const [state, setState] = useState<{ rows: ExploreRow[] | null; updated: string | null; loading: boolean }>({ rows: null, updated: null, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    Promise.all(sources.map(fetchSource)).then((all) => {
      if (!live) return
      if (all.some((p) => !p)) return setState({ rows: null, updated: null, loading: false })
      const byTag = new Map<string, ExploreRow>()
      for (const p of all as Payload[]) for (const r of p.players) byTag.set(r.tag, { ...byTag.get(r.tag), ...r })
      const updated = (all as Payload[]).map((p) => p.updated_at).filter(Boolean).sort()[0] ?? null
      setState({ rows: [...byTag.values()], updated, loading: false })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

// Share of the player's TH caps reached, over items whose cap is known.
export function capPct(items: Item[] | undefined): number | null {
  const known = (items ?? []).filter((i) => i.cap)
  if (!known.length) return null
  const got = known.reduce((s, i) => s + Math.min(i.level, i.cap!), 0)
  const need = known.reduce((s, i) => s + i.cap!, 0)
  return (got / need) * 100
}

const sum = (items: Item[] | undefined) => (items?.length ? items.reduce((s, i) => s + i.level, 0) : null)
const ratio = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || !b ? null : a / b)
const group = (r: ExploreRow, g: string) => r.units?.filter((u) => u.group === g)

const HERO_ORDER = ['Barbarian King', 'Archer Queen', 'Minion Prince', 'Grand Warden', 'Royal Champion']
const abbr = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').toUpperCase()

export type Column = {
  key: string
  label: string
  value: (r: ExploreRow) => number | null
  format?: 'pct' | 'int' | 'dec'
  /** Lower is better, so the default sort is ascending. */
  low?: boolean
  bar?: boolean
}

export type Explorer = {
  id: string
  label: string
  sources: Source[]
  columns: (rows: ExploreRow[]) => Column[]
  /** Amber flag shown beside the name. */
  flag?: (r: ExploreRow) => string | null
}

const RUSHED_BELOW = 80

export const EXPLORERS: Explorer[] = [
  {
    id: 'heroes', label: 'Heroes', sources: ['heroes'],
    columns: (rows) => {
      const names = [...new Set(rows.flatMap((r) => r.heroes?.map((h) => h.name) ?? []))]
        .sort((a, b) => (HERO_ORDER.indexOf(a) + 1 || 99) - (HERO_ORDER.indexOf(b) + 1 || 99))
      return [
        { key: 'total', label: 'Total', value: (r) => sum(r.heroes), format: 'int' },
        { key: 'cap', label: 'TH cap', value: (r) => capPct(r.heroes), format: 'pct', bar: true },
        ...names.map((n): Column => ({ key: n, label: abbr(n), value: (r) => r.heroes?.find((h) => h.name === n)?.level ?? null, format: 'int' })),
      ]
    },
  },
  {
    id: 'equipment', label: 'Equipment', sources: ['equipment'],
    columns: () => [
      { key: 'total', label: 'Levels', value: (r) => sum(r.equipment), format: 'int' },
      { key: 'maxed', label: 'Maxed', value: (r) => r.equipment ? r.equipment.filter((e) => e.max && e.level >= e.max).length : null, format: 'int' },
      { key: 'owned', label: 'Owned', value: (r) => r.equipment?.length ?? null, format: 'int' },
    ],
  },
  {
    id: 'army', label: 'Army', sources: ['army'],
    columns: () => [
      { key: 'all', label: 'TH cap', value: (r) => capPct(r.units), format: 'pct', bar: true },
      { key: 'troop', label: 'Troops', value: (r) => capPct(group(r, 'troop')), format: 'pct' },
      { key: 'spell', label: 'Spells', value: (r) => capPct(group(r, 'spell')), format: 'pct' },
      { key: 'pet', label: 'Pets', value: (r) => capPct(group(r, 'pet')), format: 'pct' },
      { key: 'siege', label: 'Siege', value: (r) => capPct(group(r, 'siege')), format: 'pct' },
    ],
  },
  {
    id: 'war', label: 'War record', sources: ['war'],
    columns: () => [
      { key: 'stars', label: 'Stars', value: (r) => r.war?.stars ?? null, format: 'int' },
      { key: 'triple', label: '3★ rate', value: (r) => { const v = ratio(r.war?.three_stars, r.war?.attacks); return v === null ? null : v * 100 }, format: 'pct' },
      { key: 'dest', label: 'Avg dest.', value: (r) => r.war?.avg_destruction ?? null, format: 'pct' },
      { key: 'attacks', label: 'Attacks', value: (r) => r.war?.attacks ?? null, format: 'int' },
      { key: 'missed', label: 'Missed', value: (r) => r.war?.missed ?? null, format: 'int', low: true },
    ],
  },
  {
    id: 'donations', label: 'Donations', sources: ['donations'],
    columns: () => [
      { key: 'donated', label: 'Donated', value: (r) => r.donations?.donated ?? null, format: 'int' },
      { key: 'received', label: 'Received', value: (r) => r.donations?.received ?? null, format: 'int' },
      { key: 'ratio', label: 'Ratio', value: (r) => ratio(r.donations?.donated, r.donations?.received), format: 'dec' },
    ],
  },
  {
    id: 'capital', label: 'Clan Capital', sources: ['capital'],
    columns: () => [
      { key: 'contributed', label: 'Contributed', value: (r) => r.capital?.contributed ?? null, format: 'int' },
      { key: 'loot', label: 'Raid loot', value: (r) => r.capital?.raid_loot ?? null, format: 'int' },
      { key: 'attacks', label: 'Raid attacks', value: (r) => r.capital?.raid_attacks ?? null, format: 'int' },
    ],
  },
  {
    id: 'rushed', label: 'Rushed', sources: ['heroes', 'army'],
    columns: () => [
      { key: 'all', label: 'TH cap', value: (r) => capPct([...(r.heroes ?? []), ...(r.units ?? [])]), format: 'pct', low: true, bar: true },
      { key: 'heroes', label: 'Heroes', value: (r) => capPct(r.heroes), format: 'pct', low: true },
      { key: 'army', label: 'Army', value: (r) => capPct(r.units), format: 'pct', low: true },
    ],
    flag: (r) => { const v = capPct([...(r.heroes ?? []), ...(r.units ?? [])]); return v !== null && v < RUSHED_BELOW ? 'Rushed' : null },
  },
]

export function fmt(v: number | null, f: Column['format']) {
  if (v === null || Number.isNaN(v)) return '—'
  if (f === 'pct') return `${Math.round(v)}%`
  if (f === 'dec') return v.toFixed(2)
  return Math.round(v).toLocaleString('en-GB')
}
