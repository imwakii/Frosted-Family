import { useEffect, useState } from 'react'
import { ACTIVITY_LABEL, type Activity, ago, type Candidate, reasonLabel, useMakeRoom } from '../leaders'
import { go, playerHref } from '../route'
import type { ClanName } from '../types'
import { norm, PhoneSearch, WideHeader } from './CwlTab'
import { Empty } from './ExploreTab'
import Info from './Info'
import { ClanSwitch, GoblinNote, Th, RowChevron } from './ui'
import { YouTag } from './You'

// Who to yeet: each clan's members in the server's removal order (docs/specs/02-allocation-rules.md, "Removing members").
// It only suggests; the decision to remove anyone stays with Ka Wai in game.

function groupByActivity(players: Candidate[]) {
  const out: { activity: Activity | null; rows: { p: Candidate; n: number }[] }[] = []
  players.forEach((p, i) => {
    const a = p.activity ?? null
    if (!out.length || out[out.length - 1].activity !== a) out.push({ activity: a, rows: [] })
    out[out.length - 1].rows.push({ p, n: p.position ?? i + 1 })
  })
  return out
}

const SLOT: Record<string, string> = { CORE: 'Core', SUB: 'Sub', New: 'New', 'Sitting Out': 'Not in', OUT: 'Not in' }

/** Why this player is where they are: activity and heroes, the order the list goes by. */
function standing(p: Candidate) {
  const idle = p.days_inactive == null ? 'Activity unknown' : p.days_inactive === 0 ? 'Active today' : `Idle ${p.days_inactive}d${p.inactive_at_least ? '+' : ''}`
  return p.hero_pct != null ? `${idle} · Heroes ${Math.round(p.hero_pct)}%` : idle
}
const upgradesLine = (p: Candidate) => (p.last_upgrade ? `${p.upgrades_30d} ${p.upgrades_30d === 1 ? 'upgrade' : 'upgrades'}, last ${ago(p.last_upgrade)}` : 'No upgrades yet')

type Search = { q: string; setQ: (v: string) => void; wide: boolean; onLapsed: () => void }

function WhoCouldGo({ q, setQ, wide, onLapsed }: Search) {
  const [clan, setClan] = useState<ClanName>('Cake')
  const { data, loading, denied } = useMakeRoom(clan, true)
  useEffect(() => { if (denied) onLapsed() }, [denied, onLapsed])
  const full = data && data.members >= data.cap
  const since = data?.players.map((p) => p.tracking_since).filter((t): t is string => !!t).sort()[0]
  const nq = norm(q.trim())
  // Filtered after grouping, so each player keeps their place in the removal order.
  const groups = groupByActivity(data?.players ?? [])
    .map((g) => ({ ...g, total: g.rows.length, rows: g.rows.filter(({ p }) => !nq || norm(p.name).includes(nq) || p.tag.toLowerCase().includes(nq)) }))
    .filter((g) => g.rows.length)
  const enter = () => { const first = groups[0]?.rows[0]; if (first) go.to(playerHref(first.p.tag)) }
  const switcher = <ClanSwitch value={clan} onPick={setClan} />
  const count = data && (
    <span className="flex items-center gap-2.5">
      <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums ${full ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#EFE6D2] text-ink-2'}`}>
        {data.members}/{data.cap} members
      </span>
      <Info topic="who" />
    </span>
  )
  return (
    <div className="flex flex-col gap-3">
      {wide ? (
        <WideHeader q={q} setQ={setQ} onEnter={enter} extra={count}>{switcher}</WideHeader>
      ) : (
        <>
          <PhoneSearch q={q} setQ={setQ} onEnter={enter} className="-mx-4 -mb-1 -mt-1">{switcher}</PhoneSearch>
          {count && !nq && <div className="flex justify-end">{count}</div>}
        </>
      )}
      {denied ? null : !data ? <Empty loading={loading} /> : !data.players.length ? (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm text-faint">No one to show</div>
      ) : !groups.length ? (
        <GoblinNote box goblin="page">No one by that name in this village</GoblinNote>
      ) : (
        // The server's order is the removal order; consecutive rows share an activity heading.
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <section key={g.activity ?? 'all'} aria-label={g.activity ? ACTIVITY_LABEL[g.activity] : undefined} className="flex flex-col gap-1.5">
              {g.activity && (
                <div className="flex justify-between px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">
                  <span>{ACTIVITY_LABEL[g.activity]}</span><span>{g.total}</span>
                </div>
              )}
              <ol className="m-0 grid list-none gap-x-4 rounded-2xl border border-line bg-white py-1 lg:grid-cols-2">
                {g.rows.map(({ p, n }, i) => {
                  const others = p.reasons.filter((r) => r.code !== 'inactive_days' && r.code !== 'sitting_out').map((r) => reasonLabel(r).text)
                  return (
                    <li key={p.tag} className="min-w-0">
                      <a href={playerHref(p.tag)} className={`flex h-full min-h-[58px] items-center gap-2.5 px-3.5 py-2 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''} ${i === 1 ? 'lg:border-t-0' : ''}`}>
                        <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{n}</span>
                        <Th th={p.th} />
                        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-[15px] font-semibold"><YouTag tag={p.tag} />{p.name}</span>
                            {p.cwl_slot && <span className="flex-none text-[11px] font-bold text-faint">{SLOT[p.cwl_slot] ?? p.cwl_slot}</span>}
                          </span>
                          <span className="truncate text-[13px] leading-[1.3] text-muted">{standing(p)}</span>
                          <span className="truncate text-[13px] leading-[1.3] text-muted">{upgradesLine(p)}{others.length > 0 && <span className="font-semibold text-faint"> · {others.join(' · ')}</span>}</span>
                        </span>
                        <RowChevron />
                      </a>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
          {since && <span className="px-1 text-xs font-semibold text-faint">Tracked since {new Date(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>}
        </div>
      )}
    </div>
  )
}

export default function LeadersTools({ q, setQ, wide, onLapsed }: Search) {
  return (
    <section aria-label="Who to yeet" className={wide ? 'mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'flex flex-col gap-3 px-4 pb-6 pt-1'}>
      <WhoCouldGo q={q} setQ={setQ} wide={wide} onLapsed={onLapsed} />
    </section>
  )
}
