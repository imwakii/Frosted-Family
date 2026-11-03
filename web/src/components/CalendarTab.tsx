import { useEffect, useMemo, useState } from 'react'
import { type CalDay, type CalEvent, dayOf, fmtDay, fmtMonth, fmtRange, fmtTime, fmtWhen, layWeek, shiftMonth, span, weeksOf, byWeight } from '../calendar'
import { useCalendar } from '../leaders'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { chip, ClanSwitch, KEY_ROW, useNow } from './ui'
import { warLogHref } from './WarLog'

// One month: what Supercell announced, what the game repeats, and the family's wars and plans (server/events.py).

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const OPTIONS = ['All', ...CLANS] as const
const MONTHS_BACK = 1, MONTHS_ON = 3

// Clan colour is for clan events only. Everything else has its own quiet colour.
const LOOK = {
  clan_games: { bg: '#D6E6E4', fg: '#1F5A5F', bar: '#2F7F86', label: 'Clan Games' },
  raid: { bg: '#E3D8BF', fg: '#463A29', bar: '#A3957C', label: 'Raid Weekend' },
  game: { bg: '#F7EBC4', fg: '#6B4F0B', bar: '#C4901A', label: 'Event' },
  cosmetic: { bg: '#FFFBF1', fg: '#5E5240', bar: '#D4BC85', label: 'Cosmetic' },
}

function look(e: CalEvent): { bg: string; fg: string; bar: string; outline?: string } {
  if (e.clan) {
    const c = CLAN[e.clan]
    if (e.expected) return { bg: 'transparent', fg: c.deep, bar: c.accent, outline: `1.5px dashed ${c.accent}` }
    return e.kind === 'cwl' ? { bg: c.accent, fg: '#FFFBF1', bar: c.accent } : { bg: c.tint, fg: c.deep, bar: c.accent, outline: `1px solid ${c.accent}` }
  }
  const k = e.kind === 'clan_games' || e.kind === 'raid' || e.kind === 'cosmetic' ? LOOK[e.kind] : LOOK.game
  return e.expected ? { ...k, bg: 'transparent', outline: `1.5px dashed ${k.bar}` } : e.kind === 'cosmetic' ? { ...k, outline: '1px solid #DFD3B9' } : k
}

const live = (s?: string) => s === 'inWar' || s === 'preparation'

function warHref(clan: ClanName, key: string | null | undefined, state?: string) {
  if (!key || state === 'notDrawn') return null
  return live(state) ? '#/war' : warLogHref(clan, key)
}

function Score({ stars, against, state }: { stars?: number; against?: number; state?: string }) {
  if (state !== 'warEnded' && state !== 'inWar') return null
  return <span className="flex-none text-[13px] font-bold tabular-nums text-ink-2">{stars ?? 0}–{against ?? 0}</span>
}

function Row({ e, href, title, when, right, tag }: { e: CalEvent; href?: string | null; title: React.ReactNode; when: React.ReactNode; right?: React.ReactNode; tag?: string | null }) {
  const external = !!href && href.startsWith('http')
  const body = (
    <>
      <span aria-hidden="true" className="w-1 flex-none self-stretch rounded" style={{ background: look(e).bar }} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 text-[14px] font-bold text-ink">{title}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs font-semibold text-muted">
          {when}
          {tag && <span className="rounded-full bg-well px-1.5 py-px text-[11px] font-bold text-ink-2">{tag}</span>}
          {external && <span className="text-faint underline">Supercell</span>}
        </span>
      </span>
      {right}
    </>
  )
  const cls = 'flex min-h-[52px] items-center gap-2.5 px-3 py-2 text-ink no-underline'
  return (
    <li className="border-t border-hair first:border-t-0">
      {href ? <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={`${cls} hover:bg-hover`}>{body}</a> : <div className={cls}>{body}</div>}
    </li>
  )
}

const tagOf = (e: CalEvent) => (e.source === 'plan' ? 'Planned' : e.expected ? 'Expected' : null)

