import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { thIcon } from '../clash'
import { ago, type LogEvent, type Milestone, type Upgrade, type UpgradeCategory, type UpgradeCount, type UpgradeLeader, useClanLog } from '../leaders'
import { go, historyHref, markFromCard, playerHref, useDrill } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName, Roster } from '../types'
import { Card, COLOR, Dot, ticks, useWidth } from './ClansBoard'
import { norm, PhoneSearch, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { Bar } from './OverallBoard'
import { chip, Eyebrow, POINT, RowChevron, Th, UnitIcon, GoblinNote } from './ui'
import { useYou, YouTag } from './You'

// GET /api/log: what has happened in the family, newest day first. Each day opens with who came, went or changed role,
// so a busy day of upgrades does not bury them; a player's upgrades that day share one row, a new town hall has its own.
// A member's row points the way they went: towards the clan on the way in, away from it on the way out.
// A new town hall is a milestone: a gold row at the top of its day, or an ordinary row in the Upgrades view.
// The Upgrades view: the chart, who has made the most, then the feed.

type View = 'all' | 'members' | 'upgrades'
const DAYS_SHOWN = 2
const VIEWS: { id: View; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'members', label: 'Members' }, { id: 'upgrades', label: 'Upgrades' }]
const KINDS: { id: UpgradeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hero', label: 'Heroes' }, { id: 'equipment', label: 'Equipment' }, { id: 'troop', label: 'Troops' },
  { id: 'spell', label: 'Spells' }, { id: 'pet', label: 'Pets' }, { id: 'siege', label: 'Sieges' }, { id: 'town_hall', label: 'Town hall' },
]
const TOP = 5
const LAST_LOOK = 'ff-log-seen'

function readLook(): { at: string; rank: number | null } | null {
  try { return JSON.parse(localStorage.getItem(LAST_LOOK) ?? 'null') } catch { return null }
}

/** What is new since this browser last opened Log, and where you now stand. Nothing on a first look, or when nothing has changed. */
function SinceLastLook({ data, roster }: { data: { events: LogEvent[]; upgrades: Upgrade[] }; roster: Roster }) {
  const { yous } = useYou()
  const [last] = useState(readLook)
  const rank = roster.players.find((p) => yous.includes(p.tag))?.rank ?? null
  const saved = useRef(false)
  useEffect(() => {
    if (saved.current) return
    saved.current = true
    try { localStorage.setItem(LAST_LOOK, JSON.stringify({ at: new Date().toISOString(), rank })) } catch { /* private mode */ }
  }, [rank])
  if (!last) return null
  const ups = data.upgrades.filter((u) => u.at > last.at).length
  const joined = data.events.filter((e) => e.at > last.at && (e.kind === 'joined' || e.kind === 'rejoined')).length
  const left = data.events.filter((e) => e.at > last.at && e.kind === 'left').length
  const moved = last.rank && rank ? last.rank - rank : 0
  const parts = [
    ups > 0 && `${ups} ${ups === 1 ? 'upgrade' : 'upgrades'}`,
    joined > 0 && `${joined} joined`,
    left > 0 && `${left} left`,
    moved !== 0 && `you moved ${moved > 0 ? 'up' : 'down'} ${Math.abs(moved)} ${Math.abs(moved) === 1 ? 'place' : 'places'} in the family`,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <p className="ff-rise m-0 rounded-[14px] bg-[#F6EEDC] px-4 py-2.5 text-sm text-ink-2">
      <span className="font-bold text-ink">Since you last looked: </span>{parts.join(', ')}
    </p>
  )
}
const ROLE: Record<string, string> = { member: 'Member', admin: 'Elder', coLeader: 'Co-leader', leader: 'Leader' }
const MARK: Record<LogEvent['kind'], { point: typeof POINT.right | null; bg: string; fg: string }> = {
  joined: { point: POINT.right, bg: '#E7EFD6', fg: '#2F6B2A' },
  rejoined: { point: POINT.right, bg: '#E7EFD6', fg: '#2F6B2A' },
  visited: { point: null, bg: '#FAF4E5', fg: '#7A6C55' },
  left: { point: POINT.left, bg: '#F8D5CF', fg: '#A3261A' },
  moved: { point: POINT.right, bg: '#DFEAE7', fg: '#1F5A5F' },
  promoted: { point: null, bg: '#F6EACB', fg: '#92400E' },
  demoted: { point: null, bg: '#FAF4E5', fg: '#7A6C55' },
}

