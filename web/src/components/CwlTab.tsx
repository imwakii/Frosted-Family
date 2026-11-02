import { useEffect, useMemo, useRef, useState } from 'react'
import { CLAN, CLANS, GROUPS, SLOT_TEXT, coreAvg, fmtScore, fmtStart } from '../theme'
import { playerHref } from '../route'
import type { ClanName, LiveWar, Player, Roster } from '../types'
import { useClans, type ClanMeta } from '../clash'
import { ClanBadge, Eyebrow, LeaguePill, PlayDays, SearchIcon, StatusDot, StatusKey, Th, useNow, WarPill } from './ui'

type Props = { roster: Roster; war: Partial<Record<ClanName, LiveWar | null>>; wide: boolean; q: string; setQ: (v: string) => void }

export const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matches = (p: Player, q: string) => norm(p.name).includes(q) || p.tag.toLowerCase().includes(q)
const href = (p: Player) => playerHref(p.tag)

type DayPick = number | 'all'

function groupsFor(roster: Roster, clan: ClanName, day: DayPick = 'all') {
  const mine = roster.players.filter((p) => p.clan === clan)
  // One day of the published plan, for a clan that has one: who plays, who rests, and the rest as usual.
  if (day !== 'all' && mine.some((p) => p.days)) {
    const playing = mine.filter((p) => p.days?.includes(day))
      .sort((a, b) => (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0))
    const others = mine.filter((p) => !p.days?.includes(day))
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

function clanFacts(roster: Roster, clan: ClanName, meta?: ClanMeta) {
  const info = roster.clans[clan]
  const core = roster.players.filter((p) => p.clan === clan && p.slot === 'CORE')
  // Clans out of CWL have no core, so they show the average of their best 15.
  const best = roster.players.filter((p) => p.clan === clan && p.score !== null).map((p) => p.score as number).sort((a, b) => b - a).slice(0, 15)
  const avg = coreAvg(info?.inCwl ? core.map((p) => p.score) : best)
  const league = meta?.league ?? info?.league ?? null
  return {
    inCwl: !!info?.inCwl,
    league,
    format: info?.inCwl ? `${league ? `${league} · ` : ''}15v15` : league ? `${league} · not in CWL` : 'Not in CWL this month',
    avg: avg === null ? '—' : avg.toFixed(1),
    name: meta?.name ?? `Frosted ${clan}`,
    badge: meta?.badge ?? null,
  }
}

// Badge, name and league; core average (best 15 for clans out of CWL) and member count.
function ClanCard({ roster, clan, meta, war, compact }: { roster: Roster; clan: ClanName; meta?: ClanMeta; war: LiveWar | null | undefined; compact?: boolean }) {
  const f = clanFacts(roster, clan, meta)
  const c = CLAN[clan]
  return (
    <div className={`flex items-center gap-3 ${compact ? 'px-4 py-3.5' : 'rounded-[18px] p-3.5'}`} style={{ background: c.tint }}>
      <ClanBadge src={f.badge} size={compact ? 52 : 64} className="drop-shadow-[0_2px_4px_rgba(15,23,42,.18)]" />
      <div className="flex min-w-0 flex-auto flex-col gap-1">
        <h2 className={`font-display m-0 truncate leading-none ${compact ? 'text-[22px]' : 'text-2xl'}`} style={{ color: c.deep }}>{f.name}</h2>
        <LeaguePill league={f.league} text={f.format.replace('League ', '')} />
        <WarPill war={war} />
      </div>
      <div className="flex flex-none flex-col items-end">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{f.inCwl ? 'Core avg' : 'Top 15 avg'}</span>
        <span className={`font-display leading-none ${compact ? 'text-[26px]' : 'text-[30px]'}`} style={{ color: c.deep }}>{f.avg}</span>
        <span className="mt-1 text-xs font-semibold text-muted">{roster.players.filter((p) => p.clan === clan).length} members</span>
      </div>
    </div>
  )
}

export function SearchBox({ q, setQ, tall, onEnter }: { q: string; setQ: (v: string) => void; tall?: boolean; onEnter?: () => void }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor="find" className="sr-only">Find your name</label>
      <SearchIcon />
      <input
        id="find" type="search" placeholder="Find your name" value={q} autoComplete="off" spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        className={`${tall ? 'h-[52px]' : 'h-12'} w-full rounded-[14px] border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint`}
      />
    </div>
  )
}

// A move into this clan before sign-up, shown after the name as on the poster,
// tinted with the clan the player comes from.
function FromPill({ p }: { p: Player }) {
  const pending = p.inClan && p.inClan !== p.clan
  if (pending) {
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
  return <span className="text-[11px] text-faint">Joined {joined}</span>
}

function Row({ p, n, hit, dense }: { p: Player; n: number; hit?: boolean; dense?: boolean }) {
  const first = n === 1
  return (
    <li>
      <a href={href(p)} data-tag={p.tag}
        className={`flex items-center gap-3 text-ink no-underline ${dense ? 'min-h-[42px] px-2.5' : 'min-h-[46px] px-3.5'} ${first ? '' : 'border-t border-hair'} ${hit ? 'bg-hit' : 'hover:bg-hover'}`}>
        <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{n}</span>
        <Th th={p.th} />
        <span className="flex min-w-0 flex-auto flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`min-w-0 truncate font-semibold ${dense ? 'text-sm' : 'text-[15px]'}`}>{p.name}</span>
            <FromPill p={p} />
            {p.rejoined && <span title="Rejoined, back in their slot" className="flex-none rounded-full bg-[#DCFCE7] px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.04em] text-[#166534]">Back</span>}
          </span>
          {p.slot === 'NEW' && <NewLine p={p} />}
        </span>
        <StatusDot status={p.status} />
        <span className="w-10 flex-none text-right text-sm font-bold tabular-nums text-muted">{fmtScore(p.score)}</span>
      </a>
    </li>
  )
}

function Groups({ roster, clan, q, dense, day }: { roster: Roster; clan: ClanName; q?: string; dense?: boolean; day?: DayPick }) {
  return (
    <>
      {groupsFor(roster, clan, day).map((g) => (
        <section key={g.label} className={`flex flex-col ${dense ? 'gap-0.5 px-2' : 'gap-1.5'}`}>
          {/* Side by side, every clan's list starts under a label row, so the columns line up. */}
          {g.label !== 'Members' || dense ? (
            <div className={`flex justify-between ${dense ? 'px-2.5 pt-3' : 'px-1'}`}>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.label}</Eyebrow>
            </div>
          ) : null}
          {g.rows.length ? (
            <ol className={`m-0 list-none ${dense ? '' : 'rounded-2xl border border-line bg-white py-1'} ${g.dim ? 'opacity-[.85]' : ''}`}>
              {g.rows.map((p, i) => <Row key={p.tag} p={p} n={i + 1} dense={dense} hit={!!q && matches(p, q)} />)}
            </ol>
          ) : null}
        </section>
      ))}
    </>
  )
}

const YOU_KEY = 'ff-you'

function useYou() {
  const [you, setYouState] = useState<string | null>(() => { try { return localStorage.getItem(YOU_KEY) } catch { return null } })
  const setYou = (tag: string | null) => {
    setYouState(tag)
    try { if (tag) localStorage.setItem(YOU_KEY, tag); else localStorage.removeItem(YOU_KEY) } catch { /* private mode */ }
  }
  return [you, setYou] as const
}

// The member this device last searched for, pinned above the lineups.
function YouCard({ roster, tag, onClear }: { roster: Roster; tag: string; onClear: () => void }) {
  const p = roster.players.find((x) => x.tag === tag)
  if (!p) return null
  return (
    <div className="flex min-h-[60px] items-center gap-3 rounded-2xl border-2 bg-white py-1.5 pl-3.5 pr-1.5" style={{ borderColor: CLAN[p.clan].tint }}>
      <a href={href(p)} className="flex min-w-0 flex-auto items-center gap-3 text-ink no-underline">
        <span className="flex-none rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white">You</span>
        <Th th={p.th} />
        <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
        <span className="ml-auto flex flex-none flex-col items-end gap-0.5">
          <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: CLAN[p.clan].tint, color: CLAN[p.clan].deep }}>
            {p.clan} · {roster.clans[p.clan]?.inCwl ? SLOT_TEXT[p.slot] : 'Not in'}
          </span>
          {p.days && <PlayDays days={p.days} clan={p.clan} />}
        </span>
      </a>
      <button type="button" aria-label="Unpin" onClick={onClear}
        className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-faint hover:bg-page hover:text-ink">×</button>
    </div>
  )
}

