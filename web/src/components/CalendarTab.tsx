import { useMemo, useState } from 'react'
import { type CalEvent, dayOf, familyItems, fmtDate, fmtIn, fmtInDays, fmtRange, fmtWhen, gameItems, isOn, type Item, shiftMonth } from '../calendar'
import { useCalendar } from '../leaders'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { ClanSwitch, useNow } from './ui'
import { warLogHref } from './WarLog'

// What's on next, and when: the family's wars first, then the game's events (server/events.py).

const OPTIONS = ['All', ...CLANS] as const

// Clan colour is for one clan's events only. CWL for the family is the app's dark brown.
const FAMILY = '#33271A'
const barOf = ({ e, family }: Item) => (family ? FAMILY : e.clan ? CLAN[e.clan].accent : e.kind === 'clan_games' ? '#2F7F86' : e.kind === 'raid' ? '#A3957C' : '#C4901A')

const warHref = (clan: ClanName, key: string | null | undefined, state?: string) => {
  if (!key) return null
  return state === 'inWar' || state === 'preparation' ? '#/war' : warLogHref(clan, key)
}

function hrefOf({ e, day, rest }: Item) {
  if (e.url) return e.url
  if (rest || !e.clan) return null
  return warHref(e.clan, day ? day.war_key : e.war_key, day ? day.state : e.state)
}

function titleOf({ e, day, rest, family }: Item) {
  if (family) return rest ? `CWL days ${rest[0]} to ${rest[1]}` : 'CWL'
  if (rest) return `${e.clan} CWL days ${rest[0]} to ${rest[1]}`
  if (day) return <>{e.clan} CWL day {day.day}{day.opponent && <> v <bdi>{day.opponent}</bdi></>}</>
  if (e.war_key) return <>{e.clan} v <bdi>{e.opponent}</bdi>{e.kind === 'friendly' ? ', friendly' : ''}</>
  return e.title
}

const Live = () => <span className="flex items-center gap-1 text-[13px] font-bold text-[#15803D]"><span className="ff-live size-1.5 rounded bg-[#16A34A]" />Now</span>

/** One CWL day for the family: each clan's own opponent, time and score, each opening its own war. */
function FamilyDay({ item, now, utc }: { item: Item; now: number; utc: boolean }) {
  return (
    <li className="flex gap-2.5 border-t border-hair px-3 py-2 first:border-t-0">
      <span aria-hidden="true" className="w-1 flex-none self-stretch rounded" style={{ background: FAMILY }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-ink">CWL day {item.clans?.[0].day.day}</span>
          {Date.parse(item.start) <= now ? <Live /> : <span className="text-[13px] font-bold text-ink-2">{fmtIn(item.start, now)}</span>}
        </div>
        {item.clans?.map(({ e, day }) => {
          const clan = e.clan as ClanName
          const href = warHref(clan, day.war_key, day.state)
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="min-w-0 text-[13px] font-bold text-ink">
                  <span style={{ color: CLAN[clan].deep }}>{clan}</span>
                  {day.opponent && <> v <bdi>{day.opponent}</bdi></>}
                  {day.state === 'notDrawn' && <span className="ml-1.5 rounded-full bg-well px-1.5 py-px text-[11px] text-ink-2">Not drawn</span>}
                </span>
                <span className="text-xs font-semibold text-muted">{Date.parse(day.start) <= now ? `Until ${fmtWhen(day.end, utc)}` : fmtWhen(day.start, utc)}</span>
              </span>
              {day.state === 'inWar' && <span className="flex-none text-xs font-bold tabular-nums text-muted">{day.stars ?? 0}–{day.opponent_stars ?? 0}</span>}
            </>
          )
          const cls = 'flex min-h-11 items-center gap-2 text-ink no-underline'
          return href ? <a key={clan} href={href} className={`${cls} hover:bg-hover`}>{body}</a> : <div key={clan} className={cls}>{body}</div>
        })}
      </div>
    </li>
  )
}