function says(e: LogEvent) {
  const role = ROLE[e.role ?? ''] ?? e.role
  switch (e.kind) {
    case 'joined': return `Joined ${e.clan}`
    case 'rejoined': return `Rejoined ${e.clan}`
    case 'visited': return `Visited ${e.clan}`
    case 'left': return `Left ${e.clan}`
    case 'moved': return `${e.from_clan} → ${e.clan}`
    case 'promoted': return `▲ ${role}, ${e.clan}`
    case 'demoted': return `▼ ${role}, ${e.clan}`
  }
}

// The feed's days are the viewer's own, as the clock is. A bare date has no time to place, so it stays as it is.
const localDay = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
export const feedDay = (at: string) => (at.length === 10 ? at : localDay(new Date(at)))

export function dayLabel(day: string, now = new Date()) {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (day === localDay(now)) return 'Today'
  if (day === localDay(yesterday)) return 'Yesterday'
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function UpgradeIcon({ u }: { u: Upgrade }) {
  if (u.category === 'town_hall') {
    const img = thIcon(u.to)
    return img ? <img src={img} alt="" width={40} height={40} className="size-10 flex-none object-contain" /> : <Th th={u.to} />
  }
  return <span className="flex size-10 flex-none items-center justify-center"><UnitIcon name={u.unit} size={40} /></span>
}

const change = (u: Upgrade) => (u.change === 'unlock'
  ? <b className="font-bold text-ink">unlocked</b>
  : <>{u.from} → <b className="font-bold text-ink">{u.to}</b></>)

const ROW = 'flex min-h-[52px] w-full items-center gap-3 px-3.5 py-1.5 text-left text-ink no-underline'

function EventRow({ e, onRoster }: { e: LogEvent; onRoster: boolean }) {
  const m = MARK[e.kind]
  const cls = `flex min-h-10 w-full items-center gap-2 text-[13px] text-ink no-underline ${m.point?.cls ?? 'px-3'}`
  // The word says what happened in its colour; only a new town hall gets a band.
  const style = { ...m.point?.style, background: '#FFFBF1' }
  const body = (
    <>
      {e.th != null && <span className="flex-none text-[11px] font-bold tabular-nums text-faint">TH{e.th}</span>}
      <span className="min-w-0 flex-auto truncate font-semibold"><YouTag tag={e.tag} />{e.name}</span>
      <span className="flex-none whitespace-nowrap text-xs font-semibold" style={{ color: m.fg }}>{says(e)}</span>
      {!e.approx && <span className="flex-none whitespace-nowrap text-[11px] font-semibold text-faint">{ago(e.at)}</span>}
    </>
  )
  // Someone who has gone has no card to open.
  return onRoster
    ? <a href={playerHref(e.tag)} className={`${cls} hover:brightness-95`} style={style}>{body}</a>
    : <div className={cls} style={style}>{body}</div>
}

export function MilestoneRow({ tag, name, at, children }: { tag: string; name: string | null; at?: string; children: ReactNode }) {
  return (
    <a href={playerHref(tag)} className="flex min-h-10 w-full items-center gap-2 px-3 text-[13px] text-ink no-underline hover:brightness-95">
      <span className="min-w-0 flex-auto truncate font-semibold"><YouTag tag={tag} />{name}</span>
      <span className="flex-none whitespace-nowrap text-xs font-semibold text-[#92400E]">★ {children}</span>
      {at && <span className="flex-none whitespace-nowrap text-[11px] font-semibold text-faint">{ago(at)}</span>}
    </a>
  )
}

const DAY = 86_400_000
const WEEKLY_AFTER = 30    // days of history before the chart can show all of it, in weeks
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const dayKey = (x: number) => new Date(x).toISOString().slice(0, 10)
const shortDay = (x: number) => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Upgrades over time, one column a day or week, stacked by clan. The period still running is drawn fainter. */
function UpgradeChart({ counts, clan, kind }: { counts: UpgradeCount[]; clan: ClanName | 'All'; kind: UpgradeCategory | 'all' }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const today = dayMs(dayKey(Date.now()))
  const first = Math.min(...counts.map((c) => dayMs(c.day)))
  const long = (today - first) / DAY >= WEEKLY_AFTER
  const weekly = long && all
  const step = weekly ? 7 * DAY : DAY
  // UTC weeks begin on Monday; 1 Jan 1970 was a Thursday.
  const bucket = (x: number) => (weekly ? x - ((x / DAY + 3) % 7) * DAY : x)
  const from = bucket(long && !all ? Math.max(first, today - (WEEKLY_AFTER - 1) * DAY) : first)
  const xs: number[] = []
  for (let x = from; x <= today; x += step) xs.push(x)
  const shown: ClanName[] = clan === 'All' ? [...CLANS] : [clan]
  const at = new Map(xs.map((x) => [x, Object.fromEntries(shown.map((k) => [k, 0])) as Record<ClanName, number>]))
  counts.filter((c) => shown.includes(c.clan) && (kind === 'all' || c.category === kind)).forEach((c) => {
    const col = at.get(bucket(dayMs(c.day)))
    if (col) col[c.clan] += c.n
  })
  const total = (x: number) => shown.reduce((s, k) => s + at.get(x)![k], 0)

  const H = 172, L = 30, T = 10, B = 24
  const yt = ticks(0, Math.max(1, ...xs.map(total)))
  const y1 = yt[yt.length - 1]
  const iw = Math.max(0, w - L), ih = H - T - B
  const band = iw / xs.length
  const bw = Math.min(36, Math.max(3, band * 0.68))
  const sy = (v: number) => T + ih - (v / y1) * ih
  const label = (x: number) => (weekly ? `Week of ${shortDay(x)}` : shortDay(x))
  const open = (x: number) => x + step > today
  // Every label when they fit; otherwise the two ends and the middle.
  const named = xs.filter((_, i) => xs.length <= 7 || band > 48 || i === 0 || i === xs.length - 1 || i === Math.floor((xs.length - 1) / 2))
  const pick = (e: PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - L) / band)
    setHover(i >= 0 && i < xs.length ? i : null)
  }
  const hx = hover === null ? null : xs[hover]
  const seriesKey = clan === 'All' && <span className="flex gap-2.5">{CLANS.map((k) => <span key={k} className="flex items-center gap-1 text-ink-2"><Dot k={k} />{k}</span>)}</span>
  return (
    <Card title={weekly ? 'Upgrades per week' : 'Upgrades per day'} aside={seriesKey || undefined}>
      {long && (
        <div role="group" aria-label="Range" className="flex gap-1.5 self-start">
          {([[false, '30 days'], [true, 'All']] as const).map(([id, text]) => (
            <button key={text} type="button" aria-pressed={all === id} onClick={() => setAll(id)} className={chip(all === id)}>{text}</button>
          ))}
        </div>
      )}
      <div ref={ref} className="relative w-full select-none">
        {w > 0 ? (
          <svg role="img" aria-label={xs.map((x) => `${label(x)}: ${total(x)}`).join(', ')} width={w} height={H} className="block touch-pan-y" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
            {yt.map((t) => (
              <g key={t}>
                <line x1={L} x2={w} y1={sy(t)} y2={sy(t)} stroke="#EFE6D2" />
                <text x={L - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#7A6C55">{t}</text>
              </g>
            ))}
            {xs.map((x, i) => {
              const bx = L + i * band + (band - bw) / 2
              let top = T + ih
              const parts = shown.filter((k) => at.get(x)![k])
              return (
                <g key={x} opacity={open(x) ? 0.55 : 1}>
                  {hover === i && <rect x={L + i * band} y={T} width={band} height={ih} fill="#F1E8D3" />}
                  {parts.map((k, j) => {
                    const h = (at.get(x)![k] / y1) * ih
                    const y = top - h
                    top = y
                    const gap = j ? 2 : 0   // a surface gap between the clans
                    const r = j === parts.length - 1 ? Math.min(4, h, bw / 2) : 0
                    return <path key={k} fill={COLOR[k]} d={`M${bx},${y + h - gap}V${y + r}Q${bx},${y} ${bx + r},${y}H${bx + bw - r}Q${bx + bw},${y} ${bx + bw},${y + r}V${y + h - gap}Z`} />
                  })}
                </g>
              )
            })}
            {named.map((x) => <text key={x} x={L + xs.indexOf(x) * band + band / 2} y={H - 6} fontSize="10.5" fill="#7A6C55" textAnchor="middle">{shortDay(x)}</text>)}
          </svg>
        ) : <div style={{ height: H }} />}
        {hx !== null && (
          <div role="tooltip" className="pointer-events-none absolute top-0 z-10 flex min-w-[120px] flex-col gap-1 rounded-lg border border-line bg-white px-2.5 py-2 text-xs shadow-[0_6px_20px_rgba(43,33,20,.12)]"
            style={hover! > xs.length / 2 ? { right: w - (L + hover! * band) + 6 } : { left: L + (hover! + 1) * band + 6 }}>
            <span className="font-bold text-ink">{label(hx)}{open(hx) ? ' so far' : ''}</span>
            {clan === 'All'
              ? <>
                  {CLANS.map((k) => <span key={k} className="flex items-center gap-1.5 text-ink-2"><Dot k={k} />{k}<span className="ml-auto pl-2 font-bold text-ink tabular-nums">{at.get(hx)![k]}</span></span>)}
                  <span className="flex border-t border-hair pt-1 text-ink-2">Family<span className="ml-auto pl-2 font-bold text-ink tabular-nums">{total(hx)}</span></span>
                </>
              : <span className="font-bold text-ink tabular-nums">{total(hx)} {total(hx) === 1 ? 'upgrade' : 'upgrades'}</span>}
          </div>
        )}
      </div>
    </Card>
  )
}

