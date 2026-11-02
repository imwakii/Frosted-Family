import { useEffect, useMemo, useState } from 'react'
import type { Me } from '../auth'
import { type DayBody, type DayPlans, getDays, getProposals, HttpError, type Proposal, publishDays, saveProposal, useWar, useWide, withdrawProposal } from '../data'
import { type ClanDays, DAYS, earned, enemy, locked, missedThisSeason, onTrack, onTrial, slotsBelow, suggest, TARGET, TEAM, tier, type Wars } from '../dayplan'
import { CLAN } from '../theme'
import type { Player, Roster, Slot } from '../types'
import CwlTab from './CwlTab'
import { ProposalBar, useProposals } from './Proposals'
import { ClanSwitch, KEY_ROW, StatusDot, Th } from './ui'

// Who plays each of the seven CWL days. Opens on your own proposal, else the published plan, else a suggestion
// from the rules in dayplan.ts. Days whose war is on or over show the game's lineup and cannot be changed.

type CwlClan = 'Fire' | 'Cake'
const CWL: CwlClan[] = ['Fire', 'Cake']
type Plans = Record<CwlClan, ClanDays>
const ORDER: Record<Slot, number> = { CORE: 0, SUB: 1, NEW: 2, OUT: 3 }

const same = (a: Plans, b: Plans) => JSON.stringify(a) === JSON.stringify(b)
const sorted = (p: ClanDays): ClanDays => Object.fromEntries(DAYS.map((d) => [d, [...(p[d] ?? [])].sort()]))