/** What a CWL band means on one day: the days fought on it, or the preparation before the first. */
function cwlRows(e: CalEvent, day: string, utc: boolean) {
  const clan = e.clan as ClanName
  const on = (e.days ?? []).filter((d) => { const [a, b] = span({ ...e, start: d.start, end: d.end }, utc); return a <= day && day <= b })
  if (!on.length) return <Row key={e.id} e={e} title={`${clan} CWL`} when={`Preparation from ${fmtTime(e.start, utc)}`} href="#/war" />
  return on.map((d: CalDay) => (
    <Row key={`${e.id}-${d.day}`} e={e} href={warHref(clan, d.war_key, d.state)}
      title={<>{clan} CWL day {d.day}{d.opponent && <> v <bdi>{d.opponent}</bdi></>}</>}
      when={`${fmtWhen(d.start, utc)} to ${fmtWhen(d.end, utc)}`} tag={d.state === 'notDrawn' ? 'Not drawn' : null}
      right={<Score stars={d.stars} against={d.opponent_stars} state={d.state} />} />
  ))
}

function DayList({ events, day, utc }: { events: CalEvent[]; day: string; utc: boolean }) {
  const on = events.filter((e) => { const [a, b] = span(e, utc); return a <= day && day <= b }).sort(byWeight)
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="m-0 px-3 pb-2 pt-3 text-[15px] font-extrabold text-ink">{fmtDay(day)}</h2>
      {on.length ? (
        <ul className="m-0 list-none border-t border-hair p-0">
          {on.map((e) => {
            if (e.kind === 'cwl' && e.days) return cwlRows(e, day, utc)
            if (e.war_key) {
              return <Row key={e.id} e={e} href={warHref(e.clan as ClanName, e.war_key, e.state)} title={<>{e.clan} v <bdi>{e.opponent}</bdi>{e.kind === 'friendly' ? ', friendly' : ''}</>}
                when={`${fmtWhen(e.start, utc)} to ${fmtWhen(e.end, utc)}`} right={<Score stars={e.stars} against={e.opponent_stars} state={e.state} />} />
            }
            return <Row key={e.id} e={e} href={e.url} title={e.title} tag={tagOf(e)}
              when={e.timed ? `${fmtWhen(e.start, utc)} to ${fmtWhen(e.end, utc)}` : fmtRange(e.start, e.end)} />
          })}
        </ul>
      ) : <p className="m-0 border-t border-hair px-3 py-4 text-sm font-semibold text-faint">Nothing on</p>}
    </section>
  )
}

function Week({ week, events, utc, compact, today, pick, onPick }: {
  week: (string | null)[]; events: CalEvent[]; utc: boolean; compact: boolean; today: string; pick: string; onPick: (d: string) => void
}) {
  const lanes = compact ? 4 : 5
  const { bands, hidden } = useMemo(() => layWeek(week, events, utc, lanes), [week, events, utc, lanes])
  const used = bands.length ? Math.max(...bands.map((b) => b.lane)) + 1 : 0
  const barH = compact ? 4 : 20, gap = compact ? 2 : 3, top = compact ? 28 : 32
  return (
    <div className="relative border-t border-hair" style={{ minHeight: compact ? 56 : 112, paddingBottom: 6 }}>
      <div className="absolute inset-0 grid grid-cols-7">
        {week.map((d, i) => d ? (
          <button key={d} type="button" aria-pressed={d === pick} aria-label={fmtDay(d)} onClick={() => onPick(d)}
            className={`relative flex cursor-pointer justify-between border-0 p-1 text-left ${i ? 'border-l border-solid border-hair' : ''} ${d === pick ? 'bg-transparent shadow-[inset_0_0_0_2px_var(--color-gold)]' : 'bg-transparent hover:bg-hover'}`}>
            <span className={`flex size-[22px] items-center justify-center rounded-full text-xs font-bold tabular-nums ${d === today ? 'bg-ink text-white' : 'text-ink-2'}`}>{+d.slice(8)}</span>
            {!compact && hidden[d] ? <span className="pr-0.5 pt-0.5 text-[11px] font-bold text-faint">+{hidden[d]}</span> : null}
          </button>
        ) : <span key={i} className={`bg-page/50 ${i ? 'border-l border-hair' : ''}`} />)}
      </div>
      <div aria-hidden="true" className="pointer-events-none relative grid grid-cols-7" style={{ paddingTop: top, rowGap: gap, gridTemplateRows: `repeat(${used}, ${barH}px)` }}>
        {bands.map(({ e, col, len, lane, opensBefore, runsOn }) => {
          const l = look(e)
          const radius = `${opensBefore ? 0 : 6}px ${runsOn ? 0 : 6}px ${runsOn ? 0 : 6}px ${opensBefore ? 0 : 6}px`
          const inset = { marginLeft: opensBefore ? 0 : compact ? 2 : 4, marginRight: runsOn ? 0 : compact ? 2 : 4 }
          return compact
            ? <span key={e.id} style={{ gridColumn: `${col + 1} / span ${len}`, gridRow: lane + 1, background: e.expected ? 'transparent' : l.bar, borderTop: e.expected ? `2px dashed ${l.bar}` : undefined, borderRadius: radius, ...inset }} />
            : (
              <span key={e.id} className="flex min-w-0 items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-bold leading-none"
                style={{ gridColumn: `${col + 1} / span ${len}`, gridRow: lane + 1, background: l.bg, color: l.fg, outline: l.outline, outlineOffset: -1.5, borderRadius: radius, ...inset }}>
                <bdi className="truncate">{e.title}</bdi>
              </span>
            )
        })}
      </div>
    </div>
  )
}

