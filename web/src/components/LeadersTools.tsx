import { useState } from 'react'
import { loginHref } from '../auth'
import { ACTIVITY_LABEL, type Activity, ago, type Candidate, heroChip, type Inactive, reasonLabel, useInactivity, useMakeRoom } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { ClanFilter, type ClanPick, Empty } from './ExploreTab'
import { ClanSwitch, Th } from './ui'

// Inactivity and Make room, below the Plan board. Open to everyone for now;
// the decision to remove anyone stays with Ka Wai in game.

function inactiveTone(d: number | null) {
  if (d === null) return null
  if (d >= 14) return { bg: '#E2E8F0', fg: '#334155' }
  if (d >= 7) return { bg: '#FEF3C7', fg: '#92400E' }
  return null
}

function DaysChip({ p }: { p: Inactive }) {
  if (p.days_inactive === null) return <span className="text-[#CBD5E1]">—</span>
  const t = inactiveTone(p.days_inactive)
  const text = `${p.days_inactive}d${p.inactive_at_least ? '+' : ''}`
  return t
    ? <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" style={{ background: t.bg, color: t.fg }}>{text}</span>
    : <span className="font-semibold tabular-nums text-ink-2">{text}</span>
}

function Inactivity({ wide }: { wide: boolean }) {
  const { data, loading, denied } = useInactivity(true)
  const [clan, setClan] = useState<ClanPick>('All')
  const rows = (data?.players ?? [])
    .filter((p) => clan === 'All' || p.clan === clan)
    .sort((a, b) => (b.days_inactive ?? -1) - (a.days_inactive ?? -1) || a.name.localeCompare(b.name))
  return (
    <div className="flex flex-col gap-3">
      <ClanFilter clan={clan} setClan={setClan} />
      {denied ? <SignIn /> : !data ? <Empty loading={loading} /> : wide ? (
        <section className="overflow-auto rounded-[18px] border border-line bg-white">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-faint">
                <th className="border-b border-line py-2.5 pl-4 pr-2 font-bold">PLAYER</th>
                <th className="border-b border-line px-4 text-right font-bold">Inactive</th>
                <th className="border-b border-line px-4 text-right font-bold">Last war attack</th>
                <th className="border-b border-line px-4 text-right font-bold">Donations</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.tag} onClick={() => go.to(playerHref(p.tag))} className="cursor-pointer hover:bg-hover">
                  <td className="whitespace-nowrap border-b border-hair py-1.5 pl-4 pr-2">
                    <span className="flex items-center gap-2.5">
                      <Th th={p.th} />
                      <span className="font-semibold">{p.name}</span>
                      {clan === 'All' && <span className="text-xs font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>}
                    </span>
                  </td>
                  <td className="border-b border-hair px-4 text-right"><DaysChip p={p} /></td>
                  <td className="border-b border-hair px-4 text-right font-semibold tabular-nums text-ink-2">{ago(p.last_war_attack) ?? <span className="text-[#CBD5E1]">—</span>}</td>
                  <td className="border-b border-hair px-4 text-right font-semibold tabular-nums text-ink-2">{p.donations ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
          {rows.map((p, i) => (
            <li key={p.tag}>
              <a href={playerHref(p.tag)} className={`flex min-h-[56px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <Th th={p.th} />
                <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="truncate text-xs text-faint">
                    {clan === 'All' && <span className="font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan} · </span>}
                    War {ago(p.last_war_attack) ?? '—'} · Donated {p.donations ?? '—'}
                  </span>
                </span>
                <DaysChip p={p} />
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const TONE = {
  amber: { background: '#FEF3C7', color: '#92400E' },
  grey: { background: '#E2E8F0', color: '#334155' },
  plain: { background: '#F1F5F9', color: '#0F172A' },
}

function groupByActivity(players: Candidate[]) {
  const out: { activity: Activity | null; rows: { p: Candidate; n: number }[] }[] = []
  players.forEach((p, i) => {
    const a = p.activity ?? null
    if (!out.length || out[out.length - 1].activity !== a) out.push({ activity: a, rows: [] })
    out[out.length - 1].rows.push({ p, n: p.position ?? i + 1 })
  })
  return out
}

const SLOT: Record<string, string> = { CORE: 'Core', SUB: 'Sub', 'Sitting Out': 'Not in', OUT: 'Not in' }

function MakeRoom() {
  const [clan, setClan] = useState<ClanName>('Cake')
  const { data, loading, denied } = useMakeRoom(clan, true)
  const full = data && data.members >= data.cap
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClanSwitch value={clan} onPick={setClan} />
        {data && (
          <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums ${full ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#EEF1F6] text-ink-2'}`}>
            {data.members}/{data.cap} members
          </span>
        )}
      </div>
      {denied ? <SignIn /> : !data ? <Empty loading={loading} /> : !data.players.length ? (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm text-faint">No candidates</div>
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
                  const lead = heroChip(p)
                  return (
                    <li key={p.tag}>
                      <a href={playerHref(p.tag)} className={`flex min-h-[58px] items-center gap-2.5 px-3.5 py-2 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                        <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{n}</span>
                        <Th th={p.th} />
                        <span className="flex min-w-0 flex-auto flex-col gap-1">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-[15px] font-semibold">{p.name}</span>
                            {p.cwl_slot && <span className="flex-none text-[11px] font-bold text-faint">{SLOT[p.cwl_slot] ?? p.cwl_slot}</span>}
                          </span>
                          <span className="flex flex-wrap items-center gap-1">
                            {lead && (
                              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" title={p.cohort_n ? `${p.cohort_n} in the comparison` : undefined}
                                style={TONE[lead.tone]}>
                                {lead.text}
                              </span>
                            )}
                            {p.reasons.map((r) => {
                              const l = reasonLabel(r)
                              return (
                                <span key={r.code} className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={TONE[l.tone]}>
                                  {l.text}
                                </span>
                              )
                            })}
                          </span>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
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
      <a href={loginHref()} className="flex min-h-11 items-center rounded-xl bg-[#5865F2] px-5 text-sm font-bold text-white no-underline hover:bg-[#4752C4]">Sign in with Discord</a>
    </div>
  )
}

export default function LeadersTools({ wide }: { wide: boolean }) {
  const [view, setView] = useState<'inactivity' | 'room'>('inactivity')
  return (
    <section aria-label="Members" className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div role="group" aria-label="Members" className="inline-grid w-max auto-cols-max grid-flow-col gap-1 rounded-xl bg-well p-1">
        {([['inactivity', 'Inactivity'], ['room', 'Make room']] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={k === view} onClick={() => setView(k)}
            className={`min-h-10 cursor-pointer rounded-[9px] border-0 px-4 text-sm font-bold ${k === view ? 'bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className={wide ? 'max-w-[900px]' : ''}>{view === 'inactivity' ? <Inactivity wide={wide} /> : <MakeRoom />}</div>
    </section>
  )
}
