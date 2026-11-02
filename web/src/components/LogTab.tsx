import { type PointerEvent, useMemo, useState } from 'react'
import { thIcon } from '../clash'
import { ago, type LogEvent, type Upgrade, type UpgradeCategory, type UpgradeCount, useClanLog } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName, Roster } from '../types'
import { Card, COLOR, Dot, ticks, useWidth } from './ClansBoard'
import { norm, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { POINT, Th, UnitIcon, RowChevron } from './ui'
import { YouTag } from './You'

// GET /api/log: what has happened in the family, newest day first. Each day opens with who came, went or changed role,
// so a busy day of upgrades does not bury them; a player's upgrades that day share one row, a new town hall has its own.
// A member's row points the way they went: towards the clan on the way in, away from it on the way out.

type View = 'all' | 'members' | 'upgrades'
const VIEWS: { id: View; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'members', label: 'Members' }, { id: 'upgrades', label: 'Upgrades' }]
const KINDS: { id: UpgradeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hero', label: 'Heroes' }, { id: 'equipment', label: 'Equipment' }, { id: 'troop', label: 'Troops' },
  { id: 'spell', label: 'Spells' }, { id: 'pet', label: 'Pets' }, { id: 'siege', label: 'Sieges' }, { id: 'town_hall', label: 'Town hall' },
]
const ROLE: Record<string, string> = { member: 'Member', admin: 'Elder', coLeader: 'Co-leader', leader: 'Leader' }
const MARK: Record<LogEvent['kind'], { point: typeof POINT.right | null; bg: string; fg: string }> = {
  joined: { point: POINT.right, bg: '#F0FDF4', fg: '#166534' },
  rejoined: { point: POINT.right, bg: '#F0FDF4', fg: '#166534' },
  visited: { point: null, bg: '#F1F5F9', fg: '#64748B' },
  left: { point: POINT.left, bg: '#FEF2F2', fg: '#B91C1C' },
  moved: { point: POINT.right, bg: '#EFF6FF', fg: '#1D4ED8' },
  promoted: { point: null, bg: '#FFFBEB', fg: '#92400E' },
  demoted: { point: null, bg: '#F1F5F9', fg: '#64748B' },
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

function dayLabel(day: string, now = new Date()) {
  // Days are UTC days, matching every other time on the site.
  const key = (x: Date) => x.toISOString().slice(0, 10)
  if (day === key(now)) return 'Today (UTC)'
  if (day === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday (UTC)'
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
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

const ROW = 'flex min-h-[58px] w-full items-center gap-3 px-3.5 py-1.5 text-left text-ink no-underline'

function EventRow({ e, onRoster }: { e: LogEvent; onRoster: boolean }) {
  const m = MARK[e.kind]
  const cls = `flex min-h-10 w-full items-center gap-2 text-[13px] text-ink no-underline ${m.point?.cls ?? 'px-3'}`
  const style = { ...m.point?.style, background: m.bg }
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
        <div role="group" aria-label="Range" className="flex self-start rounded-lg bg-well p-0.5">
          {([[false, '30 days'], [true, 'All']] as const).map(([id, text]) => (
            <button key={text} type="button" aria-pressed={all === id} onClick={() => setAll(id)} className={`min-h-8 cursor-pointer rounded-md border-0 px-3 text-[13px] font-bold ${all === id ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,.1)]' : 'bg-transparent text-faint'}`}>{text}</button>
          ))}
        </div>
      )}
      <div ref={ref} className="relative w-full select-none">
        {w > 0 ? (
          <svg role="img" aria-label={xs.map((x) => `${label(x)}: ${total(x)}`).join(', ')} width={w} height={H} className="block touch-pan-y" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
            {yt.map((t) => (
              <g key={t}>
                <line x1={L} x2={w} y1={sy(t)} y2={sy(t)} stroke="#EEF1F6" />
                <text x={L - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#64748B">{t}</text>
              </g>
            ))}
            {xs.map((x, i) => {
              const bx = L + i * band + (band - bw) / 2
              let top = T + ih
              const parts = shown.filter((k) => at.get(x)![k])
              return (
                <g key={x} opacity={open(x) ? 0.55 : 1}>
                  {hover === i && <rect x={L + i * band} y={T} width={band} height={ih} fill="#F1F5F9" />}
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
            {named.map((x) => <text key={x} x={L + xs.indexOf(x) * band + band / 2} y={H - 6} fontSize="10.5" fill="#64748B" textAnchor="middle">{shortDay(x)}</text>)}
          </svg>
        ) : <div style={{ height: H }} />}
        {hx !== null && (
          <div role="tooltip" className="pointer-events-none absolute top-0 z-10 flex min-w-[120px] flex-col gap-1 rounded-lg border border-line bg-white px-2.5 py-2 text-xs shadow-[0_6px_20px_rgba(15,23,42,.12)]"
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
      {u.th && u.category !== 'town_hall' && <span className="flex-none text-[11px] font-bold text-faint">TH{u.th}</span>}
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
        <RowChevron />
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
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
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
          <a href={playerHref(u.tag)} className="flex min-h-9 items-center justify-center rounded-lg text-[13px] font-bold text-action no-underline hover:bg-page">View card</a>
        </div>
      )}
    </>
  )
}

export default function LogTab({ roster, q, setQ, wide }: { roster: Roster; q: string; setQ: (v: string) => void; wide: boolean }) {
  const { data, loading } = useClanLog()
  const [clan, setClan] = useClanPick()
  const [view, setView] = useState<View>('all')
  const [kind, setKind] = useState<UpgradeCategory | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const nq = norm(q.trim())
  const here = useMemo(() => new Set(roster.players.map((p) => p.tag)), [roster])
  const named = (x: { name: string | null; tag: string }) => !nq || norm(x.name ?? '').includes(nq) || x.tag.toLowerCase().includes(nq)

  const events = (view === 'upgrades' ? [] : data?.events ?? [])
    .filter((e) => (clan === 'All' || e.clan === clan || e.from_clan === clan) && named(e))
  const ups = (view === 'members' ? [] : data?.upgrades ?? [])
    .filter((u) => (clan === 'All' || u.clan === clan) && (view !== 'upgrades' || kind === 'all' || u.category === kind) && named(u))

  // One day: its member events, then a row for each player's upgrades, most recent first.
  const days = new Map<string, { events: LogEvent[]; groups: Map<string, Upgrade[]> }>()
  const dayOf = (at: string) => {
    const d = at.slice(0, 10)
    if (!days.has(d)) days.set(d, { events: [], groups: new Map() })
    return days.get(d)!
  }
  events.forEach((e) => dayOf(e.at).events.push(e))
  ups.forEach((u) => {
    const g = dayOf(u.at).groups
    const key = u.category === 'town_hall' ? `${u.tag}-th-${u.to}` : u.tag
    g.set(key, [...(g.get(key) ?? []), u])
  })
  const order = [...days.keys()].sort().reverse()

  const chip = (on: boolean) => `flex min-h-8 flex-none cursor-pointer items-center whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-bold ${on ? 'border-ink-2 bg-white text-ink' : 'border-transparent bg-transparent text-faint'}`
  const filters = (
    <div className={`flex flex-col gap-1 ${wide ? '' : 'px-4'}`}>
      <div role="group" aria-label="Show" className="flex gap-1">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={v.id === view} onClick={() => setView(v.id)} className={chip(v.id === view)}>{v.label}</button>)}
      </div>
      {view === 'upgrades' && (
        <div role="group" aria-label="Kind" className={`flex gap-1 overflow-x-auto [scrollbar-width:none] ${wide ? 'flex-wrap' : ''}`}>
          {KINDS.map((k) => <button key={k.id} type="button" aria-pressed={k.id === kind} onClick={() => setKind(k.id)} className={chip(k.id === kind)}>{k.label}</button>)}
        </div>
      )}
    </div>
  )
  const first = events.find((e) => here.has(e.tag))?.tag ?? ups[0]?.tag
  const enter = () => { if (first) go.to(playerHref(first)) }
  const started = data?.since && new Date(`${data.since}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  const chart = view === 'upgrades' && !!data?.upgrade_counts?.length && <UpgradeChart counts={data.upgrade_counts} clan={clan} kind={kind} />
  const feed = !data ? <Empty loading={loading} /> : !order.length
    ? <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">{nq ? 'No one by that name' : 'Nothing here yet'}</div>
    : (
      <div className="flex flex-col gap-3">
        {order.map((d) => {
          const day = days.get(d)!
          const groups = [...day.groups.entries()].sort((a, b) => b[1][0].at.localeCompare(a[1][0].at))
          return (
            <section key={d} aria-label={dayLabel(d)} className="flex flex-col gap-1.5">
              <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">{dayLabel(d)}</span>
              {!!day.events.length && (
                <ol className="m-0 grid list-none grid-cols-1 gap-1 p-0 md:grid-cols-2">
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
        {started && <span className="px-1 text-xs font-semibold text-faint">Members since {started} · upgrades from the last {data.upgrade_days} days</span>}
      </div>
    )

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <ClanFilter clan={clan} setClan={setClan} />
        <div className="w-full max-w-[400px]"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        {filters}
        <div className="flex w-full max-w-[860px] flex-col gap-3">{chart}{feed}</div>
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="px-4 pt-1"><ClanFilter clan={clan} setClan={setClan} /></div>
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      {filters}
      <div className="flex flex-col gap-3 px-4">{chart}{feed}</div>
    </div>
  )
}
