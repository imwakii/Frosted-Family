import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { CLAN, CLANS, GROUPS, SLOT_TEXT, coreAvg, fmtScore, fmtStart } from '../theme'
import { clanHref, go, playerHref } from '../route'
import type { ClanName, LiveWar, Player, Roster } from '../types'
import { useClans, type ClanMeta } from '../clash'
import { stillToMove } from '../data'
import { setDayPick, setWarClan, useCwlGroups, useCwlSeason, useDayPick, useRosterMonth, useRosterMonths, useWarDots, useWarClan, warClanOr } from '../leaders'
import { jumpToYou, useYou, YouTag } from './You'
import { leagueLabel } from './CwlSeason'
import { ClanBadge, ClanSwitch, DayRow, Eyebrow, LeaguePill, PlayDays, SearchIcon, StatusDot, StatusKey, Th, useNow, RowChevron, GoblinNote } from './ui'

type Props = {
  roster: Roster; war: Partial<Record<ClanName, LiveWar | null>>; wide: boolean; q: string; setQ: (v: string) => void
  /** An earlier month to show, from the link (#/war/roster/2026-11); this month's roster without one. */
  month?: string | null
  // A leader's preview: the clans being planned, with the clan picked in the planner.
  lock?: { clan: ClanName; options: readonly ClanName[]; onPick: (c: ClanName) => void }
}

export const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matches = (p: Player, q: string) => norm(p.name).includes(q) || p.tag.toLowerCase().includes(q)
const href = (p: Player) => playerHref(p.tag)

type DayPick = number | 'all'

function groupsFor(roster: Roster, clan: ClanName, day: DayPick = 'all') {
  const mine = roster.players.filter((p) => p.clan === clan)
  // One day of the published plan, for a clan that has one: who plays, who rests, and the rest as usual.
  if (day !== 'all' && mine.some((p) => p.days)) {
    const byScore = (a: Player, b: Player) => (b.score ?? -1) - (a.score ?? -1)
    const playing = mine.filter((p) => p.days?.includes(day)).sort(byScore)
    const others = mine.filter((p) => !p.days?.includes(day)).sort(byScore)
    const groups = [
      { label: 'Playing', dim: false, rows: playing },
      { label: 'Resting', dim: false, rows: others.filter((p) => p.slot === 'CORE' || p.slot === 'SUB') },
      { label: 'Not in', dim: true, rows: others.filter((p) => p.slot === 'OUT') },
      { label: 'New', dim: false, rows: others.filter((p) => p.slot === 'NEW') },
    ]
    return groups.filter((g) => g.rows.length)
  }
  const fresh = { label: 'New', dim: false, rows: mine.filter((p) => p.slot === 'NEW') }
  const groups = roster.clans[clan]?.inCwl
    ? GROUPS.filter((g) => g.slot !== 'NEW').map((g) => ({ label: g.label, dim: g.dim, rows: mine.filter((p) => p.slot === g.slot) }))
    : [{ label: 'Members', dim: false, rows: mine.filter((p) => p.slot !== 'NEW') }]
  // New members follow the clan's other groups, only when there are any.
  return fresh.rows.length ? [...groups, fresh] : groups
}

export function clanFacts(roster: Roster, clan: ClanName, meta?: ClanMeta) {
  const info = roster.clans[clan]
  const core = roster.players.filter((p) => p.clan === clan && p.slot === 'CORE')
  // Clans out of CWL have no core, so they show the average of their best 15.
  const best = roster.players.filter((p) => p.clan === clan && p.score !== null).map((p) => p.score as number).sort((a, b) => b - a).slice(0, 15)
  const avg = coreAvg(info?.inCwl ? core.map((p) => p.score) : best)
  const league = meta?.league ?? info?.league ?? null
  return {
    inCwl: !!info?.inCwl,
    league,
    format: info?.inCwl ? `${league ? `${league} · ` : ''}15v15` : league ? `${league} · no CWL` : 'Not in CWL this month',
    avg: avg === null ? '—' : avg.toFixed(1),
    name: meta?.name ?? `Frosted ${clan}`,
    badge: meta?.badge ?? null,
  }
}

