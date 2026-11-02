import { useEffect, useMemo, useState } from 'react'
import type { Me } from '../auth'
import { type DayPlans, getDays, HttpError, publishDays, saveDays } from '../data'
import { type ClanDays, DAYS, earned, enemy, locked, missedThisSeason, onTrack, slotsBelow, suggest, TARGET, TEAM, tier, type Wars } from '../dayplan'
import { CLAN } from '../theme'
import type { Player, Roster } from '../types'
import { StatusDot, Th } from './ui'

// Who plays each of the seven CWL days. Opens on the saved draft, else the published plan, else a suggestion
// from the rules in dayplan.ts. Days whose war is on or over show the game's lineup and cannot be changed.

type CwlClan = 'Fire' | 'Cake'
const CWL: CwlClan[] = ['Fire', 'Cake']
type Plans = Record<CwlClan, ClanDays>

const same = (a: Plans, b: Plans) => JSON.stringify(a) === JSON.stringify(b)
const sorted = (p: ClanDays): ClanDays => Object.fromEntries(DAYS.map((d) => [d, [...(p[d] ?? [])].sort()]))

function Cell({ plays, war, tag, ring, onToggle, label }: {
  plays: boolean; war: Wars[string] | undefined; tag: string; ring: string; onToggle?: () => void; label: string
}) {
  let dot
  if (locked(war)) {
    const inGame = war!.lineup.includes(tag)
    const missed = war!.missed.includes(tag)
    const stars = war!.stars[tag]
    dot = !inGame ? <span className="size-2 rounded-full bg-[#E2E8F0]" />
      : missed ? <span title="Missed" className="flex size-[22px] items-center justify-center rounded-full bg-[#DC2626] text-[11px] font-extrabold text-white">✕</span>
      : <span className="flex size-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: ring }}>{stars ?? ''}</span>
  } else {
    // In preparation the game's lineup is known: mark where the plan and the game differ.
    const differs = !!war && war.lineup.includes(tag) !== plays
    dot = plays
      ? <span className="size-[18px] rounded-full" style={{ background: ring, boxShadow: differs ? '0 0 0 2.5px #F59E0B' : undefined }} />
      : <span className={`size-[14px] rounded-full border-2 ${differs ? 'border-[#F59E0B] bg-[#FEF3C7]' : 'border-[#E2E8F0]'}`} />
  }
  return (
    <td className="border-b border-hair p-0 text-center">
      {onToggle ? (
        <button type="button" aria-label={label} aria-pressed={plays} onClick={onToggle}
          className="flex h-10 w-full min-w-[27px] md:min-w-[34px] cursor-pointer items-center justify-center border-0 bg-transparent hover:bg-hover">{dot}</button>
      ) : <span className="flex h-10 min-w-[27px] md:min-w-[34px] items-center justify-center">{dot}</span>}
    </td>
  )
}

