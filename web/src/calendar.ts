import type { ClanName } from './types'

export type CalDay = {
  day: number; war_key: string | null; state: string; start: string; end: string
  opponent?: string | null; stars?: number; opponent_stars?: number
}

export type CalEvent = {
  id: string; title: string; kind: 'cwl' | 'friendly' | 'war' | 'clan_games' | 'raid' | 'season' | 'game' | 'cwl_window' | 'cosmetic'
  source: 'supercell' | 'api' | 'war' | 'pattern' | 'plan'; clan: ClanName | null
  start: string; end: string; timed: boolean; expected: boolean
  days?: CalDay[]; war_key?: string; state?: string; opponent?: string | null; stars?: number; opponent_stars?: number
  url?: string; post?: string | null
}

export type CalMonth = { month: string; events: CalEvent[]; news_checked: string | null }

const pad = (n: number) => String(n).padStart(2, '0')

/** The day a moment falls on, in the zone the Clock shows. */
export function dayOf(ms: number, utc: boolean) {
  const d = new Date(ms)
  return utc
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The first and last day an event shows on. A timed event ending at midnight does not touch the day it ends on. A
 * cosmetic stays on sale for weeks and shows only on the day it arrives. */
export function span(e: CalEvent, utc: boolean): [string, string] {
  if (!e.timed) return [e.start, e.kind === 'cosmetic' ? e.start : e.end]
  return [dayOf(Date.parse(e.start), utc), dayOf(Date.parse(e.end) - 1000, utc)]
}

export const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + by, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/** The month's weeks, Monday first, each seven days long with null outside the month. */
export function weeksOf(month: string): (string | null)[][] {
  const y = +month.slice(0, 4), m = +month.slice(5, 7)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`)]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

// Which comes first when a week has more than it can show.
const ORDER: Record<CalEvent['kind'], number> = { cwl: 0, friendly: 1, war: 2, clan_games: 3, cwl_window: 3, raid: 4, game: 5, season: 6, cosmetic: 7 }
export const byWeight = (a: CalEvent, b: CalEvent) => ORDER[a.kind] - ORDER[b.kind] || a.start.localeCompare(b.start)

export type Band = { e: CalEvent; col: number; len: number; lane: number; opensBefore: boolean; runsOn: boolean }

/** One week's events laid in lanes, longest-standing first. What does not fit is counted per day. */
export function layWeek(week: (string | null)[], events: CalEvent[], utc: boolean, lanes: number): { bands: Band[]; hidden: Record<string, number> } {
  const days = week.flatMap((d) => (d ? [d] : []))
  const from = days[0], to = days[days.length - 1]
  const taken: boolean[][] = Array.from({ length: lanes }, () => Array(7).fill(false))
  const bands: Band[] = []
  const hidden: Record<string, number> = {}
  for (const e of [...events].sort(byWeight)) {
    const [a, b] = span(e, utc)
    if (b < from || a > to) continue
    const col = week.indexOf(a < from ? from : a)
    const end = week.indexOf(b > to ? to : b)
    const lane = taken.findIndex((row) => row.slice(col, end + 1).every((t) => !t))
    if (lane < 0) {
      for (let i = col; i <= end; i++) { const d = week[i]; if (d) hidden[d] = (hidden[d] ?? 0) + 1 }
      continue
    }
    for (let i = col; i <= end; i++) taken[lane][i] = true
    bands.push({ e, col, len: end - col + 1, lane, opensBefore: a < from, runsOn: b > to })
  }
  return { bands, hidden }
}

const fmt = (ms: number, utc: boolean, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString('en-GB', { ...opts, timeZone: utc ? 'UTC' : undefined })

export const fmtTime = (iso: string, utc: boolean) => fmt(Date.parse(iso), utc, { hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtWhen = (iso: string, utc: boolean) => fmt(Date.parse(iso), utc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

const plain = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const fmtDay = (d: string) => plain(d, { weekday: 'long', day: 'numeric', month: 'long' })
export const fmtMonth = (month: string) => plain(`${month}-01`, { month: 'long', year: 'numeric' })

/** A date-only event's dates: 1 to 30 Nov, or one day. */
export function fmtRange(start: string, end: string) {
  const short = { day: 'numeric', month: 'short' } as const
  if (start === end) return plain(start, short)
  return `${start.slice(0, 7) === end.slice(0, 7) ? plain(start, { day: 'numeric' }) : plain(start, short)} to ${plain(end, short)}`
}
