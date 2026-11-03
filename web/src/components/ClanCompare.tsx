import { useState } from 'react'
import { useClans } from '../clash'
import { type ClanDays, DAYS } from '../dayplan'
import { CLAN, coreAvg, fmtScore } from '../theme'
import type { ClanName, Player } from '../types'
import { CardSheet } from './ClanSheet'
import { ahead, type Line, Row } from './CompareSheet'
import type { lineupBoard, Moves } from './PlanTab'
import { chip, ClanBadge, Eyebrow, Th } from './ui'

// Two clans side by side, from Plan: the same layout as comparing two players, on the plan as it stands on screen, moves and days included.

type Col = ReturnType<typeof lineupBoard>['cols'][number]

const PAIRS: [ClanName, ClanName][] = [['Fire', 'Cake'], ['Fire', 'Flakes'], ['Cake', 'Flakes']]
const one = (v: number) => v.toFixed(1)
const percent = (v: number) => `${v.toFixed(1)}%`

const stats = (rows: Player[]) => ({
  score: coreAvg(rows.map((p) => p.score)),
  th: coreAvg(rows.map((p) => p.th)),
  three: coreAvg(rows.map((p) => p.threeStar)),
  miss: coreAvg(rows.map((p) => p.missPct)),
})
const figures = (a: Player[], b: Player[]): Line[] => {
  const x = stats(a), y = stats(b)
  return [
    { label: 'Avg score', a: x.score, b: y.score, show: fmtScore as (v: number) => string },
    { label: 'Avg town hall', a: x.th, b: y.th, show: one },
    { label: '3★ rate', a: x.three, b: y.three, show: percent },
    { label: 'Attacks missed', a: x.miss, b: y.miss, show: percent, low: true },
  ]
}
const coreOf = (c: Col) => c.groups.find((g) => g.label === 'Core')?.rows ?? []
const allOf = (c: Col) => c.groups.flatMap((g) => g.rows)
const byStrength = (rows: Player[]) => [...rows].sort((p, q) => (q.th ?? 0) - (p.th ?? 0) || (q.score ?? 0) - (p.score ?? 0))

export default function ClanCompare({ cols, moves, plans, players, wide, onClose }: {
  cols: Col[]; moves: Moves; plans: Partial<Record<ClanName, ClanDays>>; players: Player[]; wide: boolean; onClose: () => void
}) {
  const [pair, setPair] = useState(0)
  const clans = useClans()
  const [ca, cb] = PAIRS[pair]
  const a = cols.find((c) => c.clan === ca)!, b = cols.find((c) => c.clan === cb)!
  const cwl = a.inCwl && b.inCwl
  const team = (c: Col) => (cwl ? coreOf(c) : allOf(c))
  const ths = [...new Set([...team(a), ...team(b)].map((p) => p.th).filter((t): t is number => t !== null))].sort((x, y) => y - x)
  const thOf = (tag: string) => players.find((p) => p.tag === tag)?.th ?? null
  const dayTh = (c: ClanName, d: number) => coreAvg((plans[c]?.[d] ?? []).map(thOf))

  const sections: { title: string; lines: Line[] }[] = [
    { title: 'Team', lines: [
      { label: 'Members', a: a.count, b: b.count, even: true },
      ...(cwl ? [{ label: 'Core', a: a.core, b: b.core, even: true }] : []),
    ] },
    { title: cwl ? 'Core' : 'All members', lines: figures(team(a), team(b)) },
    { title: cwl ? 'Core town halls' : 'Town halls', lines: ths.map((t) => ({
      label: `TH${t}`, a: team(a).filter((p) => p.th === t).length, b: team(b).filter((p) => p.th === t).length, even: true,
    })) },
    ...(cwl ? [{ title: 'Avg town hall by day', lines: DAYS.map((d) => ({ label: `Day ${d}`, a: dayTh(ca, d), b: dayTh(cb, d), show: one })) }] : []),
  ]
  const all = sections.flatMap((s) => s.lines)
  const leads = (side: number) => all.filter((l) => ahead(l) === side).length
  const deepA = CLAN[ca].deep, deepB = CLAN[cb].deep

  const head = (clan: ClanName, n: number, deep: string) => (
    <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
      <ClanBadge src={clans[clan]?.badge} size={48} />
      <span className="font-display text-[22px] leading-tight" style={{ color: deep }}>{clan}</span>
      <span className="font-display text-[26px] leading-none tabular-nums" style={{ color: deep }}>{n}</span>
    </div>
  )
  const lineup = (c: Col) => (
    <div className="flex min-w-0 flex-col gap-2">
      {c.groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.label} className="flex min-w-0 flex-col">
          <span className="pb-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">{g.label} · {g.rows.length}</span>
          {byStrength(g.rows).map((p) => (
            <span key={p.tag} className="flex min-h-9 min-w-0 items-center gap-1.5 border-t border-hair">
              <Th th={p.th} />
              <span className={`min-w-0 flex-auto truncate text-[13px] font-semibold ${moves[p.tag] ? 'text-action' : 'text-ink'}`}>{p.name}</span>
              <span className="flex-none text-xs font-semibold tabular-nums text-muted">{p.score === null ? '' : fmtScore(p.score)}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <CardSheet label="Compare clans" wide={wide} onClose={onClose} head={<span className="font-display min-w-0 flex-auto truncate text-[22px] leading-tight text-ink">Compare clans</span>}>
      <div role="group" aria-label="Clans" className="flex flex-wrap gap-1.5">
        {PAIRS.map(([x, y], i) => <button key={x + y} type="button" aria-pressed={i === pair} onClick={() => setPair(i)} className={chip(i === pair)}>{x} v {y}</button>)}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {head(ca, leads(-1), deepA)}
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Ahead on</span>
        {head(cb, leads(1), deepB)}
      </div>
      {sections.filter((s) => s.lines.length).map((s) => (
        <section key={s.title} aria-label={s.title} className="flex flex-col">
          <Eyebrow className="pb-1 text-center">{s.title}</Eyebrow>
          {s.lines.map((l) => <Row key={l.label} line={l} a={deepA} b={deepB} />)}
        </section>
      ))}
      <section aria-label="Lineups" className="flex flex-col">
        <Eyebrow className="pb-1 text-center">Lineups</Eyebrow>
        <div className="grid grid-cols-2 gap-3">{lineup(a)}{lineup(b)}</div>
      </section>
    </CardSheet>
  )
}
