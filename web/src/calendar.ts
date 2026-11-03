import type { ClanName } from './types'

export type CalDay = {
  day: number; war_key: string | null; state: string; start: string; end: string
  opponent?: string | null; stars?: number; opponent_stars?: number
}

export type CalEvent = {
  id: string; title: string; kind: 'cwl' | 'friendly' | 'war' | 'clan_games' | 'raid' | 'game' | 'cwl_window'
  source: 'supercell' | 'war' | 'pattern' | 'plan'; clan: ClanName | null
  start: string; end: string; timed: boolean; expected: boolean
  days?: CalDay[]; war_key?: string; state?: string; opponent?: string | null; stars?: number; opponent_stars?: number
  url?: string; post?: string | null
}

export type CalMonth = { month: string; events: CalEvent[]; news_checked: string | null }

/** One row of the list: an event, or one CWL day of it, or the CWL days after the next one. A family row is one CWL entry
 * for Fire and Cake together, and `clans` holds each clan's own war that day. */
export type Item = {
  key: string; e: CalEvent; start: string; end: string; day?: CalDay; rest?: [number, number]
  family?: boolean; clans?: { e: CalEvent; day: CalDay }[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The day a moment falls on, in the zone the Clock shows. */
export function dayOf(ms: number, utc: boolean) {
  const d = new Date(ms)
  return utc
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + by, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

const timedOver = (end: string, now: number) => Date.parse(end) <= now

/** Whether an item is under way. A date-only event runs the whole of its first and last days. */
export const isOn = (i: Item, now: number, utc: boolean) => (i.e.timed
  ? Date.parse(i.start) <= now
  : i.start <= dayOf(now, utc))

const earliest = (times: string[]) => [...times].sort()[0]
const latest = (times: string[]) => [...times].sort()[times.length - 1]

/** Fire and Cake fight CWL together, minutes apart and against different clans: one row per CWL day. */
function familyCwl(cwl: CalEvent[], now: number): Item[] {
  const left = cwl.flatMap((e) => (e.days ?? []).filter((d) => !timedOver(d.end, now)).map((day) => ({ e, day })))
  const numbers = [...new Set(left.map((c) => c.day.day))].sort((a, b) => a - b)
  const row = (key: string, days: typeof left, rest?: [number, number]): Item => ({
    key, e: days[0].e, family: true, rest, clans: rest ? undefined : days,
    start: earliest(days.map((c) => c.day.start)), end: latest(days.map((c) => c.day.end)),
  })
  const items = numbers.slice(0, 2).map((n) => row(`cwl-${n}`, left.filter((c) => c.day.day === n)))
  const later = numbers.slice(2)
  if (later.length) items.push(row('cwl-rest', left.filter((c) => c.day.day >= later[0]), [later[0], later[later.length - 1]]))
  return items
}

/** Each clan's war now and its next, with later CWL days folded into one row. The family's wars lead the page. */
export function familyItems(events: CalEvent[], now: number, utc: boolean): Item[] {
  const cwl = events.filter((e) => e.days)
  const planned = events.filter((e) => e.kind === 'cwl' && !e.days && e.end >= dayOf(now, utc))
  const together = cwl.length > 1, plannedTogether = planned.length > 1
  const items: Item[] = together ? familyCwl(cwl, now) : []
  if (plannedTogether) items.push({ key: 'cwl-planned', e: planned[0], family: true, start: planned[0].start, end: planned[0].end })
  for (const e of events) {
    if (!e.clan || (together && e.days) || (plannedTogether && planned.includes(e))) continue
    if (e.days) {
      const left = e.days.filter((d) => !timedOver(d.end, now))
      left.slice(0, 2).forEach((d) => items.push({ key: `${e.id}-${d.day}`, e, start: d.start, end: d.end, day: d }))
      const later = left.slice(2)
      if (later.length) items.push({ key: `${e.id}-rest`, e, start: later[0].start, end: later[later.length - 1].end, rest: [later[0].day, later[later.length - 1].day] })
    } else if (e.timed ? !timedOver(e.end, now) : e.end >= dayOf(now, utc)) {
      items.push({ key: e.id, e, start: e.start, end: e.end })
    }
  }
  return items.sort((a, b) => a.start.localeCompare(b.start))
}

/** Supercell's events and Clan Games still to come, soonest first. Raid Weekend repeats, so only its next one shows. */
export function gameItems(events: CalEvent[], now: number, utc: boolean): Item[] {
  const left = events
    .filter((e) => !e.clan && (e.timed ? !timedOver(e.end, now) : e.end >= dayOf(now, utc)))
    .sort((a, b) => a.start.localeCompare(b.start))
  const raid = left.find((e) => e.kind === 'raid')
  return left.filter((e) => e.kind !== 'raid' || e === raid).map((e) => ({ key: e.id, e, start: e.start, end: e.end }))
}

const fmt = (ms: number, utc: boolean, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString('en-GB', { ...opts, timeZone: utc ? 'UTC' : undefined })

export const fmtWhen = (iso: string, utc: boolean) => fmt(Date.parse(iso), utc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

const plain = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const fmtDate = (d: string) => plain(d, { weekday: 'short', day: 'numeric', month: 'short' })

/** A date-only event's dates: 22 to 28 Nov, or one day. */
export function fmtRange(start: string, end: string) {
  const short = { day: 'numeric', month: 'short' } as const
  if (start === end) return plain(start, short)
  return `${start.slice(0, 7) === end.slice(0, 7) ? plain(start, { day: 'numeric' }) : plain(start, short)} to ${plain(end, short)}`
}

/** How long until a moment: in 40m, in 21h, in 6 days. */
export function fmtIn(iso: string, now: number) {
  const mins = Math.max(1, Math.round((Date.parse(iso) - now) / 60000))
  if (mins < 60) return `in ${mins}m`
  if (mins < 36 * 60) return `in ${Math.round(mins / 60)}h`
  return `in ${Math.round(mins / 1440)} days`
}

/** How long until a date: Tomorrow, in 6 days. */
export function fmtInDays(day: string, today: string) {
  const n = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  return n <= 1 ? 'Tomorrow' : `in ${n} days`
}
