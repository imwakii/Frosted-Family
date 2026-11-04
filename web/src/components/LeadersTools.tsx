import { useState } from 'react'
import { loginHref } from '../auth'
import { ACTIVITY_LABEL, type Activity, ago, type Candidate, reasonLabel, useMakeRoom } from '../leaders'
import { playerHref } from '../route'
import type { ClanName } from '../types'
import { Empty } from './ExploreTab'
import Info from './Info'
import { ClanSwitch, Th, RowChevron } from './ui'
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

function WhoCouldGo() {
  const [clan, setClan] = useState<ClanName>('Cake')
  const { data, loading, denied } = useMakeRoom(clan, true)
  const full = data && data.members >= data.cap
  const since = data?.players.map((p) => p.tracking_since).filter((t): t is string => !!t).sort()[0]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClanSwitch value={clan} onPick={setClan} />
        {data && (
          <span className="flex items-center gap-2.5">
            <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums ${full ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#EFE6D2] text-ink-2'}`}>
              {data.members}/{data.cap} members
            </span>
            <Info topic="who" />
          </span>
        )}
      </div>
      {denied ? <SignIn /> : !data ? <Empty loading={loading} /> : !data.players.length ? (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm text-faint">No one to show</div>
      ) : (
        // The server's order is the removal order; consecutive rows share an activity heading.
        <div className="flex flex-col gap-3">
          {groupByActivity(data.players).map((g) => (
            <section key={g.activity ?? 'all'} aria-label={g.activity ? ACTIVITY_LABEL[g.activity] : undefined} className="flex flex-col gap-1.5">
              {g.activity && (
                <div className="flex justify-between px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">
                  <span>{ACTIVITY_LABEL[g.activity]}</span><span>{g.rows.length}</span>
                </div>
              )}
              <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
                {g.rows.map(({ p, n }, i) => {
                  const others = p.reasons.filter((r) => r.code !== 'inactive_days' && r.code !== 'sitting_out').map((r) => reasonLabel(r).text)
                  return (
                    <li key={p.tag}>
                      <a href={playerHref(p.tag)} className={`flex min-h-[58px] items-center gap-2.5 px-3.5 py-2 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
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

// The server refused: leader tools are locked and this browser is not signed in as a leader.
function SignIn() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white px-6 py-12 text-center">
      <span className="text-sm font-semibold text-muted">Leaders only</span>
      <a href={loginHref()} className="flex min-h-11 items-center rounded-full bg-[#5865F2] px-4 text-sm font-bold text-white no-underline hover:bg-[#4752C4]">Sign in with Discord</a>
    </div>
  )
}

export default function LeadersTools({ wide }: { wide: boolean }) {
  return (
    <section aria-label="Who to yeet" className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div className={wide ? 'max-w-[900px]' : ''}><WhoCouldGo /></div>
    </section>
  )
}