// Badge, name and league, opening the clan's card.
// `stripSaysCwl`: the greyed day strip above already says the clan is out of CWL, so the pill gives the league alone.
function ClanCard({ roster, clan, meta, compact, below, stripSaysCwl }: { roster: Roster; clan: ClanName; meta?: ClanMeta; compact?: boolean; below?: ReactNode; stripSaysCwl?: boolean }) {
  const f = clanFacts(roster, clan, meta)
  const c = CLAN[clan]
  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'px-4 py-3' : 'rounded-2xl px-3.5 py-3'}`} style={{ background: c.tint }}>
      <a href={clanHref(clan)} aria-label={`${f.name} card`} className="flex min-w-0 items-center gap-2.5 no-underline">
        <ClanBadge src={f.badge} size={48} className="drop-shadow-[0_2px_4px_rgba(43,33,20,.18)]" />
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          <span className="font-display truncate text-[22px] leading-none" style={{ color: c.deep }}>{f.name}</span>
          <LeaguePill league={f.league} text={(stripSaysCwl && !f.inCwl && f.league ? f.league : f.format).replace('League ', '')} />
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M9 6l6 6-6 6" /></svg>
      </a>
      {below}
    </div>
  )
}

export function SearchBox({ q, setQ, tall, onEnter, autoFocus, onFocus }: { q: string; setQ: (v: string) => void; tall?: boolean; onEnter?: () => void; autoFocus?: boolean; onFocus?: () => void }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor="find" className="sr-only">Find name</label>
      <SearchIcon />
      <input
        id="find" type="search" placeholder="Find name" value={q} autoComplete="off" spellCheck={false} autoFocus={autoFocus} onFocus={onFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        className={`${tall ? 'h-[52px]' : 'h-[50px]'} w-full rounded-[14px] border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint`}
      />
    </div>
  )
}

/** Search behind an icon: open while asked for, or while a search carried from another tab is on. Closing clears it. */
function useNameSearch(q: string, setQ: (v: string) => void) {
  const [searching, setSearching] = useState(false)
  // The box takes focus once, when the icon opens it, so moving between pages doesn't raise the keyboard again.
  const [focusNext, setFocusNext] = useState(false)
  const open = searching || !!q
  return {
    open, focus: focusNext, focused: () => setFocusNext(false),
    toggle: () => { if (open) { setQ(''); setSearching(false) } else { setSearching(true); setFocusNext(true) } },
  }
}

function SearchToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-label={open ? 'Close search' : 'Find name'} aria-expanded={open} onClick={onToggle}
      className="relative size-[50px] flex-none cursor-pointer rounded-xl border-0 bg-well text-muted hover:text-ink">
      {open
        ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="m-auto"><path d="M6 6l12 12M18 6L6 18" /></svg>
        : <SearchIcon />}
    </button>
  )
}

/** The name box, with Find me beside it until something is typed. */
function SearchRow({ q, setQ, onEnter, autoFocus, onFocus }: { q: string; setQ: (v: string) => void; onEnter?: () => void; autoFocus?: boolean; onFocus?: () => void }) {
  const { yous } = useYou()
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-auto"><SearchBox q={q} setQ={setQ} autoFocus={autoFocus} onFocus={onFocus} onEnter={onEnter} /></div>
      {yous.length > 0 && !q && <button type="button" onClick={jumpToYou} className="h-[50px] flex-none cursor-pointer rounded-[14px] border-0 bg-ink px-3 text-sm font-bold text-white">Find me</button>}
    </div>
  )
}

/** A wide page's top row, the same on War, Log and Stats: the clan switch on the left, the name search on the right, so
 * moving between tabs leaves both where they were. Anything in `extra` sits just left of the search. */
export function WideHeader({ q, setQ, onEnter, extra, children }: { q: string; setQ: (v: string) => void; onEnter?: () => void; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      {children}
      <div className="ml-auto flex flex-none items-center gap-3">
        {extra}
        <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={onEnter} /></div>
      </div>
    </div>
  )
}

/** A phone page's clan switch with search behind an icon beside it, both following the scroll. A search carried from another tab keeps it open. */
export function PhoneSearch({ q, setQ, onEnter, className = '', children }: { q: string; setQ: (v: string) => void; onEnter?: () => void; className?: string; children: ReactNode }) {
  const { open, focus, focused, toggle } = useNameSearch(q, setQ)
  return (
    <div className={`sticky top-0 z-10 flex flex-col gap-2 bg-page px-4 pb-2 pt-1 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-auto">{children}</div>
        <SearchToggle open={open} onToggle={toggle} />
      </div>
      {open && <SearchRow q={q} setQ={setQ} onEnter={onEnter} autoFocus={focus} onFocus={focused} />}
    </div>
  )
}