function Cell({ plays, war, tag, ring, onToggle, label, changed }: {
  plays: boolean; war: Wars[string] | undefined; tag: string; ring: string; onToggle?: () => void; label: string; changed: boolean
}) {
  let dot
  if (locked(war)) {
    const inGame = war!.lineup.includes(tag)
    const missed = war!.missed.includes(tag)
    const stars = war!.stars[tag]
    dot = !inGame ? <span className="size-2 rounded-full bg-[#E3D8BF]" />
      : missed ? <span title="Missed" className="flex size-[22px] items-center justify-center rounded-full bg-[#DC2626] text-[11px] font-extrabold text-white">✕</span>
      : <span className="flex size-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: ring }}>{stars ?? ''}</span>
  } else {
    // In preparation the game's lineup is known: mark where the plan and the game differ.
    const differs = !!war && war.lineup.includes(tag) !== plays
    dot = plays
      ? <span className="size-[18px] rounded-full" style={{ background: ring, boxShadow: differs ? '0 0 0 2.5px #F59E0B' : undefined }} />
      : <span className={`size-[14px] rounded-full border-2 ${differs ? 'border-[#F59E0B] bg-[#FEF3C7]' : 'border-[#E3D8BF]'}`} />
  }
  return (
    <td className={`border-b border-hair p-0 text-center ${changed ? 'bg-moved' : ''}`}>
      {onToggle ? (
        <button type="button" aria-label={label} aria-pressed={plays} onClick={onToggle}
          className="flex h-10 w-full min-w-6 md:min-w-[34px] cursor-pointer items-center justify-center border-0 bg-transparent hover:bg-hover">{dot}</button>
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
  const [preview, setPreview] = useState(false)
  const [q, setQ] = useState('')
  const war = useWar()
  const wide = useWide()
  const proposals = useProposals<DayBody>('days')
  const [viewId, setViewId] = useState<number | null>(null)
  const viewing = proposals.open.find((p) => p.id === viewId) ?? null

  const pools = useMemo(() => Object.fromEntries(CWL.map((c) => [c,
    roster.players.filter((p) => p.clan === c && p.slot !== 'OUT')])) as Record<CwlClan, Player[]>, [roster])
  const wars = (c: CwlClan): Wars => server?.wars?.[c] ?? {}
  const fresh = (c: CwlClan, s: DayPlans | null) => sorted(suggest(pools[c], s?.wars?.[c] ?? {}, s?.upcoming?.[c] ?? []))
  const start = (s: DayPlans | null, mine?: DayBody['clans']): Plans => {
    const from = mine ?? s?.published?.clans
    return { Fire: from?.Fire ? sorted(from.Fire) : fresh('Fire', s), Cake: from?.Cake ? sorted(from.Cake) : fresh('Cake', s) }
  }
  // A plan as the board shows it; a clan it leaves out keeps what is on the board.
  const whole = (clans: DayBody['clans'], rest: Plans): Plans => ({
    Fire: clans.Fire ? sorted(clans.Fire) : rest.Fire, Cake: clans.Cake ? sorted(clans.Cake) : rest.Cake,
  })

  useEffect(() => {
    Promise.all([getDays(), getProposals<DayBody>('days').catch(() => null)]).then(
      ([s, p]) => { setServer(s); setPlans(start(s, p?.open.find((x) => x.mine)?.body.clans)) },
      () => { setFailed(true); setPlans(start(null)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools])

  // Your own plan, or the proposal you have open.
  const shown = viewing && plans ? whole(viewing.body.clans, plans) : plans
  // Lineups as members would see it with the plan on screen; nothing is saved by looking.
  const previewRoster = useMemo<Roster>(() => ({
    ...roster,
    players: roster.players.map((p) => {
      if (p.clan === 'Flakes') return p
      const days = shown?.[p.clan as CwlClan]
      return { ...p, days: days ? DAYS.filter((d) => days[d]?.includes(p.tag)) : p.days }
    }),
  }), [roster, shown])
  if (!plans || !shown) return <div aria-busy="true" aria-label="Loading" className="mx-auto mt-10 h-64 max-w-[760px] animate-pulse rounded-2xl bg-well" />

  const readOnly = !me.role || me.via === 'passcode' || failed
  const canPublish = me.role === 'publisher' && !failed
  const live = server?.published ? whole(server.published.clans, plans) : null
  const saved = proposals.mine ? whole(proposals.mine.body.clans, plans) : null
  const dirty = saved ? !same(plans, saved) : !live || !same(plans, live)
  const published = live && same(plans, live)
  const bad = CWL.flatMap((c) => DAYS.filter((d) => (plans[c][d]?.length ?? 0) !== TEAM).map((d) => `${c} day ${d}`))
  const nameOf = (tag: string) => roster.players.find((p) => p.tag === tag)?.name ?? tag
  // What a plan changes against what is published, a day at a time. Days already fought are the game's.
  const diff = (ps: Plans) => !live ? [] : CWL.flatMap((c) => DAYS.filter((d) => !locked(wars(c)[d])).map((d) => {
    const was = live[c][d] ?? [], now = ps[c][d] ?? []
    return { c, d, added: now.filter((t) => !was.includes(t)), gone: was.filter((t) => !now.includes(t)) }
  })).filter((x) => x.added.length || x.gone.length)
  const countOf = (ps: Plans) => diff(ps).reduce((n, x) => n + Math.max(x.added.length, x.gone.length), 0)
  const lineOf = (x: ReturnType<typeof diff>[number]) => [`${x.c} day ${x.d}:`,
    ...x.added.map((t) => `+ ${nameOf(t)}`), ...x.gone.map((t) => `− ${nameOf(t)}`)].join(' ')
  const asPlans = (p: Proposal<DayBody>) => whole(p.body.clans, plans)

  const plan = shown[clan]
  const w = wars(clan)
  const t = CLAN[clan]
  const missed = missedThisSeason(w)
  const inGame = new Set(Object.values(w).flatMap((x) => x.lineup))
  const rows = [...pools[clan], ...roster.players.filter((p) => p.clan === clan && inGame.has(p.tag) && !pools[clan].includes(p))]
    .sort((a, b) => ORDER[a.slot] - ORDER[b.slot] || (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0))
  const core = rows.filter((p) => p.slot === 'CORE')

  const toggle = (tag: string, d: number) => {
    setNote(null)
    setPlans((ps) => {
      const day = ps![clan][d] ?? []
      const next = day.includes(tag) ? day.filter((x) => x !== tag) : [...day, tag].sort()
      return { ...ps!, [clan]: { ...ps![clan], [d]: next } }
    })
  }
  const season = server?.season ?? new Date().toISOString().slice(0, 7)
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      await proposals.reload()
      setNote({ ok: true, text: ok })
    } catch (e) {
      const err = e instanceof HttpError ? e : null
      setNote({ ok: false, text: err?.problems.length ? err.problems.join('. ') : 'Not saved. Try again.' })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const Outer = preview ? 'div' : 'main'
  const propose = () => run(() => saveProposal('days', season, { clans: plans }, me.csrf), 'Proposed · other leaders can see it')
  const publish = () => run(async () => {
    setServer(await publishDays(season, plans, me.csrf))
    if (proposals.mine) await withdrawProposal(proposals.mine.id, me.csrf)
  }, 'Published · members see their days')
  const btn = 'min-h-10 cursor-pointer rounded-full border border-[#D5C8AC] bg-white px-3 text-sm font-semibold text-ink-2 hover:bg-page disabled:cursor-default disabled:opacity-60'
  return (
    <>
    <Outer className={`mx-auto flex flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pt-1 md:pt-5 max-w-[1360px] ${preview ? '' : 'pb-12'}`}>
      {!preview && <ClanSwitch<CwlClan> value={clan} onPick={setClan} options={CWL} flag={CWL.filter((c) => DAYS.some((d) => (shown[c][d]?.length ?? 0) !== TEAM))} />}
      <div className="flex items-center gap-1.5">
        <button type="button" aria-pressed={preview} className={btn} onClick={() => setPreview((v) => !v)}>{preview ? 'Grid' : 'Preview'}</button>
        <span className="flex-auto" />
        {!preview && !viewing && !confirming && <button type="button" className={btn} onClick={() => { setNote(null); setPlans((ps) => ({ ...ps!, [clan]: fresh(clan, server) })) }}>Suggest</button>}
        {!viewing && !confirming && <button type="button" className={btn} disabled={readOnly || busy || !dirty} onClick={propose}>
          {dirty || !saved ? 'Propose' : 'Proposed'}
        </button>}
        {canPublish && !confirming && !viewing && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy || bad.length > 0 || !!published}
            title={bad.length ? `Not 15: ${bad.join(', ')}` : undefined}
            className="min-h-10 cursor-pointer rounded-full border-0 bg-action px-3 text-sm font-bold text-white hover:bg-action-deep disabled:cursor-not-allowed disabled:bg-[#E3D8BF] disabled:text-faint">
            {published ? 'Published' : 'Publish'}
          </button>
        )}
        {confirming && !viewing && (
          <span className="flex items-center gap-1.5">
            <button type="button" className={btn} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" autoFocus disabled={busy} onClick={publish}
              className="min-h-10 cursor-pointer rounded-full border-0 bg-action px-4 text-sm font-bold text-white hover:bg-action-deep disabled:opacity-60">Publish to members</button>
          </span>
        )}
      </div>

      {note && (
        <div role="status" className={`flex min-h-11 items-center rounded-[14px] px-4 text-sm font-bold ${note.ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>{note.text}</div>
      )}

      <ProposalBar proposals={proposals} me={me} viewing={viewing} setViewing={setViewId} dirty={dirty} yours={countOf(plans)}
        count={(p) => countOf(asPlans(p))} lines={(p) => diff(asPlans(p)).map(lineOf)}
        onBuild={(p) => { setPlans(asPlans(p)); setNote({ ok: true, text: `Your copy of ${p.author}'s proposal` }) }}
        onAccepted={(p) => { getDays().then(setServer); if (!dirty) setPlans(asPlans(p)); setNote({ ok: true, text: `Accepted ${p.author}'s proposal · members see it` }) }} />

      {!preview && <>
      <div aria-label="Key" className={KEY_ROW}>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#DC2626]" />Missed</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-[#F59E0B] bg-[#FEF3C7]" />Differs</span>
        <span className="flex items-center gap-1"><span className="rounded-full bg-[#FEF3C7] px-1 text-[11px] font-extrabold tabular-nums text-[#92400E]">−3</span>Under TH</span>
        <span className="flex items-center gap-1"><span className="font-bold tabular-nums text-[#B45309]">5!</span>Under {TARGET}★</span>
        {live && <span className="flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-[3px] bg-moved" />Changed</span>}
      </div>

      <section className="max-h-[calc(100dvh-230px)] w-full max-w-[900px] overflow-auto rounded-2xl border border-line bg-white">
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
              const unreliable = tier(p, missed, w) === null
              const short = !unreliable && !onTrial(p, w) && !onTrack(p.tag, plan, w)
              return (
                <tr key={p.tag} className={unreliable ? 'opacity-60' : ''}>
                  <td className={`sticky left-0 z-[1] max-w-[153px] border-b border-hair bg-white py-1 pl-2.5 pr-1 md:max-w-[170px] md:pl-3 md:pr-1.5 ${i === core.length && core.length ? 'border-t-2 border-t-line' : ''}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      {/* On a phone the status sits on the town hall, so the name keeps the room. */}
                      <span className="relative flex-none">
                        <Th th={p.th} />
                        <span className="absolute bottom-0 right-0 flex rounded-full bg-white p-px md:hidden"><StatusDot status={p.status} /></span>
                      </span>
                      <span className="truncate font-semibold max-md:text-[13px]">{p.name}</span>
                      <span className="flex max-md:hidden"><StatusDot status={p.status} /></span>
                    </span>
                  </td>
                  {DAYS.map((d) => (
                    <Cell key={d} plays={!!plan[d]?.includes(p.tag)} war={w[d]} tag={p.tag} ring={t.accent}
                      label={`${p.name}, day ${d}`} onToggle={locked(w[d]) || viewing ? undefined : () => toggle(p.tag, d)}
                      changed={!!live && !locked(w[d]) && !!live[clan][d]?.includes(p.tag) !== !!plan[d]?.includes(p.tag)} />
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
      </>}
    </Outer>
    {/* Row links would leave the planner, so a preview keeps its rows in place. */}
    {preview && (
      <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault() }}>
        <CwlTab roster={previewRoster} war={war} wide={wide} q={q} setQ={setQ} lock={{ clan, options: CWL, onPick: (c) => setClan(c as CwlClan) }} />
      </div>
    )}
    </>
  )
}
