import { useMemo, useState } from 'react'
import { thIcon } from '../clash'
import { ago, type LogEvent, type Upgrade, type UpgradeCategory, useClanLog } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN } from '../theme'
import type { Roster } from '../types'
import { norm, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { Th, UnitIcon, RowChevron } from './ui'
import { YouTag } from './You'

// GET /api/log: what has happened in the family, newest day first. Each day opens with who came, went or changed role,
// so a busy day of upgrades does not bury them; a player's upgrades that day share one row, a new town hall has its own.

type View = 'all' | 'members' | 'upgrades'
const VIEWS: { id: View; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'members', label: 'Members' }, { id: 'upgrades', label: 'Upgrades' }]
const KINDS: { id: UpgradeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hero', label: 'Heroes' }, { id: 'equipment', label: 'Equipment' }, { id: 'troop', label: 'Troops' },
  { id: 'spell', label: 'Spells' }, { id: 'pet', label: 'Pets' }, { id: 'siege', label: 'Sieges' }, { id: 'town_hall', label: 'Town hall' },
]
const ROLE: Record<string, string> = { member: 'Member', admin: 'Elder', coLeader: 'Co-leader', leader: 'Leader' }
const MARK: Record<LogEvent['kind'], { glyph: string; bg: string; fg: string }> = {
  joined: { glyph: '+', bg: '#DCFCE7', fg: '#166534' },
  rejoined: { glyph: '↺', bg: '#DCFCE7', fg: '#166534' },
  visited: { glyph: '↔', bg: '#F1F5F9', fg: '#64748B' },
  left: { glyph: '−', bg: '#FEE2E2', fg: '#B91C1C' },
  moved: { glyph: '→', bg: '#DBEAFE', fg: '#1D4ED8' },
  promoted: { glyph: '▲', bg: '#FEF3C7', fg: '#92400E' },
  demoted: { glyph: '▼', bg: '#F1F5F9', fg: '#64748B' },
}

function says(e: LogEvent) {
  const role = ROLE[e.role ?? ''] ?? e.role
  switch (e.kind) {
    case 'joined': return `Joined ${e.clan}`
    case 'rejoined': return `Rejoined ${e.clan}`
    case 'visited': return `Joined and left ${e.clan}`
    case 'left': return `Left ${e.clan}`
    case 'moved': return `Moved ${e.from_clan} → ${e.clan}`
    case 'promoted': return `Promoted to ${role} in ${e.clan}`
    case 'demoted': return `Demoted to ${role} in ${e.clan}`
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
  const body = (
    <>
      <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-full text-lg font-extrabold leading-none" style={{ background: m.bg, color: m.fg }}>{m.glyph}</span>
      <span className="flex min-w-0 flex-auto flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold"><YouTag tag={e.tag} />{e.name}</span>
        <span className="truncate text-[13px] text-muted">{says(e)}</span>
      </span>
      {!e.approx && <span className="flex-none whitespace-nowrap text-xs font-semibold text-faint">{ago(e.at)}</span>}
    </>
  )
  // Someone who has gone has no card to open.
  return onRoster
    ? <a href={playerHref(e.tag)} className={`${ROW} hover:bg-hover`}>{body}<RowChevron /></a>
    : <div className={ROW}>{body}</div>
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
              <ol className="m-0 list-none divide-y divide-hair rounded-2xl border border-line bg-white py-1">
                {day.events.map((e) => <li key={`${e.kind}-${e.tag}-${e.at}`}><EventRow e={e} onRoster={here.has(e.tag)} /></li>)}
                {groups.map(([key, rows]) => {
                  const id = `${d}-${key}`
                  return <li key={id}><UpgradeRow ups={rows} showClan={clan === 'All'} open={open === id} onToggle={() => setOpen((o) => (o === id ? null : id))} /></li>
                })}
              </ol>
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
        <div className="w-full max-w-[860px]">{feed}</div>
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="px-4 pt-1"><ClanFilter clan={clan} setClan={setClan} /></div>
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      {filters}
      <div className="px-4">{feed}</div>
    </div>
  )
}
