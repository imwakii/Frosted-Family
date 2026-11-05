import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// GET /api/explore/matrix?cat=… : units in display order with their game
// max, and every member's level per unit, aligned by index.
export const CATS = [
  { id: 'heroes', label: 'Heroes', icon: 'Barbarian King' },
  { id: 'equipment', label: 'Equipment', icon: 'Giant Gauntlet' },
  { id: 'troops', label: 'Troops', icon: 'P.E.K.K.A' },
  { id: 'spells', label: 'Spells', icon: 'Lightning Spell' },
  { id: 'pets', label: 'Pets', icon: 'L.A.S.S.I' },
  { id: 'sieges', label: 'Sieges', icon: 'Log Launcher' },
] as const
export type Cat = (typeof CATS)[number]['id']

export type Unit = { name: string; max: number }
export type MatrixPlayer = { tag: string; name: string; clan: ClanName; th: number | null; levels: (number | null)[] }
export type Matrix = { cat: Cat; as_of: string | null; units: Unit[]; players: MatrixPlayer[] }

type Raw = { cat: Cat; as_of?: string | null; units: Unit[]; players: (Omit<MatrixPlayer, 'levels'> & { levels: (number | null)[] | Record<string, number | null> | null })[] }

// Levels may come as an array aligned with units, keyed by unit name, or null
// before a member's first profile fetch.
function normalise(d: Raw): Matrix {
  return {
    cat: d.cat,
    as_of: d.as_of ?? null,
    units: d.units,
    players: d.players.map((p) => ({
      ...p,
      levels: !p.levels ? d.units.map(() => null)
        : Array.isArray(p.levels) ? d.units.map((_, i) => (p.levels as (number | null)[])[i] ?? null)
        : d.units.map((u) => (p.levels as Record<string, number | null>)[u.name] ?? null),
    })),
  }
}

// An answer is kept a few minutes, so moving between boards is instant. A failed load isn't kept, so the next look tries again.
const KEEP_MS = 5 * 60_000
type Kept<V> = Map<string, { at: number; loading: Promise<V | null>; value?: V }>

function keep<V>(store: Kept<V>, key: string, load: () => Promise<V | null>) {
  const had = store.get(key)
  if (had && Date.now() - had.at < KEEP_MS) return had.loading
  const entry = { at: Date.now(), loading: load().then((v) => { if (!v && store.get(key) === entry) store.delete(key); if (v) (entry as { value?: V }).value = v; return v }) }
  store.set(key, entry)
  return entry.loading
}

const cache: Kept<Matrix> = new Map()

