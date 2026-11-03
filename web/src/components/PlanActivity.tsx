import { useState } from 'react'
import type { Proposal } from '../data'

// Who did what on Plan, and when: proposals and decisions for lineups and days, and the latest day plan publish.

export type ActivityInput = {
  days: { open: Proposal<unknown>[]; decided: Proposal<unknown>[] }
  lineup: { open: Proposal<unknown>[]; decided: Proposal<unknown>[] }
  published?: { updated_at: string; updated_by: string | null } | null
}

const SHOWN = 5
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export default function PlanActivity({ days, lineup, published }: ActivityInput) {
  const [all, setAll] = useState(false)
  const from = (list: ActivityInput['days'], name: string) => [
    ...list.open.map((p) => ({ key: `o${p.id}`, who: p.author, what: `proposed a ${name}`, at: p.updated_at })),
    ...list.decided.map((p) => ({ key: `d${p.id}`, who: p.decided_by ?? 'The publisher', what: `${p.status === 'accepted' ? 'accepted' : 'rejected'} ${p.author}'s ${name}`, at: p.decided_at ?? p.updated_at })),
  ]
  const items = [...from(days, 'day plan'), ...from(lineup, 'lineup'),
    ...(published ? [{ key: 'pub', who: published.updated_by ?? 'The publisher', what: 'published the day plan', at: published.updated_at }] : [])]
    .sort((a, b) => b.at.localeCompare(a.at))
  if (!items.length) return null
  return (
    <section aria-label="Activity" className="w-full max-w-[900px] overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-hair px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Activity</div>
      <ol className="m-0 list-none">
        {(all ? items : items.slice(0, SHOWN)).map((x, i) => (
          <li key={x.key} className={`flex min-h-10 items-center gap-3 px-3.5 py-1.5 text-[13px] ${i ? 'border-t border-hair' : ''}`}>
            <span className="min-w-0 flex-auto"><b className="font-bold text-ink">{x.who}</b> <span className="text-ink-2">{x.what}</span></span>
            <span className="flex-none whitespace-nowrap text-xs font-semibold tabular-nums text-faint">{when(x.at)}</span>
          </li>
        ))}
      </ol>
      {items.length > SHOWN && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}
          className="min-h-11 w-full cursor-pointer border-0 border-t border-hair bg-transparent text-[13px] font-bold text-action">{all ? 'Show fewer' : `Show all ${items.length}`}</button>
      )}
    </section>
  )
}
