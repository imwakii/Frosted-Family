import { useCallback, useEffect, useState } from 'react'
import type { Me } from '../auth'
import { acceptProposal, getProposals, HttpError, type Proposal, type ProposalKind, rejectProposal, withdrawProposal } from '../data'
import { ago } from '../leaders'

// Each leader's own proposal, shown above the lineup builder and the day planner. Anyone can open anyone's and
// build on it; only the publisher accepts or rejects.

export function useProposals<B>(kind: ProposalKind) {
  const [data, setData] = useState<{ open: Proposal<B>[]; decided: Proposal<B>[] }>({ open: [], decided: [] })
  const reload = useCallback(() => getProposals<B>(kind).then(setData).catch(() => undefined), [kind])
  useEffect(() => {
    reload()
    const id = window.setInterval(reload, 60_000)
    return () => window.clearInterval(id)
  }, [reload])
  return { ...data, mine: data.open.find((p) => p.mine) ?? null, reload }
}

const chip = (on: boolean) => `flex min-h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`
const STATUS_TEXT: Record<string, string> = { accepted: 'Accepted', rejected: 'Rejected' }

type BarProps<B> = {
  proposals: ReturnType<typeof useProposals<B>>
  me: Me
  viewing: Proposal<B> | null
  setViewing: (id: number | null) => void
  dirty: boolean
  /** One line per change against what is published. */
  lines: (p: Proposal<B>) => string[]
  count: (p: Proposal<B>) => number
  yours: number
  onBuild: (p: Proposal<B>) => void
  onAccepted: (p: Proposal<B>) => void
}

export function ProposalBar<B>({ proposals, me, viewing, setViewing, dirty, lines, count, yours, onBuild, onAccepted }: BarProps<B>) {
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const { open, decided, mine, reload } = proposals
  const others = open.filter((p) => !p.mine)
  useEffect(() => setProblems([]), [viewing?.id])
  if (!others.length && !decided.length && !mine) return null

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setProblems([])
    try {
      await fn()
      await reload()
      after?.()
    } catch (e) {
      const err = e instanceof HttpError ? e : null
      setProblems(err?.problems.length ? err.problems : ['That did not go through. Try again.'])
    } finally {
      setBusy(false)
    }
  }
  const accept = (override: boolean) => viewing && act(() => acceptProposal(viewing.id, override, me.csrf), () => { setViewing(null); onAccepted(viewing) })
  const valve = problems.some((x) => x.startsWith('one-way valve'))
  const canDecide = me.role === 'publisher'
  const btn = 'min-h-9 cursor-pointer rounded-[10px] border border-[#D5DBE5] bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page disabled:opacity-60'
  const go = 'min-h-9 cursor-pointer rounded-[10px] border-0 bg-action px-3 text-[13px] font-bold text-white hover:bg-action-deep disabled:opacity-60'
  const changes = viewing ? lines(viewing) : []

  return (
    <section aria-label="Proposals" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        <button type="button" aria-pressed={!viewing} onClick={() => setViewing(null)} className={chip(!viewing)}>
          Yours{yours > 0 && <span className="tabular-nums opacity-70">{yours}</span>}
          {dirty && <span title="Not proposed yet" className="size-1.5 rounded-full bg-[#F59E0B]" />}
        </button>
        {others.map((p) => (
          <button key={p.id} type="button" aria-pressed={viewing?.id === p.id} title={`Updated ${ago(p.updated_at) ?? ''}`}
            onClick={() => setViewing(p.id)} className={chip(viewing?.id === p.id)}>
            {p.author}<span className="tabular-nums opacity-70">{count(p)}</span>
          </button>
        ))}
        {!viewing && mine && (
          <button type="button" disabled={busy} onClick={() => act(() => withdrawProposal(mine.id, me.csrf))}
            className="min-h-9 flex-none cursor-pointer border-0 bg-transparent px-2 text-[13px] font-semibold text-faint hover:text-ink">Withdraw yours</button>
        )}
      </div>

      {!viewing && decided.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-xs font-semibold text-faint">
          {decided.slice(0, 3).map((p) => (
            <span key={p.id}>{p.mine ? 'Yours' : p.author}: <span className={p.status === 'accepted' ? 'text-[#15803D]' : 'text-[#B45309]'}>{STATUS_TEXT[p.status] ?? p.status}</span> {ago(p.decided_at)}</span>
          ))}
        </div>
      )}

      {viewing && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink">{viewing.author}</span>
            <span className="text-xs font-semibold text-faint">{ago(viewing.updated_at)}</span>
            <span className="flex-auto" />
            <button type="button" className={btn} onClick={() => { if (!dirty || window.confirm('Replace your unsaved changes with this proposal?')) { setViewing(null); onBuild(viewing) } }}>Build on this</button>
            {canDecide && <>
              <button type="button" className={btn} disabled={busy} onClick={() => act(() => rejectProposal(viewing.id, me.csrf), () => setViewing(null))}>Reject</button>
              {valve
                ? <button type="button" className={go} disabled={busy} onClick={() => accept(true)}>Accept, override valve</button>
                : <button type="button" className={go} disabled={busy} onClick={() => accept(false)}>Accept and publish</button>}
            </>}
          </div>
          {changes.length ? (
            <ul className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-auto p-0 text-[13px] text-ink-2">
              {changes.map((l) => <li key={l}>{l}</li>)}
            </ul>
          ) : <span className="text-[13px] text-faint">Same as what is published</span>}
          {problems.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] bg-[#FEF3C7] p-2.5 text-[13px] font-semibold text-[#92400E]">
              {problems.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
        </div>
      )}
      {!viewing && problems.length > 0 && <span className="px-1 text-[13px] font-semibold text-[#92400E]">{problems[0]}</span>}
    </section>
  )
}
