import { useEffect, useMemo, useState } from 'react'
import type { Me } from '../auth'
import { checkPlan, type DayBody, type DayPlans, getDays, getProposals, HttpError, type LineupBody, type PlanMove, type Proposal, publishDays, publishPlan, saveProposal, useWar, useWide, withdrawProposal } from '../data'
import { type ClanDays, DAYS, DRAFT_KEY, earned, enemy, locked, missedThisSeason, onTrack, onTrial, repair, slotsBelow, suggest, TARGET, TEAM, tier, type Wars, asPlanned } from '../dayplan'
import { CLAN, CLANS } from '../theme'
import type { ClanName, Player, Roster, Slot } from '../types'
import ClanCompare from './ClanCompare'
import CwlTab from './CwlTab'
import PlanActivity from './PlanActivity'
import { lineupBoard, type Moves, type Place, PlaceSelect, placeLabel, PlanRow, readDraft, toList } from './PlanTab'
import { ProposalBar, useProposals } from './Proposals'
import { Arrow, ClanSwitch, KEY_ROW, StatusDot, Th } from './ui'

// Plan: who is where, and who plays each of the seven CWL days, on one page. Opens on your own proposal, else the published
// plan, else a suggestion from the rules in dayplan.ts. A player's place changes from their row; Publish sends places, then days.
// Days whose war is on or over show the game's lineup, and where it differed from the plan, and cannot be changed.
// Someone in New who is given a day moves to Sub, and back if a tap takes the day away again.

type CwlClan = 'Fire' | 'Cake'
const CWL: CwlClan[] = ['Fire', 'Cake']
type Plans = Record<CwlClan, ClanDays>
const ORDER: Record<Slot, number> = { CORE: 0, SUB: 1, NEW: 2, OUT: 3 }

const sorted = (p: ClanDays): ClanDays => Object.fromEntries(DAYS.map((d) => [d, [...(p[d] ?? [])].sort()]))

// Hatched, because the Changed tint is a plain wash of a similar colour.
const LOCKED = { background: 'repeating-linear-gradient(135deg, #F3EDE0 0 4px, #E8E0CF 4px 8px)' }

function Lock() {
  return (
    <svg aria-hidden="true" width="10" height="11" viewBox="0 0 10 11" fill="currentColor" className="flex-none">
      <path d="M2.5 4.5V3a2.5 2.5 0 0 1 5 0v1.5h.5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h.5Zm1.2 0h2.6V3a1.3 1.3 0 0 0-2.6 0v1.5Z" />
    </svg>
  )
}

function Cell({ plays, war, tag, ring, onToggle, label, changed, first }: {
  plays: boolean; war: Wars[string] | undefined; tag: string; ring: string; onToggle?: () => void; label: string; changed: boolean; first: boolean
}) {
  let dot
  const fixed = locked(war)
  if (fixed) {
    const inGame = war!.lineup.includes(tag)
    const missed = war!.missed.includes(tag)
    const stars = war!.stars[tag]
    const differs = inGame !== plays
    dot = !inGame ? <span title={differs ? 'Planned, did not play' : undefined} className={differs ? 'size-[14px] rounded-full border-2 border-[#F59E0B] bg-[#FEF3C7]' : 'size-2 rounded-full bg-[#E3D8BF]'} />
      : missed ? <span title="Missed" className="flex size-[22px] items-center justify-center rounded-full bg-[#DC2626] text-[11px] font-extrabold text-white">✕</span>
      : <span title={differs ? 'Played, not planned' : undefined} className="flex size-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: ring, boxShadow: differs ? '0 0 0 2.5px #F59E0B' : undefined }}>{stars ?? ''}</span>
  } else {
    // In preparation the game's lineup is known: mark where the plan and the game differ.
    const differs = !!war && war.lineup.includes(tag) !== plays
    dot = plays
      ? <span className="size-[18px] rounded-full" style={{ background: ring, boxShadow: differs ? '0 0 0 2.5px #F59E0B' : undefined }} />
      : <span className={`size-[14px] rounded-full border-2 ${differs ? 'border-[#F59E0B] bg-[#FEF3C7]' : 'border-[#E3D8BF]'}`} />
  }
  return (
    <td style={fixed ? LOCKED : undefined} className={`border-b border-hair p-0 text-center ${changed ? 'bg-moved' : ''} ${first ? 'border-l-2 border-l-line' : ''}`}>
      {onToggle ? (
        <button type="button" aria-label={label} aria-pressed={plays} onClick={onToggle}
          className="flex h-10 w-full min-w-6 md:min-w-[34px] cursor-pointer items-center justify-center border-0 bg-transparent hover:bg-hover">{dot}</button>
      ) : <span className="flex h-10 min-w-[27px] md:min-w-[34px] items-center justify-center">{dot}</span>}
    </td>
  )
}