// A move into this clan before sign-up, shown after the name as on the poster,
// tinted with the clan the player comes from.
function FromPill({ p, roster }: { p: Player; roster: Roster }) {
  if (stillToMove(p, roster)) {
    return (
      <span title={`Still in ${p.inClan}: move to ${p.clan}`}
        className="flex-none whitespace-nowrap rounded-full bg-[#FEF3C7] px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.04em] text-[#92400E]">
        In {p.inClan} · to move
      </span>
    )
  }
  if (!p.from) return null
  return (
    <span className="flex-none whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.04em]"
      style={{ background: CLAN[p.from].tint, color: CLAN[p.from].deep }}>
      From {p.from}
    </span>
  )
}

// Joined date for a new member. Roster is public, so the suggested slot stays in the leaders' builder.
function NewLine({ p }: { p: Player }) {
  // joined_at may be a date or a full timestamp.
  const at = p.joinedAt ? new Date(p.joinedAt.length === 10 ? p.joinedAt + 'T00:00:00Z' : p.joinedAt) : null
  const joined = at && !Number.isNaN(at.getTime()) ? at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null
  if (!joined) return null
  return <span className="flex-none whitespace-nowrap text-[11px] text-faint">Joined {joined}</span>
}

function Row({ p, roster, n, hit, dense, showDays }: { p: Player; roster: Roster; n: number; hit?: boolean; dense?: boolean; showDays?: boolean }) {
  const first = n === 1
  return (
    <li>
      <a href={href(p)} data-tag={p.tag}
        className={`flex items-center gap-3 text-ink no-underline ${showDays ? 'py-1.5' : ''} ${dense ? 'min-h-[42px] px-2.5' : 'min-h-[52px] px-3.5'} ${first ? '' : 'border-t border-hair'} ${hit ? 'bg-hit' : 'hover:bg-hover'}`}>
        <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{n}</span>
        <Th th={p.th} />
        <span className="flex min-w-0 flex-auto flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`min-w-0 truncate font-semibold ${dense ? 'text-sm' : 'text-[15px]'}`}><YouTag tag={p.tag} />{p.name}</span>
            <FromPill p={p} roster={roster} />
            {p.rejoined && <span title="Rejoined, back in their slot" className="flex-none rounded-full bg-[#DCFCE7] px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.04em] text-[#166534]">Back</span>}
          </span>
          {/* Under the name, which keeps the whole row for the name on a phone. */}
          {showDays && <span className="mt-0.5"><PlayDays days={p.days ?? []} clan={p.clan} /></span>}
        </span>
        {p.slot === 'NEW' && <NewLine p={p} />}
        <StatusDot status={p.status} />
        {!showDays && <span className="w-10 flex-none text-right text-sm font-bold tabular-nums text-muted">{fmtScore(p.score)}</span>}
        <RowChevron />
      </a>
    </li>
  )
}

function Groups({ roster, clan, q, dense, day }: { roster: Roster; clan: ClanName; q?: string; dense?: boolean; day?: DayPick }) {
  // With a published plan, the roster answers who plays when; the score is for leaders, on the player's card and in Plan.
  const showDays = day === 'all' && !!roster.clans[clan]?.inCwl && roster.players.some((p) => p.days)
  return (
    <>
      {groupsFor(roster, clan, day).map((g) => (
        <section key={g.label} className={`flex flex-col ${dense ? 'gap-0.5 px-2' : 'gap-1.5'}`}>
          {/* Side by side, every clan's list starts under a label row, so the columns line up. */}
          {g.label !== 'Members' || dense ? (
            <div className={`flex justify-between ${dense ? 'px-2.5 pt-3' : 'px-1'}`}>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.label}</Eyebrow>
              {!showDays && <Eyebrow className={dense ? 'text-[11px]' : ''}>Score</Eyebrow>}
            </div>
          ) : null}
          {g.rows.length ? (
            <ol className={`m-0 list-none ${dense ? '' : 'rounded-2xl border border-line bg-white py-1'} ${g.dim ? 'opacity-[.85]' : ''}`}>
              {g.rows.map((p, i) => <Row key={p.tag} p={p} roster={roster} n={i + 1} dense={dense} hit={!!q && matches(p, q)} showDays={showDays} />)}
            </ol>
          ) : null}
        </section>
      ))}
    </>
  )
}

