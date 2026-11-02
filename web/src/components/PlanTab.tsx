import { useEffect, useMemo, useState } from 'react'
import { loginHref, takeSigninError, type Me } from '../auth'
import { checkPlan, getProposals, HttpError, type LineupBody, type PlanMove, type Proposal, publishPlan, saveProposal, withdrawProposal } from '../data'
import { CLAN, CLANS, GROUPS, coreAvg, fmtScore } from '../theme'
import type { ClanName, Player, Roster, Slot } from '../types'
import { useClans } from '../clash'
import LeadersTools from './LeadersTools'
import DayPlanner from './DayPlanner'
import { ProposalBar, useProposals } from './Proposals'
import { Arrow, ClanBadge, ClanSwitch, StatusDot, StatusKey, SubNav, Th } from './ui'

// Allocation rules: docs/specs/02-allocation-rules.md.
const MAKI = '#CGJ8YR8J'
const CAP = 50
const STARTERS = 15
const DRAFT_KEY = 'ff-plan-draft'

type Place = { clan: ClanName; slot: Slot }
type Moves = Record<string, Place>

// Within the row's clan, plain words; other clans sit under "Move to…".
const HERE: Record<Slot, string> = { CORE: 'Core', SUB: 'Sub', OUT: 'Not in', NEW: 'New' }
const clanOptions = (clan: ClanName): Slot[] => (clan === 'Flakes' ? ['OUT'] : ['CORE', 'SUB', 'OUT'])
const SHORT: Record<Slot, string> = { CORE: 'core', SUB: 'sub', OUT: 'not in', NEW: 'new' }
const placeLabel = (p: Place) => (p.clan === 'Flakes' && p.slot !== 'NEW' ? 'Flakes' : `${p.clan} ${SHORT[p.slot]}`)

type Check = { key: string; label: string; tip: string; tone: 'ok' | 'warn' | 'bad' | 'info' }
function readDraft(roster: Roster): Moves {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Moves
    const tags = new Set(roster.players.map((p) => p.tag))
    return Object.fromEntries(Object.entries(raw).filter(([t]) => tags.has(t)))
  } catch { return {} }
}

function PlanRow({ p, at, onPlace, locked }: { p: Player; at: Place; onPlace: (v: Place) => void; locked: boolean }) {
  const moved = at.clan !== p.clan || at.slot !== p.slot
  const id = 'plan-' + p.tag.slice(1)
  return (
    <li className={`ff-plan-row flex min-h-11 items-center gap-2 rounded-[10px] py-[3px] pl-2.5 pr-1 ${moved ? 'bg-moved' : 'hover:bg-[#F8FAFF]'}`}>
      <Th th={p.th} />
      <span className="flex min-w-0 flex-auto items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{p.name}</span>
        <StatusDot status={p.status} />
        {at.clan !== p.clan && <span className="flex-none text-[11px] font-bold text-action">← {p.clan}</span>}
        {at.slot === 'NEW' && p.suggestedSlot && (
          <span title={p.suggestedReason ?? undefined} className="flex-none rounded-full border border-line px-1.5 text-[11px] font-semibold text-muted">
            Suggest {HERE[p.suggestedSlot].toLowerCase()}
          </span>
        )}
      </span>
      <span className="w-[38px] flex-none text-right text-sm font-bold tabular-nums text-muted">{fmtScore(p.score)}</span>
      <label htmlFor={id} className="sr-only">Place {p.name}</label>
      <select id={id} value={`${at.clan}|${at.slot}`} disabled={locked}
        onChange={(e) => { const [clan, slot] = e.target.value.split('|') as [ClanName, Slot]; onPlace({ clan, slot }) }}
        className="min-h-9 w-[92px] flex-none cursor-pointer rounded-lg border px-1 text-xs font-semibold text-ink-2 disabled:cursor-default disabled:opacity-70">
        {at.slot === 'NEW' && <option value={`${at.clan}|NEW`}>New</option>}
        {clanOptions(at.clan).map((slot) => <option key={slot} value={`${at.clan}|${slot}`}>{at.clan === 'Flakes' ? 'In Flakes' : HERE[slot]}</option>)}
        <optgroup label="Move to…">
          {CLANS.filter((c) => c !== at.clan).flatMap((c) => clanOptions(c).map((slot) => (
            <option key={c + slot} value={`${c}|${slot}`}>{c === 'Flakes' ? 'Flakes' : `${c} · ${HERE[slot].toLowerCase()}`}</option>
          )))}
        </optgroup>
      </select>
    </li>
  )
}