function fetchMatrix(cat: Cat): Promise<Matrix | null> {
  return keep(cache, cat, () => (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')
    ? import('./devMock').then((m) => m.mockMatrix(cat))
    : fetch(`/api/explore/matrix?cat=${cat}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then((d: Raw | null) => (d && Array.isArray(d.units) && d.units.length && Array.isArray(d.players) && d.players.length ? normalise(d) : null))
      .catch(() => null)))
}

function matrixNow(cat: Cat) {
  const data = cache.get(cat)?.value ?? null
  return { cat, data, loading: !data }
}

export function useMatrix(cat: Cat) {
  const [state, setState] = useState<{ cat: Cat; data: Matrix | null; loading: boolean }>(() => matrixNow(cat))
  useEffect(() => {
    let live = true
    setState(matrixNow(cat))
    fetchMatrix(cat).then((data) => { if (live) setState({ cat, data, loading: false }) })
    return () => { live = false }
  }, [cat])
  return state.cat === cat ? state : matrixNow(cat)
}

/** Loads every category ahead of time, so switching between them never waits. */
export const preloadMatrices = () => { CATS.forEach((c) => { void fetchMatrix(c.id) }) }

/** A share to one decimal, rounded down, so 100.0% only ever means maxed. Places go by this figure, so a tie always reads as one. */
export const tenth = (v: number) => Math.floor(v * 10) / 10

/** Share of game max reached across a category's units, 0–100. */
export function progress(levels: (number | null)[], units: Unit[]) {
  let have = 0, all = 0
  units.forEach((u, i) => { have += Math.min(levels[i] ?? 0, u.max); all += u.max })
  return all ? (100 * have) / all : 0
}

export const isMaxed = (level: number | null, u: Unit) => level !== null && level >= u.max

// GET /api/explore/war?scope=all|cwl : recorded wars per member, plus all-time
// war stars from the profile. History starts with the first recorded war.
export type WarScope = 'all' | 'cwl'
export type WarRow = {
  tag: string; name: string; clan: ClanName; th: number | null
  war_stars?: number | null
  war: { wars: number; attacks: number; stars: number; three_stars: number; missed: number; avg_destruction: number | null; from?: string | null; defense?: Defense | null } | null
}
type Defense = { defenses: number; stars_conceded: number; three_stars_conceded: number }
export type WarBoard = { scope: WarScope | null; since: string | null; windowFrom: string | null; recordedFrom: string | null; season: string | null; updated_at: string | null; players: WarRow[] }

type WarBlock = { wars_played: number; attacks_used: number; attacks_missed: number; three_star_rate: number | null; avg_stars: number | null; avg_destruction: number | null }
type RawWar = {
  scope?: WarScope; since?: string; window_from?: string | null; sources?: string[]; season?: string | null; cwl_season?: string | null; updated_at?: string | null; as_of?: string | null
  players: (Omit<WarRow, 'war'> & { war?: ApiWar | null; recorded?: WarBlock | null; cwl?: WarBlock | null })[]
}

// The per-scope war object; recorded_* names arrived with the clashspot baseline,
// since war counts and destruction cover recorded wars only.
type ApiWar = Partial<NonNullable<WarRow['war']>> & { recorded_wars?: number; recorded_avg_destruction?: number | null }

function fromApi(w: ApiWar | null | undefined): WarRow['war'] {
  if (!w) return null
  return {
    wars: w.recorded_wars ?? w.wars ?? 0, attacks: w.attacks ?? 0, stars: w.stars ?? 0, three_stars: w.three_stars ?? 0, missed: w.missed ?? 0,
    avg_destruction: w.recorded_avg_destruction ?? w.avg_destruction ?? null, from: w.from ?? null, defense: w.defense ?? null,
  }
}

// Per-attack rates back to counts, so both shapes sort and display alike.
function fromBlock(b: WarBlock | null | undefined): WarRow['war'] {
  if (!b) return null
  const n = b.attacks_used
  return {
    wars: b.wars_played, attacks: n, missed: b.attacks_missed,
    three_stars: Math.round((b.three_star_rate ?? 0) * n), stars: (b.avg_stars ?? 0) * n,
    avg_destruction: b.avg_destruction,
  }
}

const warCache: Kept<WarBoard> = new Map()

function fetchWar(scope: WarScope): Promise<WarBoard | null> {
  return keep(warCache, scope, () => (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')
      ? import('./devMock').then((m) => m.mockWar(scope))
      : fetch(`/api/explore/war?scope=${scope}`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null)))
      .then((d: RawWar | null) => {
        if (!d || !Array.isArray(d.players) || !d.players.length) return null
        // Two shapes: one row per scope ({war}), or both scopes per row ({recorded, cwl}).
        const split = d.players.some((p) => 'recorded' in p || 'cwl' in p)
        const players: WarRow[] = d.players.map((p) => ({
          tag: p.tag, name: p.name, clan: p.clan, th: p.th, war_stars: p.war_stars ?? null,
          war: split ? fromBlock(scope === 'cwl' ? p.cwl : p.recorded) : fromApi(p.war),
        }))
        const froms = players.map((p) => p.war?.from).filter((f): f is string => !!f).sort()
        return {
          scope: split ? scope : d.scope ?? null,
          since: d.since ?? froms[0] ?? null,
          // Start of the merged history (export plus recorded wars); since is recorded wars only.
          windowFrom: d.window_from ?? null,
          // First recorded war, from a source line such as "recorded since 2026-11-04".
          recordedFrom: (d.sources ?? []).map((x) => x.match(/recorded since (\d{4}-\d{2}-\d{2})/)?.[1]).find(Boolean) ?? null,
          season: d.season ?? d.cwl_season ?? null,
          updated_at: d.updated_at ?? d.as_of ?? null,
          players,
        }
      })
      .catch(() => null))
}

export function useWarBoard(scope: WarScope) {
  const [state, setState] = useState<{ scope: WarScope; data: WarBoard | null; loading: boolean }>({ scope, data: null, loading: true })
  useEffect(() => {
    let live = true
    setState({ scope, data: null, loading: true })
    fetchWar(scope).then((data) => { if (live) setState({ scope, data, loading: false }) })
    return () => { live = false }
  }, [scope])
  return state.scope === scope ? state : { scope, data: null, loading: true }
}

/** Where the war figures begin, with the year, as they keep adding up from that day. */
export const sinceDay = (from: string) => `Since ${new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`

/** Missed as a share of attacks owed; null before any recorded war. */
export const missRate = (w: WarRow['war']) => (w && w.attacks + w.missed ? (100 * w.missed) / (w.attacks + w.missed) : null)
export const HIGH_MISS = 20

/** Standard competition ranks (1, 2, 2, 4); items without a value get null. */
export function competitionRanks<T>(items: T[], value: (t: T) => number | null, asc = false) {
  const scored = items.map((t) => ({ t, v: value(t) })).filter((x): x is { t: T; v: number } => x.v !== null)
  scored.sort((a, b) => (asc ? a.v - b.v : b.v - a.v))
  const ranks = new Map<T, number | null>(items.map((t) => [t, null]))
  scored.forEach((x, i) => ranks.set(x.t, i && scored[i - 1].v === x.v ? ranks.get(scored[i - 1].t)! : i + 1))
  return ranks
}
