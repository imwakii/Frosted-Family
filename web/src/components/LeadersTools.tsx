import { useState } from 'react'
import { submitPasscode, type Me } from '../auth'
import { useClans } from '../clash'
import { ago, type Inactive, reasonLabel, useInactivity, useMakeRoom } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { ClanFilter, type ClanPick, Empty } from './ExploreTab'
import { ClanBadge, Th } from './ui'

// Leaders only. Nothing is requested, and no names are shown, until the
// session has a leader role (passcode or Discord).

function PasscodeCard({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'wrong' | 'locked'>('idle')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || state === 'busy') return
    setState('busy')
    const r = await submitPasscode(code.trim())
    if (r === 'ok') { setCode(''); setState('idle'); onUnlocked() } else setState(r === 'busy' ? 'locked' : 'wrong')
  }
  return (
    <main className="mx-auto flex max-w-[1360px] justify-center px-4 pt-10">
      <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col items-center gap-3 rounded-[20px] border border-line bg-white px-6 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#EEF1F6] text-ink-2">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <h2 className="font-display m-0 text-[24px] text-brand">Leaders only</h2>
        <label htmlFor="leaders-code" className="sr-only">Leaders' code</label>
        <input id="leaders-code" type="password" autoComplete="current-password" placeholder="Enter leaders' code" value={code}
          onChange={(e) => { setCode(e.target.value); if (state !== 'busy') setState('idle') }}
          className="h-12 w-full rounded-[12px] border border-line bg-white px-3.5 text-center text-base text-ink placeholder:text-faint" />
        {(state === 'wrong' || state === 'locked') && (
          <span role="status" className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[13px] font-bold text-[#92400E]">
            {state === 'wrong' ? 'Wrong code' : 'Too many tries. Try again later.'}
          </span>
        )}
        <button type="submit" disabled={!code.trim() || state === 'busy' || state === 'locked'}
          className="min-h-12 w-full cursor-pointer rounded-[12px] border-0 bg-action text-[15px] font-bold text-white hover:bg-action-deep disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-faint">
          Unlock
        </button>
      </form>
    </main>
  )
}

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
  const { data, loading } = useInactivity(true)
  const [clan, setClan] = useState<ClanPick>('All')
  const rows = (data?.players ?? [])
    .filter((p) => clan === 'All' || p.clan === clan)
    .sort((a, b) => (b.days_inactive ?? -1) - (a.days_inactive ?? -1) || a.name.localeCompare(b.name))
  const counts = Object.fromEntries(CLANS.map((k) => [k, (data?.players ?? []).filter((p) => p.clan === k).length]))
  return (
    <div className="flex flex-col gap-3">
      <ClanFilter clan={clan} setClan={setClan} counts={counts} wide={wide} />
      {!data ? <Empty loading={loading} /> : wide ? (
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

const SLOT: Record<string, string> = { CORE: 'Starting', SUB: 'Bench', 'Sitting Out': 'Not playing', OUT: 'Not playing' }

function MakeRoom() {
  const clans = useClans()
  const [clan, setClan] = useState<ClanName>('Cake')
  const { data, loading } = useMakeRoom(clan, true)
  const full = data && data.members >= data.cap
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Clan" className="grid grid-cols-3 gap-1 rounded-xl bg-well p-1">
          {CLANS.map((k) => (
            <button key={k} type="button" aria-pressed={k === clan} onClick={() => setClan(k)}
              className={`flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 px-3 text-sm font-bold ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
              style={k === clan ? { color: CLAN[k].deep } : undefined}>
              <ClanBadge src={clans[k]?.badge} size={20} />{k}
            </button>
          ))}
        </div>
        {data && (
          <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums ${full ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#EEF1F6] text-ink-2'}`}>
            {data.members}/{data.cap} members
          </span>
        )}
      </div>
      {!data ? <Empty loading={loading} /> : (
        <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
          {data.players.map((p, i) => (
            <li key={p.tag}>
              <a href={playerHref(p.tag)} className={`flex min-h-[58px] items-center gap-2.5 px-3.5 py-2 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{i + 1}</span>
                <Th th={p.th} />
                <span className="flex min-w-0 flex-auto flex-col gap-1">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {p.cwl_slot && <span className="flex-none text-[11px] font-bold text-faint">{SLOT[p.cwl_slot] ?? p.cwl_slot}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {p.reasons.map((r) => {
                      const l = reasonLabel(r)
                      return (
                        <span key={r.code} className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={l.tone === 'amber' ? { background: '#FEF3C7', color: '#92400E' } : { background: '#E2E8F0', color: '#334155' }}>
                          {l.text}
                        </span>
                      )
                    })}
                  </span>
                </span>
              </a>
            </li>
          ))}
          {!data.players.length && <li className="p-4 text-sm text-faint">No candidates</li>}
        </ol>
      )}
    </div>
  )
}

export default function LeadersTools({ me, wide, onUnlocked }: { me: Me; wide: boolean; onUnlocked: () => void }) {
  const [view, setView] = useState<'inactivity' | 'room'>('inactivity')
  if (!me.role) return <PasscodeCard onUnlocked={onUnlocked} />
  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-3">
      <div role="group" aria-label="Leaders' tools" className="inline-grid w-max auto-cols-max grid-flow-col gap-1 rounded-xl bg-well p-1">
        {([['inactivity', 'Inactivity'], ['room', 'Make room']] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={k === view} onClick={() => setView(k)}
            className={`min-h-10 cursor-pointer rounded-[9px] border-0 px-4 text-sm font-bold ${k === view ? 'bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className={wide ? 'max-w-[900px]' : ''}>{view === 'inactivity' ? <Inactivity wide={wide} /> : <MakeRoom />}</div>
    </main>
  )
}