export default function DayPlanner({ roster: base, me, onPublished }: { roster: Roster; me: Me; onPublished: () => Promise<void> }) {
  const [moves, setMoves] = useState<Moves>(() => readDraft(base))
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(moves)) } catch { /* private mode */ } }, [moves])
  const roster = useMemo<Roster>(() => ({ ...base, players: base.players.map((p) => asPlanned(moves[p.tag] ? { ...p, ...moves[p.tag] } : p)) }), [base, moves])
  const baseOf = useMemo(() => new Map(base.players.map((p) => [p.tag, p])), [base])
  const lineup = useProposals<LineupBody>('lineup')
  const [lineupViewId, setLineupViewId] = useState<number | null>(null)
  const lineupViewing = lineup.open.find((p) => p.id === lineupViewId) ?? null
  const [view, setView] = useState<ClanName>('Fire')
  const [override, setOverride] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [server, setServer] = useState<DayPlans | null>(null)
  const [failed, setFailed] = useState(false)
  const clan: CwlClan = view === 'Flakes' ? 'Fire' : view
  const setClan = setView
  const [plans, setPlans] = useState<Plans | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string; lines?: string[]; undo?: Plans; rebuild?: boolean } | null>(null)
  const [preview, setPreview] = useState(false)
  const [q, setQ] = useState('')
  // A history entry of its own, so the phone's back button closes it and keeps the plan on screen.
  const [comparing, setComparing] = useState(false)
  useEffect(() => {
    const on = () => setComparing(false)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  const war = useWar()
  const wide = useWide()
  const proposals = useProposals<DayBody>('days')
  const [viewId, setViewId] = useState<number | null>(null)
  const viewing = proposals.open.find((p) => p.id === viewId) ?? null

  const pools = useMemo(() => Object.fromEntries(CWL.map((c) => [c,
    roster.players.filter((p) => p.clan === c && p.slot !== 'OUT')])) as Record<CwlClan, Player[]>, [roster])
  const wars = (c: CwlClan): Wars => server?.wars?.[c] ?? {}
  // Someone in New the plan gives days to, as a move to Sub.
  const promoted = (ps: Plans, s: DayPlans | null): Moves => {
    const planned = new Set(CWL.flatMap((c) => DAYS.filter((d) => !locked(s?.wars?.[c]?.[d])).flatMap((d) => ps[c][d] ?? [])))
    return Object.fromEntries(base.players.filter((x) => x.slot === 'NEW' && planned.has(x.tag)).map((x) => [x.tag, { clan: x.clan, slot: 'SUB' as Slot }]))
  }
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
      ([s, p]) => {
        const ps = start(s, p?.open.find((x) => x.mine)?.body.clans)
        setServer(s)
        setPlans(ps)
        setMoves((m) => ({ ...promoted(ps, s), ...m }))  // a plan that already gives days to someone in New
      },
      () => { setFailed(true); setPlans(start(null)) })
    // Only when the published roster changes: moving a player must not throw away the days on the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

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
  // Days already begun are the game's, so nothing about them can be unsaved or out of order.
  const open = (ps: Plans) => CWL.map((c) => DAYS.filter((d) => !locked(wars(c)[d])).map((d) => ps[c][d] ?? []))
  const same = (a: Plans, b: Plans) => JSON.stringify(open(a)) === JSON.stringify(open(b))
  const live = server?.published ? whole(server.published.clans, plans) : null
  const saved = proposals.mine ? whole(proposals.mine.body.clans, plans) : null
  const dirty = saved ? !same(plans, saved) : !live || !same(plans, live)
  const published = live && same(plans, live)
  const bad = CWL.flatMap((c) => DAYS.filter((d) => !locked(wars(c)[d]) && (plans[c][d]?.length ?? 0) !== TEAM).map((d) => `${c} day ${d}`))
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
  const firstOpen = DAYS.find((d) => !locked(w[d]))
  const anyLocked = firstOpen !== 1
  const anyDiffers = DAYS.some((d) => w[d] && [...w[d].lineup].sort().join() !== (plan[d] ?? []).join())
  // The day that can still change in the game: what to swap there for it to match the plan.
  const prep = DAYS.find((d) => w[d]?.state === 'preparation')
  const swapOut = prep ? w[prep].lineup.filter((t) => !plan[prep]?.includes(t)).map(nameOf) : []
  const swapIn = prep ? (plan[prep] ?? []).filter((t) => !w[prep].lineup.includes(t)).map(nameOf) : []
  const thOf = (tag: string) => roster.players.find((p) => p.tag === tag)?.th ?? 0
  const belowOn = (d: number) => {
    const ths = enemy(w[d], server?.upcoming?.[clan] ?? [])
    return ths.length && !locked(w[d]) ? slotsBelow((plan[d] ?? []).map(thOf), ths) : 0
  }
  // Days already begun stay as planned, so the board can show where the game differed.
  const offer = (next: ClanDays, rebuilt: boolean) => {
    const kept = Object.fromEntries(DAYS.map((d) => [d, locked(w[d]) ? plans[clan][d] ?? [] : next[d]]))
    const swaps = DAYS.filter((d) => !locked(w[d])).reduce((n, d) => n + Math.max(kept[d].filter((t) => !plans[clan][d]?.includes(t)).length, (plans[clan][d] ?? []).filter((t) => !kept[d].includes(t)).length), 0)
    const lines = rebuilt ? [] : DAYS.filter((d) => !locked(w[d])).flatMap((d) => {
      const added = kept[d].filter((t) => !plans[clan][d]?.includes(t)).map(nameOf), gone = (plans[clan][d] ?? []).filter((t) => !kept[d].includes(t)).map(nameOf)
      return added.length || gone.length ? [`Day ${d}: ${[added.length ? `${added.join(', ')} in` : '', gone.length ? `${gone.join(', ')} out` : ''].filter(Boolean).join(', ')}`] : []
    })
    setNote({ ok: true, text: swaps ? `${rebuilt ? 'Rebuilt' : 'Fixed'}: ${swaps} ${swaps === 1 ? 'change' : 'changes'}` : 'Nothing to fix', lines, undo: swaps ? plans : undefined, rebuild: !rebuilt })
    setPlans({ ...plans, [clan]: kept })
  }
  const t = CLAN[clan]
  const missed = missedThisSeason(w)
  const inGame = new Set(Object.values(w).flatMap((x) => x.lineup))
  const rows = [...pools[clan], ...roster.players.filter((p) => p.clan === clan && inGame.has(p.tag) && !pools[clan].includes(p))]
    .sort((a, b) => ORDER[a.slot] - ORDER[b.slot] || (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0))
  const core = rows.filter((p) => p.slot === 'CORE')

  const toggle = (tag: string, d: number) => {
    setNote((n) => (n?.undo ? n : null))
    const day = plans[clan][d] ?? []
    const next = day.includes(tag) ? day.filter((x) => x !== tag) : [...day, tag].sort()
    setPlans((ps) => ({ ...ps!, [clan]: { ...ps![clan], [d]: next } }))
    const p = baseOf.get(tag)
    if (p?.slot !== 'NEW') return
    const at = moves[tag]
    if (!day.includes(tag) && (!at || at.slot === 'NEW')) setMoves((m) => ({ ...m, [tag]: { clan: at?.clan ?? p.clan, slot: 'SUB' } }))
    const stillPlays = DAYS.some((x) => !locked(w[x]) && x !== d && plans[clan][x]?.includes(tag))
    if (day.includes(tag) && !stillPlays && at?.slot === 'SUB' && at.clan === p.clan) setMoves((m) => { const { [tag]: _, ...rest } = m; return rest })
  }
  const placeOf = (tag: string): Place => { const p = baseOf.get(tag)!; return moves[tag] ?? { clan: p.clan, slot: p.slot } }
  const place = (p: Player, v: Place) => {
    setNote((n) => (n?.undo ? n : null))
    setMoves((m) => {
      const next = { ...m }
      if (v.clan === p.clan && v.slot === p.slot) delete next[p.tag]
      else next[p.tag] = v
      return next
    })
    const was = placeOf(p.tag)
    // Out of this clan's team, or back to New by hand: their days go with them.
    if (v.slot === 'OUT' || v.slot === 'NEW' || v.clan !== was.clan) {
      setPlans((ps) => Object.fromEntries(CWL.map((c) => [c, Object.fromEntries(DAYS.map((d) => [d, locked(wars(c)[d]) ? ps![c][d] ?? [] : (ps![c][d] ?? []).filter((t) => t !== p.tag)]))])) as Plans)
    }
  }
  const { cols, checks } = lineupBoard(base, moves)
  const col = cols.find((c) => c.clan === view)!
  const changes = base.players.filter((p) => moves[p.tag])
  const auto = promoted(plans, server)
  const nMoves = changes.length
  const list = (): PlanMove[] => changes.map((p) => ({ tag: p.tag, ...moves[p.tag] }))
  const valveHit = checks.some((k) => k.key === 'valve' && k.tone === 'bad')
  const lineupBad = checks.filter((k) => (k.tone === 'bad' || k.tone === 'warn') && !(k.key === 'valve' && canPublish))
  const notIn = base.players.filter((p) => { const at = placeOf(p.tag); return at.clan === view && at.slot === 'OUT' })
  const inFlakes = base.players.filter((p) => placeOf(p.tag).clan === 'Flakes')
  const openConfirm = async () => {
    setOverride(false)
    setProblems([])
    setConfirming(true)
    if (!nMoves) return
    try {
      const r = await checkPlan(list(), valveHit, me.csrf)
      setProblems(r.problems ?? [])
    } catch (e) {
      if (e instanceof HttpError) setProblems(e.problems)
    }
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
  const propose = () => run(async () => {
    await saveProposal('days', season, { clans: plans }, me.csrf)
    if (nMoves || lineup.mine) await saveProposal('lineup', '', { moves: toList(moves) }, me.csrf)
    await lineup.reload()
  }, 'Proposed')
  // Places first, because the days build on them. If places fail nothing else goes; if days fail, the note says places went.
  const publish = () => run(async () => {
    if (nMoves) {
      await publishPlan(list(), valveHit && override, me.csrf)
      setMoves({})
      if (lineup.mine) await withdrawProposal(lineup.mine.id, me.csrf)
      await lineup.reload()
    }
    try {
      setServer(await publishDays(season, plans, me.csrf))
    } catch (e) {
      if (nMoves && e instanceof HttpError) e.problems.unshift('Places published, days not. Try again')
      throw e
    }
    if (proposals.mine) await withdrawProposal(proposals.mine.id, me.csrf)
    await onPublished()
  }, 'Published')
  const btn = 'min-h-10 cursor-pointer rounded-full border border-[#D5C8AC] bg-white px-3 text-sm font-semibold text-ink-2 hover:bg-page disabled:cursor-default disabled:opacity-60'
  return (
    <>
    <Outer className={`mx-auto flex flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pt-1 md:pt-5 max-w-[1360px] ${preview ? '' : 'pb-12'}`}>
      {!preview && <ClanSwitch<ClanName> value={view} onPick={setClan} options={CLANS} flag={CWL.filter((c) => DAYS.some((d) => !locked(wars(c)[d]) && (shown[c][d]?.length ?? 0) !== TEAM))} />}
      <div className="flex items-center gap-1.5">
        <button type="button" aria-pressed={preview} className={btn} onClick={() => setPreview((v) => !v)}>{preview ? 'Grid' : 'Preview'}</button>
        <span className="flex-auto" />
        {!preview && !viewing && view !== 'Flakes' && <button type="button" className={btn} onClick={() => offer(sorted(repair(pools[clan], w, plans[clan])), false)}>Suggest</button>}
        {!viewing && <button type="button" className={btn} disabled={readOnly || busy || (!dirty && !nMoves)} onClick={propose}>
          {dirty || nMoves || !saved ? 'Propose' : 'Proposed'}
        </button>}
        {canPublish && !viewing && (
          <button type="button" onClick={openConfirm} disabled={busy || bad.length > 0 || lineupBad.length > 0 || (!!published && !nMoves)}
            title={[...bad.map((b) => `Not 15: ${b}`), ...lineupBad.map((k) => k.label)].join(' · ') || undefined}
            className="min-h-10 cursor-pointer rounded-full border-0 bg-action px-3 text-sm font-bold text-white hover:bg-action-deep disabled:cursor-not-allowed disabled:bg-[#E3D8BF] disabled:text-faint">
            {published && !nMoves ? 'Published' : 'Publish'}
          </button>
        )}
      </div>

      {note && (
        <div role="status" className={`flex flex-col justify-center rounded-[14px] px-4 py-1 text-sm font-bold ${note.ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
          <span className="flex min-h-9 items-center justify-between gap-3">
          {note.text}
          <span className="flex gap-3">
            {note.undo && <button type="button" onClick={() => { setPlans(note.undo!); setNote(null) }} className="min-h-8 cursor-pointer border-0 bg-transparent p-0 font-bold underline">Undo</button>}
            {note.rebuild && <button type="button" onClick={() => offer(fresh(clan, server), true)} className="min-h-8 cursor-pointer border-0 bg-transparent p-0 font-bold underline">Rebuild</button>}
          </span>
          </span>
          {!!note.lines?.length && <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pb-1.5 text-[13px] font-semibold">{note.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}

      <ProposalBar proposals={proposals} me={me} viewing={viewing} setViewing={setViewId} dirty={dirty} yours={countOf(plans)}
        count={(p) => countOf(asPlans(p))} lines={(p) => diff(asPlans(p)).map(lineOf)}
        onBuild={(p) => { setPlans(asPlans(p)); setNote({ ok: true, text: `${p.author}'s copy` }) }}
        onAccepted={(p) => { getDays().then(setServer); if (!dirty) setPlans(asPlans(p)); setNote({ ok: true, text: 'Accepted' }) }} />

      {lineup.open.some((p) => !p.mine) && (
        <ProposalBar proposals={lineup} me={me} viewing={lineupViewing} setViewing={setLineupViewId} dirty={nMoves > 0} yours={nMoves}
          count={(p: Proposal<LineupBody>) => p.body.moves.length}
          lines={(p: Proposal<LineupBody>) => p.body.moves.map((m) => `${baseOf.get(m.tag)?.name ?? m.tag} → ${placeLabel(m)}`)}
          onBuild={(p: Proposal<LineupBody>) => setMoves(Object.fromEntries(p.body.moves.map((m) => [m.tag, { clan: m.clan, slot: m.slot }])))}
          onAccepted={() => window.location.reload()} />
      )}

      {!preview && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-semibold tabular-nums text-muted">
          {col.inCwl && <span className={col.core === 15 ? '' : 'font-bold text-[#B45309]'}>{col.core}/15 core</span>}
          <span className={col.count > 50 ? 'font-bold text-[#B91C1C]' : ''}>{col.count}/50 members</span>
          {col.inCwl && col.avg !== null && <span>Core avg {col.avg.toFixed(1)}{Math.abs(col.delta) >= 0.05 && ` (${col.delta > 0 ? '+' : '−'}${Math.abs(col.delta).toFixed(1)})`}</span>}
          {nMoves > 0 && (
            <span className="font-bold text-action">
              {nMoves === 1 ? `${changes[0].name} to ${placeLabel(moves[changes[0].tag])}` : `${nMoves} moves: ${changes.slice(0, 2).map((p) => p.name).join(', ')}${nMoves > 2 ? '…' : ''}`}
              {/* Someone in New with days stays a Sub while they have them, so there is nothing of theirs to reset. */}
              {changes.some((p) => !auto[p.tag]) && <button type="button" onClick={() => setMoves(auto)} className="ml-1 min-h-6 cursor-pointer border-0 bg-transparent p-0 font-bold text-action underline">Reset</button>}
            </span>
          )}
          <button type="button" onClick={() => { history.pushState(null, ''); setComparing(true) }} className="ml-auto min-h-8 cursor-pointer border-0 bg-transparent p-0 font-bold text-action">Compare</button>
        </p>
      )}

      {!preview && view === 'Flakes' && (
        <ul className="m-0 w-full max-w-[900px] list-none rounded-2xl border border-line bg-white p-1.5">
          {inFlakes.map((p) => <PlanRow key={p.tag} p={p} at={placeOf(p.tag)} onPlace={(v) => place(p, v)} locked={!!viewing} />)}
        </ul>
      )}

      {!preview && view !== 'Flakes' && <>
      {(swapOut.length > 0 || swapIn.length > 0) && (
        <p role="status" className="m-0 w-full max-w-[900px] rounded-[14px] bg-[#FEF3C7] px-4 py-2.5 text-sm font-bold text-[#92400E]">
          Day {prep} in game: {swapOut.length > 0 && swapIn.length > 0 ? `swap ${swapOut.join(', ')} for ${swapIn.join(', ')}` : swapIn.length > 0 ? `add ${swapIn.join(', ')}` : `take out ${swapOut.join(', ')}`}
        </p>
      )}
      <div aria-label="Key" className={`${KEY_ROW} max-md:flex-wrap max-md:overflow-x-visible`}>
        {anyLocked && <span className="flex items-center gap-1"><span style={LOCKED} className="flex h-3.5 items-center rounded-[3px] px-1"><Lock /></span>War started, locked</span>}
        {missed.size > 0 && <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#DC2626]" />Missed</span>}
        {anyDiffers && <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-[#F59E0B] bg-[#FEF3C7]" />Not as planned</span>}
        {DAYS.some((d) => belowOn(d) > 0) && <span className="flex items-center gap-1"><span className="rounded-full bg-[#FEF3C7] px-1 text-[11px] font-extrabold tabular-nums text-[#92400E]">−3</span>Under TH</span>}
        {rows.some((p) => tier(p, missed, w) !== null && !onTrial(p, w) && !onTrack(p.tag, plan, w)) && <span className="flex items-center gap-1"><span className="font-bold tabular-nums text-[#B45309]">5!</span>Under {TARGET}★</span>}
        {!!live && DAYS.some((d) => !locked(w[d]) && (live[clan][d] ?? []).join() !== (plan[d] ?? []).join()) && <span className="flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-[3px] bg-moved" />Changed</span>}
      </div>

      {/* Clipped, not scrolled, so the page is the one scroll and the day row sticks to the top of the screen. Only the narrowest phones need to scroll across. */}
      <section className="w-full max-w-[900px] overflow-clip max-[359px]:overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[3] bg-white">
            <tr>
              <th className="sticky left-0 z-[4] border-b border-line bg-white py-2 pl-3 text-left text-xs font-bold text-faint">PLAYER</th>
              {DAYS.map((d) => {
                const war = w[d]
                const n = plan[d]?.length ?? 0
                const ths = enemy(war, server?.upcoming?.[clan] ?? [])
                const drawn = !!war?.opponent_th.length
                const fixed = locked(war)
                const below = belowOn(d)
                const avg = ths.length ? ths.reduce((s, x) => s + x, 0) / ths.length : null
                return (
                  <th key={d} title={drawn ? `${war?.opponent} · TH ${ths.join(' ')}` : ths.length ? `Expected: TH ${ths.map((x) => Math.round(x)).join(' ')}` : undefined}
                    style={fixed ? LOCKED : undefined} className={`border-b border-line px-0.5 py-1.5 text-center align-bottom ${d === firstOpen && anyLocked ? 'border-l-2 border-l-line' : ''}`}>
                    <span className="flex flex-col items-center gap-0.5">
                      <span className={`flex items-center gap-1 text-xs font-extrabold ${war?.state === 'inWar' ? 'text-[#15803D]' : 'text-ink-2'}`}>
                        {fixed && <Lock />}D{d}
                      </span>
                      {avg !== null && <span className={`text-[10px] font-semibold tabular-nums text-faint ${drawn ? '' : 'italic'}`}><span className="max-md:hidden">TH</span>{avg.toFixed(1)}</span>}
                      {below > 0 && <span className="rounded-full bg-[#FEF3C7] px-1 text-[10px] font-extrabold tabular-nums text-[#92400E]">−{below}</span>}
                      {n !== TEAM && !fixed && <span className="rounded-full bg-[#FEE2E2] px-1.5 text-[10px] font-extrabold tabular-nums text-[#B91C1C]">{n}</span>}
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
                  <td className={`sticky left-0 z-[1] max-w-[max(96px,min(153px,calc(100vw-256px)))] border-b border-hair bg-white py-1 pl-2.5 pr-1 md:max-w-[170px] md:pl-3 md:pr-1.5 ${i === core.length && core.length ? 'border-t-2 border-t-line' : ''}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      {/* On a phone the status sits on the town hall, so the name keeps the room. */}
                      <span className="relative flex-none">
                        <Th th={p.th} />
                        <span className="absolute bottom-0 right-0 flex rounded-full bg-white p-px md:hidden"><StatusDot status={p.status} /></span>
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold max-md:text-[13px]">{p.name}</span>
                          <span className="flex max-md:hidden"><StatusDot status={p.status} /></span>
                        </span>
                        <PlaceSelect p={baseOf.get(p.tag)!} at={placeOf(p.tag)} onPlace={(v) => place(baseOf.get(p.tag)!, v)} locked={!!viewing}
                          className={`-my-1.5 -ml-1 h-7 w-full max-w-full rounded border-0 bg-transparent p-0 text-[11px] font-semibold ${moves[p.tag] ? 'text-action' : 'text-muted'}`} />
                      </span>
                    </span>
                  </td>
                  {DAYS.map((d) => (
                    <Cell key={d} plays={!!plan[d]?.includes(p.tag)} war={w[d]} tag={p.tag} ring={t.accent}
                      label={`${p.name}, day ${d}`} onToggle={locked(w[d]) || viewing ? undefined : () => toggle(p.tag, d)}
                      changed={!!live && !locked(w[d]) && !!live[clan][d]?.includes(p.tag) !== !!plan[d]?.includes(p.tag)} first={d === firstOpen && anyLocked} />
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
      {notIn.length > 0 && (
        <section aria-label="Not in" className="flex w-full max-w-[900px] flex-col gap-1">
          <span className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Not in · {notIn.length}</span>
          <ul className="m-0 list-none rounded-2xl border border-line bg-white p-1.5">
            {notIn.map((p) => <PlanRow key={p.tag} p={p} at={placeOf(p.tag)} onPlace={(v) => place(p, v)} locked={!!viewing} />)}
          </ul>
        </section>
      )}
      </>}
      {!preview && <PlanActivity days={proposals} lineup={lineup} published={server?.published} />}
    </Outer>
    {comparing && <ClanCompare cols={cols} moves={moves} plans={shown} players={roster.players} wide={wide} onClose={() => window.history.back()} />}
    {confirming && (
      <div className="ff-fade fixed inset-0 z-50 flex items-center justify-center bg-[rgba(43,33,20,.4)] p-4" onClick={(e) => { if (e.target === e.currentTarget) setConfirming(false) }}>
        <section role="dialog" aria-modal="true" aria-label="Publish to members"
          className="ff-sheet flex max-h-[80vh] w-full max-w-[440px] flex-col gap-3 overflow-auto rounded-[20px] bg-white p-[22px] shadow-[0_20px_50px_rgba(43,33,20,.25)]">
          <h2 className="font-display m-0 text-[22px]">Publish to members?</h2>
          {nMoves > 0 && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {changes.map((p) => (
                <li key={p.tag} className="flex min-h-10 items-center gap-2 rounded-[10px] bg-page px-3 text-sm">
                  <span className="min-w-0 flex-auto truncate font-semibold">{p.name}</span>
                  <span className="whitespace-nowrap font-bold" style={{ color: CLAN[p.clan].deep }}>{placeLabel(p)}</span>
                  <Arrow size={14} />
                  <span className="whitespace-nowrap font-bold" style={{ color: CLAN[moves[p.tag].clan].deep }}>{placeLabel(moves[p.tag])}</span>
                </li>
              ))}
            </ul>
          )}
          {!live && <p className="m-0 text-sm text-ink-2">The first day plan for this CWL.</p>}
          {!!live && diff(plans).length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] bg-page p-3 text-[13px] font-semibold text-ink-2">
              {diff(plans).map((x) => <li key={`${x.c}${x.d}`}>{lineOf(x)}</li>)}
            </ul>
          )}
          {valveHit && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] bg-[#FEE2E2] px-3 text-sm font-bold text-[#B91C1C]">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-4 accent-[#B91C1C]" />
              Override the one-way valve
            </label>
          )}
          {problems.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] bg-[#FEF3C7] p-3 text-[13px] font-semibold text-[#92400E]">
              {problems.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setConfirming(false)} className="min-h-11 cursor-pointer rounded-full border border-[#D5C8AC] bg-white px-4 text-sm font-semibold text-ink-2 hover:bg-page">Cancel</button>
            <button type="button" onClick={publish} disabled={busy || problems.length > 0 || (valveHit && !override)}
              className="min-h-11 cursor-pointer rounded-full border-0 bg-action px-[18px] text-sm font-bold text-white hover:bg-action-deep disabled:opacity-60">Publish</button>
          </div>
        </section>
      </div>
    )}
    {/* Row links would leave the planner, so a preview keeps its rows in place. */}
    {preview && (
      <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault() }}>
        <CwlTab roster={previewRoster} war={war} wide={wide} q={q} setQ={setQ} lock={{ clan, options: CWL, onPick: (c) => setClan(c as CwlClan) }} />
      </div>
    )}
    </>
  )
}