function UpgradeRow({ ups, showClan, open, onToggle }: { ups: Upgrade[]; showClan: boolean; open: boolean; onToggle: () => void }) {
  const u = ups[0]
  const who = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[15px] font-semibold"><YouTag tag={u.tag} />{u.name}</span>
      {showClan && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[u.clan].deep }}>{u.clan}</span>}
    </span>
  )
  const when = <span className="flex-none whitespace-nowrap text-xs font-semibold text-faint">{ago(u.at)}</span>
  if (ups.length === 1) {
    return (
      <a href={playerHref(u.tag)} className={`${ROW} hover:bg-hover`}>
        <UpgradeIcon u={u} />
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          {who}
          <span className="truncate text-[13px] text-muted">{u.category === 'town_hall' ? 'Town Hall' : u.unit} {change(u)}</span>
        </span>
        {when}
        {/* The same arrow as a group's, at every width, so each row's time lines up: this one opens the card. */}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M9 6l6 6-6 6" /></svg>
      </a>
    )
  }
  return (
    <>
      <button type="button" aria-expanded={open} onClick={onToggle} className={`${ROW} cursor-pointer border-0 bg-transparent hover:bg-hover`}>
        <UpgradeIcon u={u} />
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          {who}
          <span className="truncate text-[13px] text-muted">{ups.length} upgrades</span>
        </span>
        {when}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`flex-none transition-transform ${open ? 'rotate-90' : ''}`}><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="flex flex-col gap-1 px-3.5 pb-3">
          <ul className="m-0 flex list-none flex-col rounded-xl border border-line p-0">
            {ups.map((x, i) => (
              <li key={`${x.unit}-${x.to}`} className={`flex min-h-10 items-center gap-2.5 px-2.5 py-1 text-[13px] text-muted ${i ? 'border-t border-hair' : ''}`}>
                <UnitIcon name={x.unit} size={26} />
                <span className="min-w-0 flex-auto truncate">{x.unit}</span>
                <span className="flex-none tabular-nums">{change(x)}</span>
              </li>
            ))}
          </ul>
          <a href={playerHref(u.tag)} className="flex min-h-9 items-center justify-center rounded-full text-[13px] font-bold text-action no-underline hover:bg-hover">View card</a>
        </div>
      )}
    </>
  )
}