const until = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

// Before CWL, the time to its start; during it, the day; hidden once it has run its course.
function Countdown({ roster, war }: { roster: Roster; war: Props['war'] }) {
  const now = useNow()
  const day = liveDay(war)
  const start = roster.cwlStart ? Date.parse(roster.cwlStart) : NaN
  if (day) {
    return (
      <div className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 text-[#15803D]">
        <span className="ff-live size-2 flex-none rounded bg-[#16A34A]" />
        <span className="text-[15px] font-bold">CWL · Day {day} of 7</span>
      </div>
    )
  }
  if (!(start > now)) return null
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4">
      <span className="text-[15px] font-bold text-ink">CWL starts in <span className="font-display text-[19px] tabular-nums">{until(start - now)}</span></span>
      <span className="text-xs font-semibold text-faint">{fmtStart(roster.cwlStart)}</span>
    </div>
  )
}

const liveDay = (war: Props['war']) =>
  Math.max(0, ...Object.values(war).map((w) => (w?.kind === 'cwl' && w.state !== 'warEnded' ? w.day ?? 0 : 0)))

// Once a day plan is published the page opens on the day being fought, or day 1 before CWL starts.
function useDay(roster: Roster, war: Props['war']) {
  const planned = roster.players.some((p) => p.days)
  const [pick, setPick] = useState<DayPick | null>(null)
  return { planned, day: (planned ? pick ?? (liveDay(war) || 1) : 'all') as DayPick, setDay: setPick, live: liveDay(war) }
}