const until = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

// Before CWL, the time to its start. Once it is on, the War tab has the day.
function Countdown({ roster, war, slim }: { roster: Roster; war: Props['war']; slim?: boolean }) {
  const now = useNow()
  const day = liveDay(war)
  const start = roster.cwlStart ? Date.parse(roster.cwlStart) : NaN
  if (slim) {
    if (day || !(start > now)) return null
    return <span className="text-[13px] font-bold text-ink">CWL starts in <span className="tabular-nums">{until(start - now)}</span></span>
  }
  if (day || !(start > now)) return null
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4">
      <span className="text-[15px] font-bold text-ink">CWL starts in <span className="font-display text-[19px] tabular-nums">{until(start - now)}</span></span>
      <span className="text-xs font-semibold text-faint">{fmtStart(roster.cwlStart)}</span>
    </div>
  )
}

const stateDay = (war: Props['war'], state: string) =>
  Math.max(0, ...Object.values(war).map((w) => (w?.kind === 'cwl' && w.state === state ? w.day ?? 0 : 0)))
const liveDay = (war: Props['war']) => stateDay(war, 'inWar')

// The page opens on the roster, which shows who plays when; a day picked here or on War stays picked.
function useDay(roster: Roster, war: Props['war']) {
  const planned = roster.players.some((p) => p.days)
  const pick = useDayPick()
  return { planned, day: (planned ? pick ?? 'all' : 'all') as DayPick, setDay: setDayPick, live: liveDay(war) }
}

// The phone search on every War view: family members by name or tag, each opening their card.
export const familyHits = (roster: Roster, nq: string) => (nq ? roster.players.filter((p) => matches(p, nq)).slice(0, 12) : [])

