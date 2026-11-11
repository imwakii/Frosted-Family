import { type RefObject, useEffect, useRef, useState } from 'react'
import { useClans } from '../clash'
import type { CwlGroup, EightRow } from '../leaders'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import Info from './Info'
import { ClanBadge, Th } from './ui'

// The Recap on Current's day strip, and its landing once a clan's league is over: where it stands, each day against its
// expected score, then the bonus picks. To qualify a member
// needs 8 stars and no missed attack in a finished day, by the game's own attack count. Picks rank by stars per attack, so fewer days never
// counts against anyone, then by average destruction, then by hits on a town hall at or above their own.

const EIGHT = 8
// Accents and case dropped, as the name search does everywhere (CwlTab imports from here, so not imported from there).
const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const SHOWN = 8
const EIGHT_SHOWN = 5
const COLS = 'grid-cols-[16px_34px_minmax(0,1fr)_40px_32px_44px]'

const hits = (r: EightRow) => r.hits ?? 0
const perHit = (r: EightRow) => (hits(r) ? r.stars / hits(r) : 0)
const avg = (r: EightRow) => (hits(r) ? (r.damage ?? 0) / hits(r) : 0)
const missed = (r: EightRow) => r.missed ?? 0
const place = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

// The day strip's heading once a league is over, so Current and Roster both say which month it was.
export const leagueLabel = (g: CwlGroup | null | undefined) => {
  if (!seasonOver(g)) return undefined
  const [y, m] = g!.season.split('-').map(Number)
  return `${new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long' })} CWL`
}

// Over once every stored day has ended and none is still to come, so a round the collector missed doesn't hold it back.
export const seasonOver = (g: CwlGroup | null | undefined) => !!g && g.days.length > 0 && g.days.every((d) => d.state === 'warEnded')