function DayPicker({ day, setDay, live }: { day: DayPick; setDay: (d: DayPick) => void; live: number }) {
  const on = 'bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,.12)]'
  return (
    <nav aria-label="CWL day" className="grid w-full max-w-[480px] grid-cols-[1.4fr_repeat(7,1fr)] gap-1 rounded-xl bg-well p-1">
      {(['all', 1, 2, 3, 4, 5, 6, 7] as DayPick[]).map((d) => (
        <button key={d} type="button" aria-pressed={d === day} aria-label={d === 'all' ? 'All days' : `Day ${d}`} onClick={() => setDay(d)}
          className={`relative min-h-[38px] cursor-pointer rounded-[9px] border-0 text-sm font-bold tabular-nums ${d === day ? on : 'bg-transparent text-muted'}`}>
          {d === 'all' ? 'All' : d}
          {d === live && <span className="ff-live absolute right-1 top-1 size-1.5 rounded bg-[#16A34A]" />}
        </button>
      ))}
    </nav>
  )
}

function readClan(): ClanName {
  try {
    const v = sessionStorage.getItem('ff-clan')
    return v === 'Cake' || v === 'Flakes' ? v : 'Fire'
  } catch { return 'Fire' }
}

function Phone({ roster, war, q, setQ }: Omit<Props, 'wide'>) {
  const [clan, setClan] = useState<ClanName>(readClan)
  useEffect(() => { try { sessionStorage.setItem('ff-clan', clan) } catch { /* private mode */ } }, [clan])
  const nq = norm(q.trim())
  const results = nq ? roster.players.filter((p) => matches(p, nq)).slice(0, 12) : []
  const clans = useClans()
  const [you, setYou] = useYou()
  const { planned, day, setDay, live } = useDay(roster, war)
  // Switching clans while scrolled into a list starts the new list at the top, under the clan switch.
  const clanNav = useRef<HTMLElement>(null)
  const pick = (k: ClanName) => {
    setClan(k)
    const top = clanNav.current ? clanNav.current.getBoundingClientRect().top + window.scrollY - 80 : 0
    if (window.scrollY > top) window.scrollTo({ top })
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-page px-4 pb-3 pt-1">
        <SearchBox q={q} setQ={setQ} onEnter={() => { if (results[0]) { setYou(results[0].tag); window.location.hash = href(results[0]) } }} />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {nq ? (
          <ul className="m-0 list-none rounded-2xl border border-line bg-white py-1">
            {results.map((p, i) => (
              <li key={p.tag}>
                <a href={href(p)} onClick={() => setYou(p.tag)}
                  className={`flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                  <Th th={p.th} />
                  <span className="flex min-w-0 flex-auto items-center gap-1.5">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
                    <FromPill p={p} />
                  </span>
                  <span className="flex flex-none flex-col items-end gap-0.5">
                    <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: CLAN[p.clan].tint, color: CLAN[p.clan].deep }}>
                      {p.clan} · {roster.clans[p.clan]?.inCwl ? SLOT_TEXT[p.slot] : 'Not in'}
                    </span>
                    {p.days && <PlayDays days={p.days} clan={p.clan} />}
                  </span>
                </a>
              </li>
            ))}
            {!results.length && <li className="p-4 text-sm text-faint">No one by that name</li>}
          </ul>
        ) : (
          <>
            <Countdown roster={roster} war={war} />
            {you && <YouCard roster={roster} tag={you} onClear={() => setYou(null)} />}
            {planned && <DayPicker day={day} setDay={setDay} live={live} />}
            <nav ref={clanNav} aria-label="Clan" className="grid grid-cols-3 gap-1 rounded-xl bg-well p-1">
              {CLANS.map((k) => (
                <button key={k} type="button" aria-pressed={k === clan} onClick={() => pick(k)}
                  className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 text-[15px] font-bold ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
                  style={k === clan ? { color: CLAN[k].deep } : undefined}>
                  <ClanBadge src={clans[k]?.badge} size={22} />
                  {k} <span className="font-semibold opacity-60">{roster.players.filter((p) => p.clan === k).length}</span>
                </button>
              ))}
            </nav>
            <ClanCard roster={roster} clan={clan} meta={clans[clan]} war={war[clan]} />
            <StatusKey className="px-1" />
            <Groups roster={roster} clan={clan} day={day} />
          </>
        )}
      </div>
    </>
  )
}

function Desktop({ roster, war, q, setQ }: Omit<Props, 'wide'>) {
  const nq = norm(q.trim())
  const grid = useRef<HTMLDivElement>(null)
  const clans = useClans()
  const hits = useMemo(() => (nq ? roster.players.filter((p) => matches(p, nq)) : []), [nq, roster])
  const [you, setYou] = useYou()
  const { planned, day, setDay, live } = useDay(roster, war)

  useEffect(() => {
    if (!hits.length) return
    const el = grid.current?.querySelector<HTMLElement>(`[data-tag="${CSS.escape(hits[0].tag)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits])

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex w-full max-w-[400px] flex-col gap-1">
          <SearchBox q={q} setQ={setQ} onEnter={() => { if (hits[0]) { setYou(hits[0].tag); window.location.hash = href(hits[0]) } }} />
          {nq && !hits.length && <span className="px-1 text-sm text-faint">No one by that name</span>}
        </div>
        {you && <div className="w-full max-w-[480px]"><YouCard roster={roster} tag={you} onClear={() => setYou(null)} /></div>}
        <div className="w-full max-w-[480px]"><Countdown roster={roster} war={war} /></div>
      </div>
      {planned && <DayPicker day={day} setDay={setDay} live={live} />}
      <StatusKey />
      <div ref={grid} onClickCapture={(e) => { const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-tag]'); if (nq && a?.dataset.tag) setYou(a.dataset.tag) }} className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {CLANS.map((clan) => {
          return (
            <section key={clan} aria-label={clan} className="overflow-hidden rounded-[18px] border border-line bg-white pb-2.5">
              <ClanCard roster={roster} clan={clan} meta={clans[clan]} war={war[clan]} compact />
              <Groups roster={roster} clan={clan} q={nq} dense day={day} />
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default function CwlTab({ wide, ...rest }: Props) {
  return wide ? <Desktop {...rest} /> : <Phone {...rest} />
}