export function FamilyHits({ roster, hits, quiet }: { roster: Roster; hits: Player[]; quiet?: boolean }) {
  if (!hits.length && quiet) return null
  return (
    <ul className="m-0 list-none rounded-2xl border border-line bg-white py-1">
      {hits.map((p, i) => (
        <li key={p.tag}>
          <a href={href(p)}
            className={`flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
            <Th th={p.th} />
            <span className="flex min-w-0 flex-auto items-center gap-1.5">
              <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
              <FromPill p={p} roster={roster} />
            </span>
            <span className="flex flex-none flex-col items-end gap-0.5">
              <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: CLAN[p.clan].tint, color: CLAN[p.clan].deep }}>
                {p.clan} · {roster.clans[p.clan]?.inCwl ? SLOT_TEXT[p.slot] : 'Not in'}
              </span>
              {p.days && <PlayDays days={p.days} clan={p.clan} />}
            </span>
            <RowChevron />
          </a>
        </li>
      ))}
      {!hits.length && <li><GoblinNote goblin="page">No one by that name in this village</GoblinNote></li>}
    </ul>
  )
}

export function readClan(): ClanName {
  try {
    const v = sessionStorage.getItem('ff-clan')
    return v === 'Cake' || v === 'Flakes' ? v : 'Fire'
  } catch { return 'Fire' }
}

// ─── months ───────────────────────────────────────────────────────────────────

const cwlLabel = (season: string) => `${new Date(`${season}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} CWL`
// Until the server lists the months: this month's league, or next month's from the 12th, as the server counts it.
const guessMonth = () => { const d = new Date(); if (d.getUTCDate() >= 12) d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 7) }
const monthHref = (season: string, current: string) => (season === current ? '#/war/roster' : `#/war/roster/${season}`)

/** The month Roster shows: this month's, or an earlier one the server keeps, with the roster to show for it. An
 * earlier month is as it was: its own lineup, slots and days, its league's results on the strip, and its own day pick. */
function useMonth(roster: Roster, month: string | null | undefined) {
  const { data } = useRosterMonths()
  const current = data?.current ?? guessMonth()
  const list = data?.months.map((m) => m.season) ?? [current]
  const shown = month && list.includes(month) ? month : current
  const past = shown !== current
  const kept = useRosterMonth(past ? shown : null)
  const league = useCwlSeason(past ? data?.months.find((m) => m.season === shown)?.league ?? null : null).data
  // The day picked on an earlier month belongs to that month, so moving to another starts on All.
  const [picked, setPicked] = useState<{ shown: string; day: DayPick }>({ shown, day: 'all' })
  const pastDay = picked.shown === shown ? picked.day : 'all'
  const setPastDay = (day: DayPick) => setPicked({ shown, day })
  return { current, list, shown, past, roster: past ? kept.data : roster, loading: past && kept.loading, league, pastDay, setPastDay }
}

/** Steps between Roster's months. Wide, it holds the top row where other tabs have the clan switch; on a phone it is
 * the day strip's heading. An arrow with no month that way is greyed, so the control keeps its place. */
function MonthSwitch({ list, shown, current, compact }: { list: string[]; shown: string; current: string; compact?: boolean }) {
  const i = list.indexOf(shown)
  const older = list[i + 1], newer = i > 0 ? list[i - 1] : undefined
  const arrow = (to: string | undefined, back: boolean) => (
    <button type="button" disabled={!to} onClick={() => to && go.to(monthHref(to, current))}
      aria-label={to ? cwlLabel(to) : back ? 'No earlier month' : 'No later month'}
      className={`relative flex flex-none cursor-pointer items-center justify-center border-0 bg-transparent text-ink-2 before:absolute before:content-[''] hover:bg-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${compact ? 'size-7 rounded-full before:-inset-2' : 'size-[42px] rounded-[9px]'}`}>
      <svg aria-hidden="true" width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d={back ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
    </button>
  )
  const past = shown !== current
  if (compact) {
    return (
      <nav aria-label="CWL month" className="-my-1.5 -ml-1.5 flex items-center gap-0.5">
        {arrow(older, true)}
        <Eyebrow>{cwlLabel(shown)}{past ? ' · past' : ''}</Eyebrow>
        {arrow(newer, false)}
      </nav>
    )
  }
  return (
    <nav aria-label="CWL month" className="flex h-[50px] w-full min-w-0 max-w-[480px] items-center gap-1 rounded-xl bg-well p-1">
      {arrow(older, true)}
      <span className="flex min-w-0 flex-auto items-center justify-center gap-2 text-[15px] font-bold text-ink">
        <span className="truncate">{cwlLabel(shown)}</span>
        {past && <span className="flex-none rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-muted">Past</span>}
      </span>
      {arrow(newer, false)}
    </nav>
  )
}

function Phone({ roster: live0, war, q, setQ, lock, month }: Omit<Props, 'wide'>) {
  const own = useWarClan() ?? warClanOr(readClan())
  const setOwn = setWarClan
  const clan = lock?.clan ?? own
  const m = useMonth(live0, month)
  const roster = m.roster ?? live0
  const inCwl = !!roster.clans[clan]?.inCwl
  const nq = norm(q.trim())
  const results = familyHits(roster, nq)
  const clans = useClans()
  const now = useDay(roster, war)
  const { planned } = now
  const groups = useCwlGroups().data
  const group = (m.past ? m.league : groups)?.clans.find((c) => c.clan === clan)?.group
  const days = group?.days
  // This month's league once it is over, or any earlier month: the strip shows results, greyed here when it is over.
  const over = !m.past && inCwl ? leagueLabel(group) : undefined
  const day = m.past ? m.pastDay : now.day
  const dots = useWarDots()
  const heading = <MonthSwitch compact list={m.list} shown={m.shown} current={m.current} />
  return (
    <>
      <PhoneSearch q={q} setQ={setQ} className="pb-4" onEnter={() => { if (results[0]) window.location.hash = href(results[0]) }}>
        <ClanSwitch<ClanName> value={clan} onPick={lock?.onPick ?? setOwn} options={lock?.options} {...dots} />
      </PhoneSearch>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {m.loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" />
          : !m.roster ? <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">That month's roster is no longer kept</div>
          : nq ? <FamilyHits roster={roster} hits={results} /> : (
          <>
            {/* The strip stays, greyed, once this month's league is over, so the page keeps its shape. Its heading is the month. */}
            {planned ? (
              m.past && inCwl ? <DayRow days={days} pick={day} onPick={m.setPastDay} roster drawnOnly={!!days} label={heading} />
                : inCwl && !over ? <DayRow days={days} pick={day} onPick={now.setDay} live={now.live} roster label={heading} />
                : <DayRow out roster label={heading} pick={null} onPick={() => {}} />
            ) : <div className="px-0.5">{heading}</div>}
            <ClanCard roster={roster} clan={clan} meta={clans[clan]} below={inCwl && !m.past ? <Countdown roster={roster} war={war} slim /> : undefined} stripSaysCwl={planned} />
            <Groups roster={roster} clan={clan} day={over || !inCwl ? 'all' : day} />
            <StatusKey className="px-1" extra={planned && inCwl ? <span className="flex flex-none items-center gap-1 md:gap-1.5">Filled number: plays that day</span> : undefined} />
          </>
        )}
      </div>
    </>
  )
}

function Desktop({ roster: live0, war, q, setQ, lock, month }: Omit<Props, 'wide'>) {
  const m = useMonth(live0, month)
  const roster = m.roster ?? live0
  const nq = norm(q.trim())
  const grid = useRef<HTMLDivElement>(null)
  const clans = useClans()
  const hits = useMemo(() => (nq ? roster.players.filter((p) => matches(p, nq)) : []), [nq, roster])
  const now = useDay(roster, war)
  const { planned, live } = now
  // The wide page shows every clan at once, so this month's strip greys only once every clan's league is over.
  const groups = (useCwlGroups().data?.clans ?? []).flatMap((c) => (c.group ? [c.group] : []))
  const finished = !m.past && groups.length > 0 && groups.every((g) => leagueLabel(g))
  const day = m.past ? m.pastDay : now.day
  const shownDay = finished ? 'all' : day
  // An earlier month's strip shows the first of its clans' results; every clan played the same seven days.
  const pastDays = m.league?.clans.find((c) => c.group)?.group?.days

  useEffect(() => {
    if (!hits.length) return
    const el = grid.current?.querySelector<HTMLElement>(`[data-tag="${CSS.escape(hits[0].tag)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits])

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      {/* The top row matches the other tabs: the month where they have the clan switch, the search on the right. */}
      <div className="flex items-start justify-between gap-4">
        <MonthSwitch list={m.list} shown={m.shown} current={m.current} />
        <div className="ml-auto flex w-[clamp(220px,28vw,340px)] flex-none flex-col gap-1">
          <SearchBox q={q} setQ={setQ} onEnter={() => { if (hits[0]) window.location.hash = href(hits[0]) }} />
          {nq && !hits.length && <span className="px-1 text-sm text-faint">No one by that name in this village</span>}
        </div>
      </div>
      {m.loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" />
        : !m.roster ? <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">That month's roster is no longer kept</div> : <>
      <div className="flex w-full min-w-0 max-w-[480px] flex-col gap-3 empty:hidden md:max-w-[552px]">
        {!m.past && <Countdown roster={roster} war={war} />}
        {planned && (m.past ? <DayRow bare days={pastDays} pick={day} onPick={m.setPastDay} roster drawnOnly={!!pastDays} />
          : finished ? <DayRow bare out roster pick={null} onPick={() => {}} />
          : <DayRow bare pick={day} onPick={now.setDay} live={live} roster />)}
      </div>
      <div ref={grid} className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {(lock?.options ?? CLANS).map((clan) => {
          return (
            <section key={clan} aria-label={clan} className="overflow-hidden rounded-2xl border border-line bg-white pb-2.5">
              <ClanCard roster={roster} clan={clan} meta={clans[clan]} compact />
              <Groups roster={roster} clan={clan} q={nq} dense day={shownDay} />
            </section>
          )
        })}
      </div>
      <StatusKey />
      </>}
    </main>
  )
}

export default function CwlTab({ wide, ...rest }: Props) {
  return wide ? <Desktop {...rest} /> : <Phone {...rest} />
}