export default function DayPlanner({ roster, me }: { roster: Roster; me: Me }) {
  const [server, setServer] = useState<DayPlans | null>(null)
  const [failed, setFailed] = useState(false)
  const [clan, setClan] = useState<CwlClan>('Fire')
  const [plans, setPlans] = useState<Plans | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const pools = useMemo(() => Object.fromEntries(CWL.map((c) => [c,
    roster.players.filter((p) => p.clan === c && (p.slot === 'CORE' || p.slot === 'SUB'))])) as Record<CwlClan, Player[]>, [roster])
  const wars = (c: CwlClan): Wars => server?.wars?.[c] ?? {}
  const fresh = (c: CwlClan, s: DayPlans | null) => sorted(suggest(pools[c], s?.wars?.[c] ?? {}, s?.upcoming?.[c] ?? []))
  const start = (s: DayPlans | null): Plans => {
    const from = s?.draft?.clans ?? s?.published?.clans
    return { Fire: from?.Fire ? sorted(from.Fire) : fresh('Fire', s), Cake: from?.Cake ? sorted(from.Cake) : fresh('Cake', s) }
  }

  useEffect(() => {
    getDays().then((s) => { setServer(s); setPlans(start(s)) }, () => { setFailed(true); setPlans(start(null)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools])

  // The draft on the server, as the board would show it.
  const saved = useMemo(() => (server?.draft ? start({ ...server, published: null }) : null), [server]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!plans) return <div aria-busy="true" aria-label="Loading" className="mx-auto mt-10 h-64 max-w-[760px] animate-pulse rounded-[18px] bg-well" />

  const readOnly = !me.role || me.via === 'passcode' || failed
  const canPublish = me.role === 'publisher' && !failed
  const dirty = !saved || !same(plans, saved)
  const published = server?.published && same(plans, start({ ...server, draft: null }))
  const bad = CWL.flatMap((c) => DAYS.filter((d) => (plans[c][d]?.length ?? 0) !== TEAM).map((d) => `${c} day ${d}`))

  const plan = plans[clan]
  const w = wars(clan)
  const t = CLAN[clan]
  const missed = missedThisSeason(w)
  const inGame = new Set(Object.values(w).flatMap((x) => x.lineup))
  const rows = [...pools[clan], ...roster.players.filter((p) => p.clan === clan && inGame.has(p.tag) && !pools[clan].includes(p))]
    .sort((a, b) => (a.slot === 'CORE' ? 0 : 1) - (b.slot === 'CORE' ? 0 : 1) || (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0))
  const core = rows.filter((p) => p.slot === 'CORE')

  const toggle = (tag: string, d: number) => {
    setNote(null)
    setPlans((ps) => {
      const day = ps![clan][d] ?? []
      const next = day.includes(tag) ? day.filter((x) => x !== tag) : [...day, tag].sort()
      return { ...ps!, [clan]: { ...ps![clan], [d]: next } }
    })
  }
  const send = async (fn: typeof saveDays, ok: string) => {
    setBusy(true)
    try {
      const s = await fn(server?.season ?? new Date().toISOString().slice(0, 7), plans, me.csrf)
      setServer(s)
      setNote({ ok: true, text: ok })
    } catch (e) {
      const err = e instanceof HttpError ? e : null
      setNote({ ok: false, text: err?.problems.length ? err.problems.join('. ') : 'Not saved. Try again.' })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const btn = 'min-h-10 cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white px-3 text-sm font-semibold text-ink-2 hover:bg-page disabled:cursor-default disabled:opacity-60'
  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-3 md:pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Clan" className="grid grid-cols-2 gap-1 rounded-xl bg-well p-1">
          {CWL.map((c) => {
            const short = DAYS.some((d) => (plans[c][d]?.length ?? 0) !== TEAM)
            return (
              <button key={c} type="button" aria-pressed={c === clan} onClick={() => setClan(c)}
                className={`flex min-h-[38px] min-w-[84px] cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-0 px-3 text-[15px] font-bold ${c === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
                style={c === clan ? { color: CLAN[c].deep } : undefined}>
                {c}{short && <span title="A day is not 15" className="size-2 rounded-full bg-[#DC2626]" />}
              </button>
            )
          })}
        </nav>
        <span className="flex-auto" />
        <button type="button" className={btn} onClick={() => { setNote(null); setPlans((ps) => ({ ...ps!, [clan]: fresh(clan, server) })) }}>Suggest</button>
        <button type="button" className={btn} disabled={readOnly || busy || !dirty} onClick={() => send(saveDays, 'Saved for leaders')}>
          {dirty ? 'Save' : 'Saved'}
        </button>
        {canPublish && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy || bad.length > 0 || !!published}
            title={bad.length ? `Not 15: ${bad.join(', ')}` : undefined}
            className="min-h-10 cursor-pointer rounded-[10px] border-0 bg-action px-4 text-sm font-bold text-white hover:bg-action-deep disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-faint">
            {published ? 'Published' : 'Publish'}
          </button>
        )}
        {confirming && (
          <span className="flex items-center gap-1.5">
            <button type="button" className={btn} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" autoFocus disabled={busy} onClick={() => send(publishDays, 'Published · members see their days')}
              className="min-h-10 cursor-pointer rounded-[10px] border-0 bg-action px-4 text-sm font-bold text-white hover:bg-action-deep disabled:opacity-60">Publish to members</button>
          </span>
        )}
      </div>

      {note && (
        <div role="status" className={`flex min-h-11 items-center rounded-[14px] px-4 text-sm font-bold ${note.ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>{note.text}</div>
      )}

      <div aria-label="Key" className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] font-semibold text-muted">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: t.accent }} />Plays</span>
        <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded-full text-[9px] font-extrabold text-white" style={{ background: t.accent }}>3</span>Stars</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#DC2626]" />Missed</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-[#F59E0B] bg-[#FEF3C7]" />Not as in game</span>
        <span className="flex items-center gap-1.5"><span className="rounded-full bg-[#FEF3C7] px-1 text-[11px] font-extrabold tabular-nums text-[#92400E]">−3</span>Slots under enemy TH</span>
        <span className="flex items-center gap-1.5"><span className="font-bold tabular-nums text-[#B45309]">5!</span>Can’t reach {TARGET}★</span>
      </div>

      <section className="max-h-[calc(100dvh-230px)] overflow-auto rounded-[18px] border border-line bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[3] bg-white">
            <tr>
              <th className="sticky left-0 z-[4] border-b border-line bg-white py-2 pl-3 text-left text-xs font-bold text-faint">PLAYER</th>
              {DAYS.map((d) => {
                const war = w[d]
                const n = plan[d]?.length ?? 0
                const ths = enemy(war, server?.upcoming?.[clan] ?? [])
                const drawn = !!war?.opponent_th.length
                const thOf = (tag: string) => roster.players.find((p) => p.tag === tag)?.th ?? 0
                const below = ths.length && !locked(war) ? slotsBelow((plan[d] ?? []).map(thOf), ths) : 0
                const avg = ths.length ? ths.reduce((s, x) => s + x, 0) / ths.length : null
                return (
                  <th key={d} title={drawn ? `${war?.opponent} · TH ${ths.join(' ')}` : ths.length ? `Expected: TH ${ths.map((x) => Math.round(x)).join(' ')}` : undefined}
                    className="border-b border-line px-0.5 py-1.5 text-center align-bottom">
                    <span className="flex flex-col items-center gap-0.5">
                      <span className={`flex items-center gap-1 text-xs font-extrabold ${war?.state === 'inWar' ? 'text-[#15803D]' : 'text-ink-2'}`}>
                        {war?.state === 'inWar' && <span className="ff-live size-1.5 rounded bg-[#16A34A]" />}D{d}
                      </span>
                      {avg !== null && <span className={`text-[10px] font-semibold tabular-nums text-faint ${drawn ? '' : 'italic'}`}><span className="max-md:hidden">TH</span>{avg.toFixed(1)}</span>}
                      {below > 0 && <span className="rounded-full bg-[#FEF3C7] px-1 text-[10px] font-extrabold tabular-nums text-[#92400E]">−{below}</span>}
                      {n !== TEAM && <span className="rounded-full bg-[#FEE2E2] px-1.5 text-[10px] font-extrabold tabular-nums text-[#B91C1C]">{n}</span>}
                    </span>
                  </th>
                )
              })}
              <th className="border-b border-line pr-3 text-right text-xs font-bold text-faint">★</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const got = earned(w, p.tag)
              const unreliable = tier(p, missed) === null
              const short = !unreliable && !onTrack(p.tag, plan, w)
              return (
                <tr key={p.tag} className={unreliable ? 'opacity-60' : ''}>
                  <td className={`sticky left-0 z-[1] max-w-[104px] border-b border-hair bg-white py-1 pl-2.5 pr-1 md:max-w-[170px] md:pl-3 md:pr-1.5 ${i === core.length && core.length ? 'border-t-2 border-t-line' : ''}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Th th={p.th} />
                      <span className="truncate font-semibold">{p.name}</span>
                      <StatusDot status={p.status} />
                    </span>
                  </td>
                  {DAYS.map((d) => (
                    <Cell key={d} plays={!!plan[d]?.includes(p.tag)} war={w[d]} tag={p.tag} ring={t.accent}
                      label={`${p.name}, day ${d}`} onToggle={locked(w[d]) ? undefined : () => toggle(p.tag, d)} />
                  ))}
                  <td className="border-b border-hair pr-2.5 text-right md:pr-3">
                    <span title={short ? `This plan cannot reach ${TARGET} stars` : undefined}
                      className={`text-sm font-bold tabular-nums ${got >= TARGET ? 'text-[#15803D]' : short ? 'text-[#B45309]' : 'text-muted'}`}>
                      {got}{short && '!'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      {server?.published && <span className="px-1 text-xs font-semibold text-faint">Published by {server.published.updated_by ?? 'the publisher'}</span>}
    </main>
  )
}