function Row({ item, now, utc }: { item: Item; now: number; utc: boolean }) {
  const { e, day, rest, family } = item
  const on = !rest && isOn(item, now, utc)
  const today = dayOf(now, utc)
  const state = day ? day.state : e.state
  const stars = day ? day.stars : e.stars, against = day ? day.opponent_stars : e.opponent_stars
  const tag = e.source === 'plan' ? 'Planned' : e.expected ? 'Expected' : day?.state === 'notDrawn' ? 'Not drawn' : null
  // The family's days end at different times for each clan, so that row gives the date alone.
  const when = rest
    ? `Until ${family ? fmtDate(dayOf(Date.parse(item.end), utc)) : fmtWhen(item.end, utc)}`
    : on
      ? `Until ${e.timed ? fmtWhen(item.end, utc) : fmtDate(item.end)}`
      : e.timed ? fmtWhen(item.start, utc) : fmtRange(item.start, item.end)
  const href = hrefOf(item)
  const external = !!href && href.startsWith('http')
  const body = (
    <>
      <span aria-hidden="true" className="w-1 flex-none self-stretch rounded" style={{ background: barOf(item) }} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 text-[14px] font-bold text-ink">{titleOf(item)}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs font-semibold text-muted">
          {when}
          {tag && <span className="rounded-full bg-well px-1.5 py-px text-[11px] font-bold text-ink-2">{tag}</span>}
          {external && <span className="text-faint underline">Supercell</span>}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-0.5 text-right">
        {on
          ? <Live />
          : <span className="text-[13px] font-bold text-ink-2">{e.timed ? fmtIn(item.start, now) : fmtInDays(item.start, today)}</span>}
        {state === 'inWar' && <span className="text-xs font-bold tabular-nums text-muted">{stars ?? 0}–{against ?? 0}</span>}
      </span>
    </>
  )
  const cls = 'flex min-h-[56px] items-center gap-2.5 px-3 py-2 text-ink no-underline'
  return (
    <li className="border-t border-hair first:border-t-0">
      {href ? <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={`${cls} hover:bg-hover`}>{body}</a> : <div className={cls}>{body}</div>}
    </li>
  )
}

function List({ title, items, now, utc }: { title: string; items: Item[]; now: number; utc: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="m-0 px-3 pb-2 pt-3 text-[15px] font-extrabold text-ink">{title}</h2>
      {items.length
        ? <ul className="m-0 list-none border-t border-hair p-0">{items.map((i) => (i.clans ? <FamilyDay key={i.key} item={i} now={now} utc={utc} /> : <Row key={i.key} item={i} now={now} utc={utc} />))}</ul>
        : <p className="m-0 border-t border-hair px-3 py-4 text-sm font-semibold text-faint">Nothing coming up</p>}
    </section>
  )
}

export default function CalendarTab({ wide }: { wide: boolean }) {
  const now = useNow(60_000)
  let utc = false
  try { utc = localStorage.getItem('ff-clock') === 'utc' } catch { /* private mode */ }
  const thisMonth = dayOf(now, utc).slice(0, 7)
  const [clan, setClan] = useState<(typeof OPTIONS)[number]>('All')
  const current = useCalendar(thisMonth)
  const next = useCalendar(shiftMonth(thisMonth, 1))

  // An event that crosses into next month comes back from both.
  const events = useMemo(() => {
    const byId = new Map<string, CalEvent>()
    for (const e of [...(current.data?.events ?? []), ...(next.data?.events ?? [])]) if (!byId.has(e.id)) byId.set(e.id, e)
    return [...byId.values()]
  }, [current.data, next.data])
  const family = familyItems(events.filter((e) => clan === 'All' || e.clan === clan), now, utc)
  const game = gameItems(events, now, utc)

  return (
    <main className={`mx-auto flex max-w-[1100px] flex-col gap-3 px-4 pb-6 md:px-[clamp(16px,3vw,32px)] ${wide ? 'pt-4' : 'pt-3'}`}>
      <div className="w-full md:w-[360px]"><ClanSwitch value={clan} onPick={setClan} options={OPTIONS} /></div>
      {!current.data && !current.loading ? (
        <p className="px-4 pt-12 text-center text-sm font-semibold text-faint">Calendar unavailable. Try again shortly.</p>
      ) : !current.data ? (
        <div aria-busy="true" aria-label="Loading" className="h-[420px] animate-pulse rounded-2xl bg-well" />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <List title="Family wars" items={family} now={now} utc={utc} />
          <List title="Game events" items={game} now={now} utc={utc} />
        </div>
      )}
    </main>
  )
}