/** Most upgrades in the last 7 or 30 days. Clan and search come from the page. */
function MostUpgrades({ board, clan, kind, nq }: { board: UpgradeLeader[]; clan: ClanName | 'All'; kind: UpgradeCategory | 'all'; nq: string }) {
  const [days, setDays] = useState<7 | 30>(7)
  const [everyone, setEveryone] = useState(false)
  const tally = (r: UpgradeLeader) => (kind === 'all' ? r : r.kinds?.[kind])
  const n = (r: UpgradeLeader) => (days === 7 ? tally(r)?.week : tally(r)?.month) ?? 0
  const last = (r: UpgradeLeader) => tally(r)?.last ?? r.last
  const ranked = board.filter((r) => (clan === 'All' || r.clan === clan) && n(r) > 0
    && (!nq || norm(r.name ?? '').includes(nq) || r.tag.toLowerCase().includes(nq))).sort((a, b) => n(b) - n(a) || last(b).localeCompare(last(a)))
  const shown = everyone || nq ? ranked : ranked.slice(0, TOP)
  const most = ranked.length ? n(ranked[0]) : 1
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Range" className="flex gap-1.5">
        {([7, 30] as const).map((d) => <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={chip(d === days)}>{d} days</button>)}
      </div>
      {!shown.length ? <GoblinNote box goblin={nq ? 'page' : 'coin'}>{nq ? 'No one by that name in this village' : 'No upgrades yet'}</GoblinNote> : (
        <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
          {shown.map((r, i) => (
            <li key={r.tag}>
              <a href={historyHref(r.tag, days)} onClick={() => markFromCard(false)} data-tag={r.tag} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{ranked.findIndex((x) => n(x) === n(r)) + 1}</span>
                <Th th={r.th} />
                <span className="flex min-w-0 flex-auto flex-col gap-1">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-[15px] font-semibold"><YouTag tag={r.tag} />{r.name}</span>
                    {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                    <span className="ml-auto flex-none text-xs text-faint">{ago(last(r))}</span>
                  </span>
                  <Bar v={(n(r) / most) * 100} color={COLOR[r.clan]} />
                </span>
                <span className="flex-none text-sm font-extrabold tabular-nums">{n(r)}</span>
                <RowChevron />
              </a>
            </li>
          ))}
        </ol>
      )}
      {!nq && ranked.length > TOP && <button type="button" onClick={() => setEveryone((v) => !v)} className="min-h-11 w-full cursor-pointer rounded-full border border-line bg-white text-sm font-bold text-action hover:bg-hover">{everyone ? 'Show less' : `Show all ${ranked.length}`}</button>}
    </div>
  )
}