const toList = (m: Moves) => Object.entries(m).map(([tag, v]) => ({ tag, ...v })).sort((a, b) => a.tag.localeCompare(b.tag))
const sameMoves = (a: Moves, b: Moves) => JSON.stringify(toList(a)) === JSON.stringify(toList(b))

function Plan({ roster, me }: { roster: Roster; me: Me }) {
  const [mine, setMine] = useState<Moves>(() => readDraft(roster))
  const proposals = useProposals<LineupBody>('lineup')
  const [viewId, setViewId] = useState<number | null>(null)
  const viewing = proposals.open.find((p) => p.id === viewId) ?? null
  // A proposal's moves that still change anything on the current roster.
  const toMoves = (list: PlanMove[]): Moves => {
    const by = new Map(roster.players.map((p) => [p.tag, p]))
    return Object.fromEntries(list.filter((m) => { const p = by.get(m.tag); return p && (p.clan !== m.clan || p.slot !== m.slot) })
      .map((m) => [m.tag, { clan: m.clan, slot: m.slot }]))
  }
  // The board shows your own moves, or the proposal you have open.
  const moves = viewing ? toMoves(viewing.body.moves) : mine
  const [saved, setSaved] = useState<{ moves: Moves; by: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; n: number; why?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState(false)
  const [server, setServer] = useState<{ problems: string[] } | 'checking' | null>(null)
  const [phoneClan, setPhoneClan] = useState<ClanName>('Fire')
  const clans = useClans()

  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(mine)) } catch { /* private mode */ } }, [mine])

  // Your proposal on the server; it fills the board unless this browser has unsaved moves.
  useEffect(() => {
    getProposals<LineupBody>('lineup').then((d) => {
      const own = d.open.find((p) => p.mine)
      const server = toMoves(own?.body.moves ?? [])
      setSaved({ moves: server, by: own?.author ?? null })
      setMine((local) => (Object.keys(local).length ? local : server))
    }).catch(() => setSaved(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster])

  const save = async () => {
    setSaving(true)
    try {
      const d = await saveProposal('lineup', '', { moves: toList(mine) }, me.csrf)
      setSaved({ moves: mine, by: d.author })
      await proposals.reload()
    } catch {
      setResult({ ok: false, n: 0, why: 'Not proposed. Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const dirty = saved ? !sameMoves(mine, saved.moves) : Object.keys(mine).length > 0
  const canPublish = me.role === 'publisher'
  // Until sign-in is set up the board is open to anyone, but nothing is saved or published.
  // Saving and publishing wait for a Discord leader session.
  const readOnly = !me.role || me.via === 'passcode'
  const lockedTip = 'Sign-in coming soon'

  const at = (p: Player): Place => moves[p.tag] ?? { clan: p.clan, slot: p.slot }
  const place = (p: Player, v: Place) => {
    if (viewing) return
    setResult(null)
    setMine((m) => {
      const next = { ...m }
      if (v.clan === p.clan && v.slot === p.slot) delete next[p.tag]
      else next[p.tag] = v
      return next
    })
  }

  const { cols, checks } = useMemo(() => {
    const checks: Check[] = []
    const P = roster.players
    const where = (p: Player) => moves[p.tag] ?? { clan: p.clan, slot: p.slot }
    const cols = CLANS.map((clan) => {
      const inCwl = !!roster.clans[clan]?.inCwl
      const here = P.filter((p) => where(p).clan === clan)
      const core = here.filter((p) => where(p).slot === 'CORE')
      const avg = coreAvg(core.map((p) => p.score))
      const was = coreAvg(P.filter((p) => p.clan === clan && p.slot === 'CORE').map((p) => p.score))
      if (inCwl) checks.push({ key: clan + 'core', label: `${clan} ${core.length}/${STARTERS}`, tip: 'Starters', tone: core.length === STARTERS ? 'ok' : 'warn' })
      checks.push({ key: clan + 'cap', label: `${clan} ${here.length}/${CAP}`, tip: 'Members', tone: here.length <= CAP ? 'ok' : 'bad' })
      const groups = inCwl
        ? GROUPS.map((g) => ({ label: g.label, dim: g.dim, rows: here.filter((p) => where(p).slot === g.slot) })).filter((g) => g.label !== 'New' || g.rows.length)
        : [{ label: 'Members', dim: false, rows: here }]
      return { clan, inCwl, count: here.length, avg, delta: avg !== null && was !== null ? avg - was : 0, groups }
    })
    const valve = P.filter((p) => p.clan === 'Fire' && where(p).clan === 'Cake').length
    checks.push({ key: 'valve', label: valve ? `${valve} Fire → Cake` : 'Valve', tip: 'One-way valve', tone: valve ? 'bad' : 'ok' })
    const maki = P.find((p) => p.tag === MAKI)
    if (maki) {
      const w = where(maki)
      const ok = w.clan === 'Cake' && w.slot === 'CORE'
      checks.push({ key: 'maki', label: ok ? 'Maki' : 'Maki is locked', tip: 'Locked to Cake core', tone: ok ? 'ok' : 'bad' })
    }
    const intoCake = P.some((p) => p.clan !== 'Cake' && where(p).clan === 'Cake')
    const outOfCake = P.some((p) => p.clan === 'Cake' && where(p).clan !== 'Cake')
    if (intoCake && outOfCake) checks.push({ key: 'order', label: 'Out of Cake first', tip: 'Move order', tone: 'info' })
    return { cols, checks }
  }, [roster, moves])

  // In execution order: out of Cake, then the rest, then into Cake (50-member cap).
  const step = (p: Player) => (p.clan === 'Cake' && moves[p.tag].clan !== 'Cake' ? 0 : p.clan !== 'Cake' && moves[p.tag].clan === 'Cake' ? 2 : 1)
  const changes = roster.players.filter((p) => moves[p.tag]).sort((a, b) => step(a) - step(b))
  const n = changes.length
  // The publisher may override the one-way valve, confirmed in the publish sheet.
  const valveOnly = (k: Check) => k.key === 'valve' && canPublish
  const blocked = checks.some((k) => (k.tone === 'bad' || k.tone === 'warn') && !valveOnly(k))
  const valveHit = checks.some((k) => k.key === 'valve' && k.tone === 'bad')
  const cant = !n || blocked || busy
  const list = () => changes.map((p) => ({ tag: p.tag, ...moves[p.tag] }))

  const openConfirm = async () => {
    setOverride(false)
    setConfirming(true)
    setServer('checking')
    try {
      const r = await checkPlan(list(), valveHit, me.csrf)
      setServer({ problems: r.problems ?? [] })
    } catch (e) {
      setServer(e instanceof HttpError && e.problems.length ? { problems: e.problems } : null)
    }
  }
  const serverProblems = server && server !== 'checking' ? server.problems : []
  const changeLabel = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'No changes'

  const publish = async () => {
    setBusy(true)
    try {
      await publishPlan(list(), valveHit && override, me.csrf)
      setResult({ ok: true, n })
      setMine({})
      setSaved({ moves: {}, by: me.user?.name ?? null })
      if (proposals.mine) await withdrawProposal(proposals.mine.id, me.csrf)
      await proposals.reload()
    } catch (e) {
      const err = e instanceof HttpError ? e : null
      const why = err?.problems.length ? `Not published. ${err.problems.join('. ')}.`
        : err && (err.status === 401 || err.status === 403) ? 'Not published. Sign in again as the publisher.'
        : 'Not published. The server is offline.'
      setResult({ ok: false, n, why })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  // The wrapper ends the toolbar's stickiness at the bottom of the board.
  return (
    <div>
      <div className="px-4 pt-1 md:hidden"><ClanSwitch value={phoneClan} onPick={setPhoneClan} /></div>
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-2 px-[clamp(16px,3vw,32px)] py-2.5 md:pt-5">
          <span className="rounded-full bg-[#EEF1F6] px-3 py-1.5 text-[13px] font-bold text-ink-2">{changeLabel}</span>
          <span className="flex-auto" />
          {n > 0 && !viewing && (
            <button type="button" onClick={() => { setMine({}); setResult(null) }}
              className="min-h-10 cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white px-3 text-sm font-semibold text-ink-2 hover:bg-page">
              Reset
            </button>
          )}
          {!viewing && <button type="button" onClick={save} disabled={readOnly || !dirty || saving} title={readOnly ? lockedTip : undefined}
            className="min-h-10 cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white px-3 text-sm font-semibold text-ink-2 hover:bg-page disabled:cursor-default disabled:opacity-60">
            {dirty || !Object.keys(mine).length ? 'Propose' : 'Proposed'}
          </button>}
          {viewing ? null : readOnly ? (
            <button type="button" disabled title={lockedTip}
              className="min-h-10 cursor-not-allowed rounded-[10px] border-0 bg-[#E2E8F0] px-4 text-sm font-bold text-faint">
              Publish
            </button>
          ) : canPublish ? (
            <button type="button" onClick={openConfirm} disabled={cant}
              title={blocked ? checks.filter((k) => (k.tone === 'bad' || k.tone === 'warn') && !valveOnly(k)).map((k) => k.label).join(' · ') : undefined}
              className="min-h-10 cursor-pointer rounded-[10px] border-0 bg-action px-4 text-sm font-bold text-white hover:bg-action-deep disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-faint">
              Publish
            </button>
          ) : null}
        </div>
      </div>

      <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-3 md:pt-1">
        {result && (
          <div role="status" className={`flex min-h-12 items-center gap-2.5 rounded-[14px] px-4 text-sm font-bold ${result.ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
            <span className="flex-auto">{result.ok ? `Published · ${result.n} ${result.n === 1 ? 'change' : 'changes'} on CWL` : result.why}</span>
            {result.ok && <a href="#/cwl" className="flex min-h-9 items-center rounded-[9px] bg-white px-3.5 text-[#166534] no-underline">Open CWL</a>}
          </div>
        )}

        <ProposalBar proposals={proposals} me={me} viewing={viewing} setViewing={setViewId} dirty={dirty} yours={Object.keys(mine).length}
          count={(p: Proposal<LineupBody>) => Object.keys(toMoves(p.body.moves)).length}
          lines={(p: Proposal<LineupBody>) => Object.entries(toMoves(p.body.moves)).map(([tag, to]) => {
            const f = roster.players.find((x) => x.tag === tag)!
            return `${f.name}: ${placeLabel({ clan: f.clan, slot: f.slot })} → ${placeLabel(to)}`
          })}
          onBuild={(p: Proposal<LineupBody>) => setMine(toMoves(p.body.moves))}
          onAccepted={() => window.location.reload()} />

        <StatusKey className="max-md:!gap-x-2 max-md:!text-[11px]" only={['active', 'highMiss', 'inactive', 'thin']} extra={<span className="flex flex-none items-center gap-1 md:gap-1.5"><span className="h-2.5 w-3.5 rounded-[3px] bg-moved" />Moved</span>} />

        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
          {cols.map((c) => {
            const t = CLAN[c.clan]
            return (
              <section key={c.clan} aria-label={c.clan} className={`overflow-hidden rounded-[18px] border border-line bg-white ${c.clan === phoneClan ? '' : 'max-md:hidden'}`}>
                <div className="flex items-end justify-between p-4" style={{ background: t.tint }}>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-display m-0 flex items-center gap-2 text-[22px] leading-none" style={{ color: t.deep }}><ClanBadge src={clans[c.clan]?.badge} size={30} />{clans[c.clan]?.name ?? `Frosted ${c.clan}`}</h2>
                    <span className={`text-[13px] font-semibold ${c.count > CAP ? 'text-[#B91C1C]' : 'text-muted'}`}>{c.count}/{CAP}</span>
                  </div>
                  {c.inCwl && (
                    <div className="flex flex-none flex-col items-end">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Core avg</span>
                    <div className="flex items-baseline gap-2">
                      {Math.abs(c.delta) >= 0.05 && (
                        <span className="text-[13px] font-bold tabular-nums" style={{ color: c.delta > 0 ? '#15803D' : '#C2410C' }}>
                          {c.delta > 0 ? '+' : '−'}{Math.abs(c.delta).toFixed(1)}
                        </span>
                      )}
                      <span className="font-display text-[26px] leading-[1.05] tabular-nums" style={{ color: t.deep }}>{c.avg === null ? '—' : c.avg.toFixed(1)}</span>
                    </div>
                    </div>
                  )}
                </div>
                {c.groups.map((g) => (
                  <div key={g.label}>
                    <div className={`flex justify-between px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.06em] ${g.dim ? 'text-[#94A3B8]' : 'text-muted'}`}>
                      <span>{g.label}</span><span>{g.rows.length}</span>
                    </div>
                    <ul className="m-0 list-none px-1.5 pb-1.5">
                      {g.rows.map((p) => <PlanRow key={p.tag} p={p} at={at(p)} onPlace={(v) => place(p, v)} locked={!!viewing} />)}
                    </ul>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      </main>

      {confirming && (
        <div className="ff-fade fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,.4)] p-4" onClick={(e) => { if (e.target === e.currentTarget) setConfirming(false) }}>
          <section role="dialog" aria-modal="true" aria-label="Publish to CWL"
            className="ff-sheet flex max-h-[80vh] w-full max-w-[440px] flex-col gap-3.5 overflow-auto rounded-[20px] bg-white p-[22px] shadow-[0_20px_50px_rgba(15,23,42,.25)]">
            <h2 className="font-display m-0 text-[22px]">Publish {changeLabel}?</h2>
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
            {valveHit && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] bg-[#FEE2E2] px-3 text-sm font-bold text-[#B91C1C]">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-4 accent-[#B91C1C]" />
                Override the one-way valve
              </label>
            )}
            {serverProblems.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] bg-[#FEF3C7] p-3 text-[13px] font-semibold text-[#92400E]">
                {serverProblems.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(false)}
                className="min-h-11 cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white px-4 text-sm font-semibold text-ink-2 hover:bg-page">Cancel</button>
              <button type="button" onClick={publish} disabled={busy || server === 'checking' || serverProblems.length > 0 || (valveHit && !override)}
                className="min-h-11 cursor-pointer rounded-[10px] border-0 bg-action px-[18px] text-sm font-bold text-white hover:bg-action-deep disabled:opacity-60">Publish</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

const Discord = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.4C.6 9 -.3 13.5.1 18a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.6ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
)

function Gate({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [failed] = useState(takeSigninError)
  return (
    <main className="mx-auto flex max-w-[1360px] justify-center px-4 pt-16">
      <section className="flex w-full max-w-[380px] flex-col items-center gap-3 rounded-[20px] border border-line bg-white px-6 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#EEF1F6] text-ink-2">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <h2 className="font-display m-0 text-[24px] text-brand">Leaders only</h2>
        {failed && !me.user && (
          <span role="status" className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[13px] font-bold text-[#92400E]">
            {failed === 'denied' ? 'Not a leader account' : 'Sign-in failed. Try again.'}
          </span>
        )}
        {me.user ? (
          <>
            <span className="text-sm text-faint">Signed in as {me.user.name}</span>
            <button type="button" onClick={onSignOut}
              className="min-h-11 w-full cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white text-sm font-semibold text-ink-2 hover:bg-page">Sign out</button>
          </>
        ) : !me.configured ? (
          <button type="button" disabled className="mt-1 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border-0 bg-[#E2E8F0] text-[15px] font-bold text-faint">
            <Discord />Sign-in coming soon
          </button>
        ) : (
          <a href={loginHref()}
            className="mt-1 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#5865F2] text-[15px] font-bold text-white no-underline hover:bg-[#4752C4]">
            <Discord />Sign in with Discord
          </a>
        )}
      </section>
    </main>
  )
}

type PlanProps = { roster: Roster; me: Me; ready: boolean; wide: boolean; onSignOut: () => void }

const SUBS = [
  { id: 'builder', label: 'Lineup builder', href: '#/plan/builder' },
  { id: 'days', label: 'Day planner', href: '#/plan/days' },
  { id: 'members', label: 'Members', href: '#/plan/members' },
]

export default function PlanTab({ sub, roster, me, ready, wide, onSignOut }: PlanProps & { sub: string }) {
  if (!ready) return <div aria-busy="true" aria-label="Loading" className="mx-auto mt-16 h-48 max-w-[380px] animate-pulse rounded-[20px] bg-well" />
  // Open to all only while Discord sign-in is not set up. Once it is, signed-out visitors and non-leaders
  // see the sign-in card alone, on both sections.
  if (me.configured && !me.role) return <Gate me={me} onSignOut={onSignOut} />
  return (
    <>
      <SubNav items={SUBS} current={sub} wide={wide} />
      {sub === 'members' ? <LeadersTools wide={wide} /> : sub === 'days' ? <DayPlanner roster={roster} me={me} /> : <Plan roster={roster} me={me} />}
    </>
  )
}