export default function CalendarTab({ wide }: { wide: boolean }) {
  const now = useNow(60_000)
  let utc = false
  try { utc = localStorage.getItem('ff-clock') === 'utc' } catch { /* private mode */ }
  const today = dayOf(now, utc)
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [clan, setClan] = useState<(typeof OPTIONS)[number]>('All')
  const [pick, setPick] = useState(today)
  const { data, loading } = useCalendar(month)
  useEffect(() => { setPick(month === thisMonth ? today : `${month}-01`) }, [month])  // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = useMemo(() => weeksOf(month), [month])
  const events = useMemo(() => (data?.events ?? []).filter((e) => clan === 'All' || !e.clan || e.clan === clan), [data, clan])
  const season = events.filter((e) => e.kind === 'season')
  const onGrid = useMemo(() => events.filter((e) => e.kind !== 'season'), [events])
  const earliest = shiftMonth(thisMonth, -MONTHS_BACK), latest = shiftMonth(thisMonth, MONTHS_ON)

  const arrow = (by: number, off: boolean, d: string) => (
    <button type="button" aria-label={by < 0 ? 'Previous month' : 'Next month'} disabled={off} onClick={() => setMonth(shiftMonth(month, by))}
      className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-40">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  )

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 pb-6 pt-3 md:px-[clamp(16px,3vw,32px)] md:pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-1.5 md:gap-2">
          {arrow(-1, month <= earliest, 'M15 6l-6 6 6 6')}
          <h1 className="font-display m-0 min-w-[8em] text-center text-[20px] font-normal text-brand md:min-w-[9.5em] md:text-2xl">{fmtMonth(month)}</h1>
          {arrow(1, month >= latest, 'M9 6l6 6-6 6')}
          {month !== thisMonth && <button type="button" className={chip(false)} onClick={() => setMonth(thisMonth)}>Today</button>}
        </div>
        <div className="w-full md:w-[360px]"><ClanSwitch value={clan} onPick={setClan} options={OPTIONS} /></div>
      </div>

      {!data && !loading ? (
        <p className="px-4 pt-12 text-center text-sm font-semibold text-faint">Calendar unavailable. Try again shortly.</p>
      ) : !data ? (
        <div aria-busy="true" aria-label="Loading" className="h-[420px] animate-pulse rounded-2xl bg-well" />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-2">
            <section aria-label={fmtMonth(month)} className="overflow-hidden rounded-2xl border border-line bg-white">
              {season.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair px-3 py-2 text-xs font-bold text-[#6B4F0B]">
                  {season.map((e) => (
                    <span key={e.id} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="size-2 rounded-full bg-gold" />{e.title}
                      {e.expected && <span className="rounded-full bg-well px-1.5 py-px text-[11px] text-ink-2">Expected</span>}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-faint">
                {WEEKDAYS.map((d) => <span key={d} className="py-1.5">{wide ? d : d.slice(0, 1)}</span>)}
              </div>
              {weeks.map((w, i) => <Week key={i} week={w} events={onGrid} utc={utc} compact={!wide} today={today} pick={pick} onPick={setPick} />)}
            </section>
            <div aria-label="Key" className={`${KEY_ROW} px-1`}>
              <span className="flex flex-none items-center gap-1.5">
                {(clan === 'All' ? (['Fire', 'Cake', 'Flakes'] as const) : [clan]).map((c) => <span key={c} className="h-2 w-3 rounded-sm" style={{ background: CLAN[c].accent }} />)}Wars
              </span>
              {Object.values(LOOK).map((k) => <span key={k.label} className="flex flex-none items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: k.bar }} />{k.label}</span>)}
              <span className="flex flex-none items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-muted" />Planned</span>
            </div>
          </div>
          <DayList events={events} day={pick} utc={utc} />
        </div>
      )}
    </main>
  )
}