export default function LogTab({ roster, q, setQ, wide }: { roster: Roster; q: string; setQ: (v: string) => void; wide: boolean }) {
  const { data, loading } = useClanLog()
  const [clan, setClan] = useClanPick()
  const [view, setView] = useState<View>('all')
  const [kind, setKind] = useState<UpgradeCategory | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [allDays, setAllDays] = useState(false)
  useDrill((d) => !!data && d.unit === 'Town Hall', () => { setView('all'); setAllDays(true) })
  const nq = norm(q.trim())
  const here = useMemo(() => new Set(roster.players.map((p) => p.tag)), [roster])
  const named = (x: { name: string | null; tag: string }) => !nq || norm(x.name ?? '').includes(nq) || x.tag.toLowerCase().includes(nq)

  const events = (view === 'upgrades' ? [] : data?.events ?? [])
    .filter((e) => (clan === 'All' || e.clan === clan || e.from_clan === clan) && named(e))
  const allUps = (data?.upgrades ?? []).filter((u) => (clan === 'All' || u.clan === clan) && named(u))
  const halls = view === 'upgrades' ? [] : allUps.filter((u) => u.category === 'town_hall')
  const miles = view === 'all' ? (data?.milestones ?? []).filter((m) => (clan === 'All' || m.clan === clan) && named(m)) : []
  const ups = view === 'members' ? [] : allUps.filter((u) => (view === 'upgrades' ? kind === 'all' || u.category === kind : u.category !== 'town_hall'))

  // One day: its member events, then a row for each player's upgrades, most recent first.
  const days = new Map<string, { halls: Upgrade[]; miles: Milestone[]; events: LogEvent[]; groups: Map<string, Upgrade[]> }>()
  const dayOf = (at: string) => {
    const d = feedDay(at)
    if (!days.has(d)) days.set(d, { halls: [], miles: [], events: [], groups: new Map() })
    return days.get(d)!
  }
  halls.forEach((u) => dayOf(u.at).halls.push(u))
  miles.forEach((m) => dayOf(m.at).miles.push(m))
  events.forEach((e) => dayOf(e.at).events.push(e))
  ups.forEach((u) => {
    const g = dayOf(u.at).groups
    const key = u.category === 'town_hall' ? `${u.tag}-th-${u.to}` : u.tag
    g.set(key, [...(g.get(key) ?? []), u])
  })
  const order = [...days.keys()].sort().reverse()
  // The feed opens on its last two days with anything in them. A search or a kind is looking for something, so it reaches the whole history.
  const looking = !!nq || (view === 'upgrades' && kind !== 'all')
  const shown = allDays || looking ? order : order.slice(0, DAYS_SHOWN)

  const filters = (
    <div className={`flex flex-col gap-1.5 ${wide ? '' : 'px-4'}`}>
      <div role="group" aria-label="Show" className="flex gap-1.5">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={v.id === view} onClick={() => setView(v.id)} className={chip(v.id === view)}>{v.label}</button>)}
      </div>
    </div>
  )
  const kinds = view === 'upgrades' && (
    <div role="group" aria-label="Kind" className={`flex flex-none gap-1.5 overflow-x-auto [scrollbar-width:none] ${wide ? 'flex-wrap' : ''}`}>
      {KINDS.map((k) => <button key={k.id} type="button" aria-pressed={k.id === kind} onClick={() => setKind(k.id)} className={chip(k.id === kind)}>{k.label}</button>)}
    </div>
  )
  const look = view === 'all' && !!data && !nq && <SinceLastLook data={data} roster={roster} />
  const leaders = view === 'upgrades' && !!data && (
    <section aria-label="Most upgrades" className="flex flex-col gap-1.5">
      <Eyebrow>Most upgrades</Eyebrow>
      <MostUpgrades board={data.upgrade_board ?? []} clan={clan} kind={kind} nq={nq} />
    </section>
  )
  const first = events.find((e) => here.has(e.tag))?.tag ?? halls[0]?.tag ?? ups[0]?.tag
  const enter = () => { if (first) go.to(playerHref(first)) }
  const started = data?.since && new Date(`${data.since}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  const chart = view === 'upgrades' && !!data?.upgrade_counts?.length && <UpgradeChart counts={data.upgrade_counts} clan={clan} kind={kind} />
  const feed = !data ? <Empty loading={loading} /> : !order.length
    ? <GoblinNote box goblin={nq ? 'page' : 'bored'}>{nq ? 'No one by that name in this village' : 'All quiet in the village'}</GoblinNote>
    : (
      <div className="flex flex-col gap-3">
        {shown.map((d) => {
          const day = days.get(d)!
          const groups = [...day.groups.entries()].sort((a, b) => b[1][0].at.localeCompare(a[1][0].at))
          return (
            <section key={d} aria-label={dayLabel(d)} className="flex flex-col gap-1.5">
              <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">{dayLabel(d)}</span>
              {!!(day.halls.length || day.miles.length || day.events.length) && (
                <ol className="m-0 grid list-none grid-cols-1 gap-1 p-0 md:grid-cols-2">
                  {day.halls.map((u) => <li key={`${u.tag}-th-${u.to}`} data-tag={u.tag} className="min-w-0 bg-[#F7E8BC] md:col-span-2"><MilestoneRow tag={u.tag} name={u.name} at={u.at}>Reached TH{u.to}</MilestoneRow></li>)}
                  {day.miles.map((m) => <li key={`${m.kind}-${m.tag}-${m.at}-${m.unit ?? ''}`} data-tag={m.tag} className="min-w-0 bg-[#F7E8BC] md:col-span-2"><MilestoneRow tag={m.tag} name={m.name} at={m.at}>{m.kind === 'hero' ? `Maxed ${m.unit}` : `${(m.stars ?? 0).toLocaleString('en-GB')} war stars`}</MilestoneRow></li>)}
                  {day.events.map((e) => <li key={`${e.kind}-${e.tag}-${e.at}`} className="min-w-0"><EventRow e={e} onRoster={here.has(e.tag)} /></li>)}
                </ol>
              )}
              {!!groups.length && (
                <ol className="m-0 list-none divide-y divide-hair rounded-2xl border border-line bg-white py-1">
                  {groups.map(([key, rows]) => {
                    const id = `${d}-${key}`
                    return <li key={id}><UpgradeRow ups={rows} showClan={clan === 'All'} open={open === id} onToggle={() => setOpen((o) => (o === id ? null : id))} /></li>
                  })}
                </ol>
              )}
            </section>
          )
        })}
        {shown.length < order.length && (
          <button type="button" onClick={() => setAllDays(true)} className="min-h-11 w-full cursor-pointer rounded-full border border-line bg-white text-sm font-bold text-action hover:bg-hover">Show all {order.length} days</button>
        )}
        {started && <span className="px-1 text-xs font-semibold text-faint">Members since {started} · upgrades from the last {data.upgrade_days} days</span>}
      </div>
    )

  const everything = (
    <div className="flex flex-col gap-1.5">
      {view === 'upgrades' && <Eyebrow>Every upgrade</Eyebrow>}
      {feed}
    </div>
  )

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex items-center justify-between gap-4">
          <ClanFilter clan={clan} setClan={setClan} />
          <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        </div>
        {filters}
        <div className="flex w-full flex-col gap-3">{look}{kinds}{chart}{leaders}{everything}</div>
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <PhoneSearch q={q} setQ={setQ} onEnter={enter}><ClanFilter clan={clan} setClan={setClan} /></PhoneSearch>
      {filters}
      <div className="flex flex-col gap-3 px-4">{look}{kinds}{chart}{leaders}{everything}</div>
    </div>
  )
}