export default function CwlSeason({ group, clan, wide, over, onDay, q = '' }: { group: CwlGroup; clan: ClanName; wide: boolean; over: boolean; onDay: (d: number) => void; q?: string }) {
  const [all, setAll] = useState(false)
  const clans = useClans()
  const { deep, tint } = CLAN[clan]
  const n = group.table.findIndex((r) => r.ours)
  const me = group.table[n]
  // An API from before the season summary sends only stars. An empty list is just a league with no attacks yet.
  const ready = !group.eight.length || group.eight.some((r) => r.hits !== undefined)
  const ok = (r: EightRow) => r.stars >= EIGHT && !missed(r)
  const picks = group.eight.filter(ok).sort((a, b) => perHit(b) - perHit(a) || avg(b) - avg(a) || (b.up ?? 0) - (a.up ?? 0) || a.name.localeCompare(b.name))
  const rest = group.eight.filter((r) => !ok(r)).sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
  // The clan's hits this league, all members together.
  const sum = (f: (r: EightRow) => number) => group.eight.reduce((t, r) => t + f(r), 0)
  const allHits = sum(hits)
  const rate = (n: number) => (ready && allHits ? `${Math.round((n / allHits) * 100)}%` : '—')
  // Three columns from 1280px: Bonus picks and Star count show as many rows as fit beside the first column, so all three
  // cards end level.
  const left = useRef<HTMLDivElement>(null), picksCard = useRef<HTMLElement>(null), starsCard = useRef<HTMLElement>(null)
  const fit = useFitRows(wide, left, [picksCard, starsCard], `${ready}:${picks.length}:${group.eight.length}`)
  // A name search narrows Bonus picks and Star count to the matches, each keeping its place in the ranking.
  const nq = fold(q.trim())
  const match = (r: EightRow) => !nq || fold(r.name).includes(nq) || r.tag.toLowerCase().includes(nq)
  const shown = nq ? picks.filter(match) : all ? picks : picks.slice(0, fit?.[0] ?? SHOWN)
  const restShown = nq ? rest.filter(match) : all ? rest : []
  const days = group.days.length
  const played = group.days.filter((d) => d.state === 'warEnded').length
  return (
    // A wide screen sets the cards side by side: two columns, then three where each card still fills its width.
    <div className={`grid items-start gap-3 ${wide ? 'lg:grid-cols-2 lg:gap-4 xl:grid-cols-3 xl:items-stretch' : ''}`}>
      <div ref={left} className="flex min-w-0 flex-col gap-3 self-start">
      <section aria-label="Season result" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4" style={{ background: tint }}>
          <ClanBadge src={clans[clan]?.badge} size={36} />
          <div className="min-w-0 flex-auto">
            <div className="font-display truncate text-[20px] leading-tight" style={{ color: deep }}>{clans[clan]?.name ?? `Frosted ${clan}`}</div>
            <div className="text-xs font-bold text-muted">{over ? 'CWL over' : `After day ${played} of 7`}</div>
          </div>
          {me && (
            <div className="flex-none text-right">
              <span className="font-display text-[30px] leading-none" style={{ color: deep }}>{place(n + 1)}</span>
              <div className="text-xs font-bold text-muted">of {group.table.length}</div>
            </div>
          )}
        </div>
        {me && (
          <dl className="m-0 grid grid-cols-4 border-t border-hair">
            {[
              // A draw is neither a win nor a loss, so it shows as a middle number when there is one.
              { k: 'Won', v: (() => { const drawn = group.days.filter((d) => d.state === 'warEnded').length - me.won - me.lost; return drawn > 0 ? `${me.won}–${drawn}–${me.lost}` : `${me.won}–${me.lost}` })() },
              { k: 'Stars', v: `${me.stars}` },
              { k: '3★ rate', v: rate(sum((r) => r.threes ?? 0)) },
              { k: 'Avg destruction', v: rate(sum((r) => r.damage ?? 0) / 100) },
            ].map((s, i) => (
              <div key={s.k} className={`flex flex-col items-center gap-0.5 py-3 ${i ? 'border-l border-hair' : ''}`}>
                <dt className="text-center text-[11px] font-bold leading-tight text-faint">{s.k}</dt>
                <dd className="m-0 text-[17px] font-bold tabular-nums text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {over && days < 7 && <p className="m-0 border-t border-hair px-4 py-2 text-xs font-semibold text-muted">{days} of 7 days on record</p>}
      </section>
      {me && <OurWars group={group} me={n} onDay={onDay} />}
      </div>
      {/* Star count, then Bonus picks on a phone. Side by side, Bonus picks leads its column, and from 1280px each has
          a column of its own. */}
      <div className={`flex min-w-0 flex-col gap-3 ${wide ? 'lg:gap-4 xl:contents' : ''}`}>
      {group.eight.some(match) && <div className={`min-w-0 ${wide ? 'lg:order-2 xl:col-start-3 xl:row-start-1' : ''}`}><StarCount rows={group.eight.filter(match)} limit={nq ? Infinity : fit?.[1]} card={starsCard} searching={!!nq} /></div>}
      <section ref={picksCard} aria-label="Bonus picks" className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white ${wide ? 'lg:order-1 xl:col-start-2 xl:row-start-1' : ''}`}>
        {/* The title and the column names share one row. */}
        <div className={`grid items-baseline gap-x-1.5 px-3 py-2.5 ${COLS}`}>
          <span className="col-span-3 flex items-center gap-1.5 text-sm font-bold text-ink">Bonus picks<Info topic="picks" /></span>
          {ready && picks.length > 0 && <><span className="text-right text-[11px] font-bold text-faint">★/hit</span><span className="text-right text-[11px] font-bold text-faint">Hits</span><span className="text-right text-[11px] font-bold text-faint">Avg</span></>}
        </div>
        {!ready ? (
          <p className="m-0 px-3.5 py-6 text-center text-sm font-semibold text-faint">Picks appear after the next server update</p>
        ) : (
          <ol className="m-0 flex flex-auto list-none flex-col">
            {picks.length === 0 && !nq && <li className="border-t border-hair px-3.5 py-6 text-center text-sm font-semibold text-faint">No one has 8 stars without a miss</li>}
            {nq && !shown.length && !restShown.length && <li className="border-t border-hair px-3.5 py-6 text-center text-sm font-semibold text-faint">No one by that name</li>}
            {shown.map((r) => { const i = picks.indexOf(r); return (
              <li key={r.tag} className="border-t border-hair">
                <a href={playerHref(r.tag)} data-tag={r.tag}
                  aria-label={`${i + 1}. ${r.name}, ${perHit(r).toFixed(2)} stars per hit, ${hits(r)} hits, ${Math.round(avg(r))}% average destruction`}
                  className={`grid min-h-[44px] items-center gap-x-1.5 px-3 text-ink no-underline hover:bg-hover ${COLS}`}>
                  <span className="text-right text-xs font-bold tabular-nums text-faint">{i + 1}</span>
                  <Th th={r.th} />
                  <span className="min-w-0 truncate text-sm font-semibold">{r.name}</span>
                  <span className="text-right text-sm font-bold tabular-nums text-ink">{perHit(r).toFixed(2)}</span>
                  <span className="text-right text-xs font-semibold tabular-nums text-muted">{hits(r)}</span>
                  <span className="text-right text-xs font-semibold tabular-nums text-muted">{Math.round(avg(r))}%</span>
                </a>
              </li>
            ) })}
            {restShown.length > 0 && (
              <>
                <li className="border-t border-hair bg-well px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">Not eligible</li>
                {restShown.map((r) => (
                  <li key={r.tag} className="border-t border-hair">
                    <a href={playerHref(r.tag)} data-tag={r.tag} className="grid min-h-[44px] grid-cols-[16px_34px_minmax(0,1fr)_auto] items-center gap-x-1.5 px-3 text-faint no-underline hover:bg-hover">
                      <span /><Th th={r.th} />
                      <span className="min-w-0 truncate text-sm font-semibold">{r.name}</span>
                      <span className="text-right text-xs font-semibold tabular-nums">{missed(r) ? `${missed(r)} missed` : `${r.stars}★`}</span>
                    </a>
                  </li>
                ))}
              </>
            )}
            {!nq && (picks.length > shown.length || all || rest.length > 0) && (
              <li className="mt-auto border-t border-hair">
                <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}
                  className="min-h-11 w-full cursor-pointer border-0 bg-transparent text-[13px] font-bold text-action">{all ? 'Show fewer' : `Show all ${group.eight.length}`}</button>
              </li>
            )}
          </ol>
        )}
      </section>
      </div>
    </div>
  )
}

type Day = CwlGroup['days'][number]
type ClanWar = NonNullable<CwlGroup['table'][number]['wars']>[number]
type Fact = { day: Day; expUs: number | null; expThem: number | null }

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null)
const MOVED = 2  // stars from the expected score as shown (rounded) before a number is coloured
const MIN_WARS = 3  // other wars each side needs before a day gets an expected score
const PRIOR = 2     // average wars added to each clan's record, so a few wars can't swing its usual far

// Each finished day's expected score, from both clans' other finished wars in the group (the group average still has the
// day in it, one war among dozens):
//   our stars   = what we usually get + what they usually concede − the group's average
//   their stars = what they usually get + what we usually concede − the group's average
// "Usually" counts PRIOR average wars alongside a clan's own, so with 3 wars its own results weigh 60% and with 6, 75%.
// It changes only when a day ends, and every day is worked out again then, with the later days in it.
function facts(group: CwlGroup, me: number): Fact[] {
  const us = group.table[me]
  const done = (r: { wars?: ClanWar[] }) => (r.wars ?? []).filter((w) => w.state === 'warEnded')
  const avg = mean(group.table.flatMap((r) => done(r).map((w) => w.stars)))
  return group.days.filter((d) => d.state === 'warEnded').map((day) => {
    const oppTag = us.wars?.find((w) => w.day === day.day)?.opponent_tag
    const opp = group.table.find((r) => r.tag === oppTag)
    const ours = done(us).filter((w) => w.day !== day.day)
    const theirs = done(opp ?? {}).filter((w) => w.opponent_tag !== us.tag)
    if (avg === null || ours.length < MIN_WARS || theirs.length < MIN_WARS) return { day, expUs: null, expThem: null }
    const usual = (xs: number[]) => (xs.reduce((t, x) => t + x, 0) + PRIOR * avg) / (xs.length + PRIOR)
    const get = (ws: ClanWar[]) => usual(ws.map((w) => w.stars)), giveUp = (ws: ClanWar[]) => usual(ws.map((w) => w.opponent_stars))
    return { day, expUs: Math.max(0, get(ours) + giveUp(theirs) - avg), expThem: Math.max(0, get(theirs) + giveUp(ours) - avg) }
  })
}

// Red where a number went against us, green where it went for us: our stars higher is good, theirs higher is bad.
const tone = (actual: number, expected: number | null, higherHelps: boolean) =>
  expected === null || Math.abs(actual - Math.round(expected)) < MOVED ? 'text-ink' : (actual > expected) === higherHelps ? 'text-[#15803D]' : 'text-[#B91C1C]'
const COLS_WARS = 'grid-cols-[38px_minmax(0,1fr)_78px_56px]'
// What the colours say, for screen readers.
const said = (f: Fact) => {
  const parts = [f.expUs !== null && Math.abs(f.day.stars - Math.round(f.expUs)) >= MOVED && `we got ${f.day.stars > f.expUs ? 'more' : 'fewer'} than expected`,
    f.expThem !== null && Math.abs(f.day.opponent_stars - Math.round(f.expThem)) >= MOVED && `they got ${f.day.opponent_stars > f.expThem ? 'more' : 'fewer'} than expected`].filter(Boolean)
  return parts.length ? `, ${parts.join(', ')}` : ''
}

function OurWars({ group, me, onDay }: { group: CwlGroup; me: number; onDay: (d: number) => void }) {
  const list = facts(group, me)
  if (!list.length) return null
  return (
    <section aria-label="Our wars" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className={`grid items-baseline gap-x-2 px-3.5 py-2.5 ${COLS_WARS}`}>
        <span className="col-span-2 text-sm font-bold text-ink">Our wars</span>
        <span className="flex items-center justify-end gap-1 text-[11px] font-bold text-faint">Expected<Info topic="expected" /></span><span className="text-right text-[11px] font-bold text-faint">Result</span>
      </div>
      <ol className="m-0 list-none">
        {list.map((f) => {
          const exp = f.expUs !== null && f.expThem !== null ? `${Math.round(f.expUs)}–${Math.round(f.expThem)}` : '—'
          return (
            <li key={f.day.day} className="border-t border-hair">
              <button type="button" onClick={() => onDay(f.day.day)}
                aria-label={`Day ${f.day.day} against ${f.day.opponent}: expected ${exp}, result ${f.day.stars}–${f.day.opponent_stars}${said(f)}`}
                className={`grid min-h-[44px] w-full cursor-pointer items-center gap-x-2 border-0 bg-transparent px-3.5 text-left hover:bg-hover ${COLS_WARS}`}>
                <span className="text-xs font-bold text-faint">Day {f.day.day}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="flex size-5 flex-none items-center justify-center"><ClanBadge src={f.day.opponent_badge} size={20} /></span>
                  <span className="min-w-0 truncate text-sm font-semibold text-ink">{f.day.opponent}</span>
                </span>
                <span className="text-right text-sm tabular-nums text-faint">{exp}</span>
                <span className="text-right text-sm font-bold tabular-nums">
                  <span className={tone(f.day.stars, f.expUs, true)}>{f.day.stars}</span>
                  <span className="text-ink">–</span>
                  <span className={tone(f.day.opponent_stars, f.expThem, false)}>{f.day.opponent_stars}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Each member's stars this league, toward the 8 the bonus needs.
// Rows that fit a card's height: the first column's height, less the card's title and its Show all row.
// `content` changes when the cards' rows arrive, so a list that loads after the first column is measured again.
function useFitRows(wide: boolean, left: RefObject<HTMLDivElement>, cards: RefObject<HTMLElement>[], content: string) {
  const [fit, setFit] = useState<number[] | null>(null)
  useEffect(() => {
    const col = left.current
    if (!wide || !col) { setFit(null); return }
    const mq = window.matchMedia('(min-width: 1280px)')
    const measure = () => {
      if (!mq.matches) { setFit(null); return }
      // Hidden while a search is on: keep the last fit for when it shows again.
      if (!col.offsetHeight) return
      const next = cards.map((c) => {
        const card = c.current
        const row = card?.querySelector<HTMLElement>('ol > li > a')
        if (!card || !row) return SHOWN
        const head = (card.firstElementChild as HTMLElement).offsetHeight
        return Math.max(3, Math.floor((col.offsetHeight - 2 - head - 45) / (row.offsetHeight + 1)))
      })
      setFit((was) => (was && was.join() === next.join() ? was : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(col)
    mq.addEventListener('change', measure)
    return () => { ro.disconnect(); mq.removeEventListener('change', measure) }
  // The refs are stable, so the cards list needs no dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, left, content])
  return fit
}

function StarCount({ rows, limit = EIGHT_SHOWN, card, searching }: { rows: EightRow[]; limit?: number; card?: RefObject<HTMLElement>; searching?: boolean }) {
  const [all, setAll] = useState(false)
  // A search with no match here leaves the message to Bonus picks, so it shows once.
  if (searching && !rows.length) return null
  return (
    <section ref={card} aria-label="Star count" className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-hair px-3.5 py-2.5 text-sm font-bold text-ink">Star count</div>
      <ol className="m-0 list-none">
        {(all ? rows : rows.slice(0, limit)).map((r, i) => (
          <li key={r.tag}>
            <a href={playerHref(r.tag)} data-tag={r.tag} className={`flex min-h-[44px] items-center gap-2 px-3 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
              <Th th={r.th} />
              <span className="min-w-0 flex-auto truncate text-sm font-semibold">{r.name}</span>
              <span aria-hidden="true" className="flex flex-none gap-[3px]">
                {Array.from({ length: EIGHT }, (_, k) => <span key={k} className={`size-2 rounded-full ${k < r.stars ? 'bg-gold' : 'bg-[#EADFC8]'}`} />)}
              </span>
              <span className="w-5 flex-none text-right text-sm font-bold tabular-nums text-ink-2">{r.stars}</span>
            </a>
          </li>
        ))}
      </ol>
      {rows.length > limit && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}
          className="mt-auto min-h-11 w-full cursor-pointer border-0 border-t border-hair bg-transparent text-[13px] font-bold text-action">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>
      )}
    </section>
  )
}
