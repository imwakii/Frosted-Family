import { useMemo, useState } from 'react'
import { thIcon } from '../clash'
import { ago, type Upgrade, type UpgradeCategory, useUpgrades } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { norm, SearchBox } from './CwlTab'
import { Th, UnitIcon } from './ui'

const KINDS: { id: UpgradeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hero', label: 'Heroes' }, { id: 'equipment', label: 'Equipment' }, { id: 'troop', label: 'Troops' },
  { id: 'spell', label: 'Spells' }, { id: 'pet', label: 'Pets' }, { id: 'siege', label: 'Sieges' }, { id: 'town_hall', label: 'Town hall' },
]

const DAYS = 7

function dayLabel(iso: string, now = new Date()) {
  // Days are UTC days, matching every other time on the site.
  const d = new Date(iso)
  const key = (x: Date) => x.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (key(d) === key(now)) return 'Today (UTC)'
  if (key(d) === key(yesterday)) return 'Yesterday (UTC)'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function UpgradeIcon({ u }: { u: Upgrade }) {
  if (u.category === 'town_hall') {
    const img = thIcon(u.to)
    return img ? <img src={img} alt="" width={40} height={40} className="size-10 flex-none object-contain" /> : <Th th={u.to} />
  }
  return <span className="flex size-10 flex-none items-center justify-center"><UnitIcon name={u.unit} size={40} /></span>
}

export default function UpgradesBoard({ q, setQ, wide }: { q: string; setQ: (v: string) => void; wide: boolean }) {
  const { data, loading } = useUpgrades(DAYS)
  const [clan, setClan] = useClanPick()
  const [kind, setKind] = useState<UpgradeCategory | 'all'>('all')
  const nq = norm(q.trim())

  const all = useMemo(() => data?.upgrades ?? [], [data])
  const counts = Object.fromEntries(CLANS.map((k) => [k, all.filter((u) => u.clan === k).length]))
  const shown = all.filter((u) => (clan === 'All' || u.clan === clan) && (kind === 'all' || u.category === kind) && (!nq || norm(u.name).includes(nq) || u.tag.toLowerCase().includes(nq)))
  const days = useMemo(() => {
    const out: { label: string; rows: Upgrade[] }[] = []
    for (const u of shown) {
      const label = dayLabel(u.at)
      if (out[out.length - 1]?.label !== label) out.push({ label, rows: [] })
      out[out.length - 1].rows.push(u)
    }
    return out
  }, [shown])

  const kinds = (
    <div role="group" aria-label="Kind" className={`flex gap-1 overflow-x-auto [scrollbar-width:none] ${wide ? 'flex-wrap' : '-mb-1 px-4'}`}>
      {KINDS.map((k) => (
        <button key={k.id} type="button" aria-pressed={k.id === kind} onClick={() => setKind(k.id)}
          className={`flex min-h-8 flex-none cursor-pointer items-center whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-bold ${k.id === kind ? 'border-ink-2 bg-white text-ink' : 'border-transparent bg-transparent text-faint'}`}>
          {k.label}
        </button>
      ))}
    </div>
  )
  const enter = () => { if (shown[0]) go.to(playerHref(shown[0].tag)) }

  const feed = !data ? <Empty loading={loading} /> : !shown.length
    ? <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">{nq ? 'No one by that name' : 'No upgrades'}</div>
    : (
      <div className="flex flex-col gap-3">
        {days.map((d) => (
          <section key={d.label} aria-label={d.label} className="flex flex-col gap-1.5">
            <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">{d.label}</span>
            <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
              {d.rows.map((u, i) => (
                <li key={`${u.tag}-${u.unit}-${u.to}-${u.at}`}>
                  <a href={playerHref(u.tag)} className={`flex min-h-[58px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                    <UpgradeIcon u={u} />
                    <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{u.name}</span>
                        {u.th && u.category !== 'town_hall' && <span className="flex-none text-[11px] font-bold text-faint">TH{u.th}</span>}
                        {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[u.clan].deep }}>{u.clan}</span>}
                      </span>
                      <span className="truncate text-[13px] text-muted">
                        {u.category === 'town_hall' ? 'Town Hall' : u.unit}{' '}
                        {u.change === 'unlock' ? <b className="font-bold text-ink">unlocked</b> : <>{u.from} → <b className="font-bold text-ink">{u.to}</b></>}
                      </span>
                    </span>
                    <span className="flex-none whitespace-nowrap text-xs font-semibold text-faint">{ago(u.at)}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    )

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <ClanFilter clan={clan} setClan={setClan} counts={counts} wide />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {kinds}
          <div className="ml-auto min-w-[200px] max-w-[320px] flex-auto"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        </div>
        <div className="w-full max-w-[860px]">{feed}</div>
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      <div className="px-4"><ClanFilter clan={clan} setClan={setClan} counts={counts} wide={false} /></div>
      {kinds}
      <div className="px-4">{feed}</div>
    </div>
  )
}
