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

const cache = new Map<Cat, Promise<Matrix | null>>()

function fetchMatrix(cat: Cat): Promise<Matrix | null> {
  if (!cache.has(cat)) {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')) {
      cache.set(cat, import('./devMock').then((m) => m.mockMatrix(cat)))
    } else {
      cache.set(cat, fetch(`/api/explore/matrix?cat=${cat}`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
        .then((d: Raw | null) => (d && Array.isArray(d.units) && d.units.length && Array.isArray(d.players) && d.players.length ? normalise(d) : null))
        .catch(() => null))
    }
  }
  return cache.get(cat)!
}

export function useMatrix(cat: Cat) {
  const [state, setState] = useState<{ cat: Cat; data: Matrix | null; loading: boolean }>({ cat, data: null, loading: true })
  useEffect(() => {
    let live = true
    setState({ cat, data: null, loading: true })
    fetchMatrix(cat).then((data) => { if (live) setState({ cat, data, loading: false }) })
    return () => { live = false }
  }, [cat])
  return state.cat === cat ? state : { cat, data: null, loading: true }
}

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
  war: { wars: number; attacks: number; stars: number; three_stars: number; missed: number; avg_destruction: number | null; from?: string | null } | null
}
export type WarBoard = { scope: WarScope | null; since: string | null; season: string | null; updated_at: string | null; players: WarRow[] }

const warCache = new Map<WarScope, Promise<WarBoard | null>>()

function fetchWar(scope: WarScope): Promise<WarBoard | null> {
  if (!warCache.has(scope)) {
    warCache.set(scope, (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')
      ? import('./devMock').then((m) => m.mockWar(scope))
      : fetch(`/api/explore/war?scope=${scope}`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null)))
      .then((d: (Partial<WarBoard> & { players?: WarRow[] }) | null) => {
        if (!d || !Array.isArray(d.players) || !d.players.length) return null
        const froms = d.players.map((p) => p.war?.from).filter((f): f is string => !!f).sort()
        return { scope: d.scope ?? null, since: d.since ?? froms[0] ?? null, season: d.season ?? null, updated_at: d.updated_at ?? null, players: d.players }
      })
      .catch(() => null))
  }
  return warCache.get(scope)!
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

/** Missed as a share of attacks owed; null before any recorded war. */
export const missRate = (w: WarRow['war']) => (w && w.attacks + w.missed ? (100 * w.missed) / (w.attacks + w.missed) : null)
export const HIGH_MISS = 20
