import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { CLAN, CLANS, GROUPS, SLOT_TEXT, coreAvg, fmtScore, fmtStart } from '../theme'
import { clanHref, playerHref } from '../route'
import type { ClanName, LiveWar, Player, Roster } from '../types'
import { useClans, type ClanMeta } from '../clash'
import { stillToMove } from '../data'
import { setDayPick, useCwlGroups, useDayPick } from '../leaders'
import { jumpToYou, useYou, YouTag } from './You'
import { ClanBadge, ClanSwitch, DayRow, Eyebrow, LeaguePill, PlayDays, SearchIcon, StatusDot, StatusKey, Th, useNow, RowChevron, GoblinNote } from './ui'

type Props = {
  roster: Roster; war: Partial<Record<ClanName, LiveWar | null>>; wide: boolean; q: string; setQ: (v: string) => void
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
function ClanCard({ roster, clan, meta, compact, below }: { roster: Roster; clan: ClanName; meta?: ClanMeta; compact?: boolean; below?: ReactNode }) {
  const f = clanFacts(roster, clan, meta)
  const c = CLAN[clan]
  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'px-4 py-2' : 'rounded-2xl px-3 py-1.5'}`} style={{ background: c.tint }}>
      <a href={clanHref(clan)} aria-label={`${f.name} card`} className="flex min-w-0 items-center gap-2.5 no-underline">
        <ClanBadge src={f.badge} size={34} className="drop-shadow-[0_2px_4px_rgba(43,33,20,.18)]" />
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          <span className="font-display truncate text-[17px] leading-none" style={{ color: c.deep }}>{f.name}</span>
          <LeaguePill league={f.league} text={f.format.replace('League ', '')} />
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M9 6l6 6-6 6" /></svg>
      </a>
      {below}
    </div>
  )
}

export function SearchBox({ q, setQ, tall, onEnter, autoFocus }: { q: string; setQ: (v: string) => void; tall?: boolean; onEnter?: () => void; autoFocus?: boolean }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor="find" className="sr-only">Find name</label>
      <SearchIcon />
      <input
        id="find" type="search" placeholder="Find name" value={q} autoComplete="off" spellCheck={false} autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        className={`${tall ? 'h-[52px]' : 'h-[50px]'} w-full rounded-[14px] border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint`}
      />
    </div>
  )
}

/** A phone page's clan switch with search behind an icon beside it, both following the scroll. A search carried from another tab keeps it open. */
export function PhoneSearch({ q, setQ, onEnter, className = '', children }: { q: string; setQ: (v: string) => void; onEnter?: () => void; className?: string; children: ReactNode }) {
  const [searching, setSearching] = useState(false)
  const open = searching || !!q
  const { yous } = useYou()
  return (
    <div className={`sticky top-0 z-10 flex flex-col gap-2 bg-page px-4 pb-2 pt-1 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-auto">{children}</div>
        <button type="button" aria-label={open ? 'Close search' : 'Find name'} aria-expanded={open}
          onClick={() => { if (open) { setQ(''); setSearching(false) } else setSearching(true) }}
          className="relative size-[50px] flex-none cursor-pointer rounded-xl border-0 bg-well text-muted hover:text-ink">
          {open
            ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="m-auto"><path d="M6 6l12 12M18 6L6 18" /></svg>
            : <SearchIcon />}
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-auto"><SearchBox q={q} setQ={setQ} autoFocus={searching} onEnter={onEnter} /></div>
          {yous.length > 0 && !q && <button type="button" onClick={jumpToYou} className="h-[50px] flex-none cursor-pointer rounded-[14px] border-0 bg-ink px-3 text-sm font-bold text-white">Find me</button>}
        </div>
      )}
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

// Joined date for a new member. Lineups is public, so the suggested slot stays in the leaders' builder.
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

export function readClan(): ClanName {
  try {
    const v = sessionStorage.getItem('ff-clan')
    return v === 'Cake' || v === 'Flakes' ? v : 'Fire'
  } catch { return 'Fire' }
}

function Phone({ roster, war, q, setQ, lock }: Omit<Props, 'wide'>) {
  const [own, setOwn] = useState<ClanName>(readClan)
  useEffect(() => { try { sessionStorage.setItem('ff-clan', own) } catch { /* private mode */ } }, [own])
  const clan = lock?.clan ?? own
  const inCwl = !!roster.clans[clan]?.inCwl
  const nq = norm(q.trim())
  const results = nq ? roster.players.filter((p) => matches(p, nq)).slice(0, 12) : []
  const clans = useClans()
  const { planned, day, setDay, live } = useDay(roster, war)
  const days = useCwlGroups().data?.clans.find((c) => c.clan === clan)?.group?.days
  return (
    <>
      <PhoneSearch q={q} setQ={setQ} className="pb-4" onEnter={() => { if (results[0]) window.location.hash = href(results[0]) }}>
        <ClanSwitch<ClanName> value={clan} onPick={lock?.onPick ?? setOwn} options={lock?.options} />
      </PhoneSearch>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {nq ? (
          <ul className="m-0 list-none rounded-2xl border border-line bg-white py-1">
            {results.map((p, i) => (
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
            {!results.length && <li><GoblinNote goblin="page">No one by that name in this village</GoblinNote></li>}
          </ul>
        ) : (
          <>
            {planned && inCwl && <DayRow days={days} pick={day} onPick={setDay} live={live} roster />}
            <ClanCard roster={roster} clan={clan} meta={clans[clan]} below={inCwl ? <Countdown roster={roster} war={war} slim /> : undefined} />
            <Groups roster={roster} clan={clan} day={day} />
            <StatusKey className="px-1" extra={planned && inCwl ? <span className="flex flex-none items-center gap-1 md:gap-1.5">Filled number: plays that day</span> : undefined} />
          </>
        )}
      </div>
    </>
  )
}

function Desktop({ roster, war, q, setQ, lock }: Omit<Props, 'wide'>) {
  const nq = norm(q.trim())
  const grid = useRef<HTMLDivElement>(null)
  const clans = useClans()
  const hits = useMemo(() => (nq ? roster.players.filter((p) => matches(p, nq)) : []), [nq, roster])
  const { planned, day, setDay, live } = useDay(roster, war)

  useEffect(() => {
    if (!hits.length) return
    const el = grid.current?.querySelector<HTMLElement>(`[data-tag="${CSS.escape(hits[0].tag)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits])

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex w-full min-w-0 max-w-[480px] flex-col gap-3 empty:hidden">
          <Countdown roster={roster} war={war} />
          {planned && <DayRow pick={day} onPick={setDay} live={live} roster />}
        </div>
        <div className="ml-auto flex w-[clamp(220px,28vw,340px)] flex-none flex-col gap-1">
          <SearchBox q={q} setQ={setQ} onEnter={() => { if (hits[0]) window.location.hash = href(hits[0]) }} />
          {nq && !hits.length && <span className="px-1 text-sm text-faint">No one by that name in this village</span>}
        </div>
      </div>
      <div ref={grid} className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {(lock?.options ?? CLANS).map((clan) => {
          return (
            <section key={clan} aria-label={clan} className="overflow-hidden rounded-2xl border border-line bg-white pb-2.5">
              <ClanCard roster={roster} clan={clan} meta={clans[clan]} compact />
              <Groups roster={roster} clan={clan} q={nq} dense day={day} />
            </section>
          )
        })}
      </div>
      <StatusKey />
    </main>
  )
}

export default function CwlTab({ wide, ...rest }: Props) {
  return wide ? <Desktop {...rest} /> : <Phone {...rest} />
}
