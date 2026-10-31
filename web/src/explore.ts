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
  { id: 'sieges', label: 'Sieges', icon: null },
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
