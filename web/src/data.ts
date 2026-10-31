import { useEffect, useState } from 'react'
import type { ClanName, LiveWar, Player, Roster, Slot, Status } from './types'

export class HttpError extends Error {
  constructor(url: string, public status: number) { super(`${url}: ${status}`) }
}

// The API answers JSON; anything else (a missing route serving index.html,
// a network failure) falls back to the static roster built from the CSV.
async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new HttpError(url, res.ok ? 0 : res.status)
  return res.json() as Promise<T>
}

let staticRoster: Promise<Roster> | null = null
const getStatic = () => (staticRoster ??= getJson<Roster>('/roster.json'))

// API shapes from the cwl-server branch (server/ in this repo).
type ApiPlayer = {
  tag: string; name: string; clan: ClanName; cwl_slot: string; transferred_from: string | null
  tier: string; final_score: number | string | null; current_th: number | string | null
  snapshot: { name?: string; town_hall?: number } | null
}
type ApiWar = {
  state: string; day: number | null; team_size: number; opponent: { name: string } | null
  stars: number; opponent_stars: number; attacks_used: number; attacks_allowed: number
}

const SLOT: Record<string, Slot> = { CORE: 'CORE', SUB: 'SUB', 'Sitting Out': 'OUT' }
const STATUS: Record<string, Status> = {
  PROVEN: 'active', 'UNRELIABLE (HM)': 'highMiss', 'THIN RECORD': 'thin', LAPSING: 'inactive', DORMANT: 'inactive', 'NO DATA': 'inactive',
}
const CLAN_NAMES = ['Fire', 'Cake', 'Flakes']
// The API sends numeric columns as strings ("122.19").
const toNum = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const asClan = (c: string | null | undefined) => (c && CLAN_NAMES.includes(c) ? (c as ClanName) : null)

// The API owns placement and the live snapshot; the static file adds history,
// rates and rank. Joined on tag only.
function mergeRoster(api: { players: ApiPlayer[] }, base: Roster | null): Roster {
  const known = new Map(base?.players.map((p) => [p.tag, p]))
  const players: Player[] = api.players.filter((a) => a.tag && asClan(a.clan)).map((a) => {
    const b = known.get(a.tag)
    return {
      tag: a.tag,
      name: a.snapshot?.name || a.name || b?.name || a.tag,
      clan: a.clan,
      slot: SLOT[a.cwl_slot] ?? 'OUT',
      from: asClan(a.transferred_from),
      th: toNum(a.snapshot?.town_hall) ?? toNum(a.current_th) ?? b?.th ?? null,
      score: ((s) => (s === null ? null : Math.round(s * 10) / 10))(toNum(a.final_score)),
      status: STATUS[a.tier] ?? b?.status ?? 'inactive',
      threeStar: b?.threeStar ?? null,
      missPct: b?.missPct ?? null,
      attacks: b?.attacks ?? null,
      rank: b?.rank ?? null,
      history: b?.history ?? [],
    }
  })
  return {
    generatedAt: base?.generatedAt ?? new Date().toISOString(),
    cwlStart: base?.cwlStart ?? null,
    clans: base?.clans ?? { Fire: { league: null, inCwl: true }, Cake: { league: null, inCwl: true }, Flakes: { league: null, inCwl: false } },
    window: base?.window ?? null,
    cycles: base?.cycles ?? [],
    players,
  }
}

export async function loadRoster(): Promise<{ roster: Roster; live: boolean }> {
  try {
    const api = await getJson<{ players: ApiPlayer[] }>('/api/roster')
    if (!Array.isArray(api.players) || !api.players.length) throw new Error('empty roster')
    const base = await getStatic().catch(() => null)
    return { roster: mergeRoster(api, base), live: true }
  } catch {
    return { roster: await getStatic(), live: false }
  }
}

export async function loadPlayer(tag: string): Promise<Partial<Player> | null> {
  try {
    const x = await getJson<{ tag: string; snapshot: { name?: string; town_hall?: number } | null }>(`/api/player/${encodeURIComponent(tag)}`)
    if (x.tag !== tag || !x.snapshot) return null
    return { tag, ...(x.snapshot.name ? { name: x.snapshot.name } : {}), ...(x.snapshot.town_hall ? { th: x.snapshot.town_hall } : {}) }
  } catch {
    return null
  }
}

type LiveMap = Partial<Record<ClanName, LiveWar | null>>

export async function loadWar(): Promise<LiveMap> {
  try {
    const data = await getJson<{ clans: { clan: string; war: ApiWar | null }[] }>('/api/war/live')
    const out: LiveMap = {}
    for (const c of data.clans ?? []) {
      const clan = asClan(c.clan)
      const w = c.war
      if (!clan) continue
      out[clan] = w && ['preparation', 'inWar', 'warEnded'].includes(w.state)
        ? {
            state: w.state as LiveWar['state'], day: w.day ?? null, opponent: w.opponent?.name ?? '',
            stars: w.stars ?? 0, opponentStars: w.opponent_stars ?? 0,
            attacks: w.attacks_used ?? 0, teamSize: w.attacks_allowed || w.team_size || 15,
          }
        : null
    }
    return out
  } catch {
    return {}
  }
}

export function useRoster() {
  const [state, setState] = useState<{ roster: Roster | null; live: boolean; error: boolean }>({ roster: null, live: false, error: false })
  useEffect(() => {
    loadRoster().then(
      ({ roster, live }) => setState({ roster, live, error: false }),
      () => setState({ roster: null, live: false, error: true }),
    )
  }, [])
  return state
}

export function useWar() {
  const [war, setWar] = useState<LiveMap>({})
  useEffect(() => {
    let stop = false
    const tick = () => loadWar().then((w) => { if (!stop) setWar(w) })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => { stop = true; window.clearInterval(id) }
  }, [])
  return war
}

export function useWide(query = '(min-width: 768px)') {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return wide
}

export async function publishPlan(moves: { tag: string; clan: ClanName; slot: string }[]) {
  return getJson<{ ok: boolean }>('/api/plan/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moves }),
  })
}
