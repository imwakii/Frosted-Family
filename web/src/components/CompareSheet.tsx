import { useEffect, useMemo, useState } from 'react'
import { loadPlayerAll, type PlayerCard } from '../data'
import { CATS, isMaxed, type Matrix, progress, useMatrix } from '../explore'
import { compareHref, go, markFromCard, openedFromCard } from '../route'
import { CLAN, fmtScore } from '../theme'
import type { Player, Roster } from '../types'
import { CardSheet } from './ClanSheet'
import { Eyebrow, SearchIcon, Th, UnitIcon } from './ui'
import { useYou } from './You'

// Two members side by side, from either's player card: who leads where, on the same figures the cards and Stats show.

type Line = { label: string; a: number | null; b: number | null; show?: (v: number) => string; low?: boolean; unit?: string }

const whole = (v: number) => Math.round(v).toLocaleString('en-GB')
const percent = (v: number) => `${v.toFixed(1)}%`
const threeStar = (p: Player, c: PlayerCard | null) => (c?.record ? (c.record.three_star_rate === null ? null : c.record.three_star_rate * 100) : p.threeStar ?? null)
const missed = (p: Player, c: PlayerCard | null) => {
  const r = c?.record
  return r ? (r.attacks + r.missed ? (100 * r.missed) / (r.attacks + r.missed) : null) : p.missPct ?? null
}
/** Which side is ahead: -1 the first, 1 the second, 0 neither or level. */
const ahead = ({ a, b, low }: Line) => (a === null || b === null || a === b ? 0 : (a > b) !== !!low ? -1 : 1)

function usePlayerCard(tag: string) {
  const [card, setCard] = useState<PlayerCard | null>(null)
  useEffect(() => {
    let live = true
    setCard(null)
    loadPlayerAll(tag).then((x) => { if (live) setCard(x.card) })
    return () => { live = false }
  }, [tag])
  return card
}

function Row({ line, a, b }: { line: Line; a: string; b: string }) {
  const lead = ahead(line)
  const value = (v: number | null, side: number, deep: string) => (
    <span className={`text-center text-sm tabular-nums ${lead === side ? 'font-extrabold' : lead ? 'font-semibold text-faint' : 'font-semibold text-ink-2'}`} style={lead === side ? { color: deep } : undefined}>
      {v === null ? '—' : (line.show ?? whole)(v)}
    </span>
  )
  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] items-center gap-x-1 border-t border-hair px-1">
      {value(line.a, -1, a)}
      <span className="flex min-w-0 items-center justify-center gap-1 text-center text-xs font-semibold text-muted">
        {line.unit && <UnitIcon name={line.unit} size={22} />}
        <span className="truncate">{line.label}</span>
      </span>
      {value(line.b, 1, b)}
    </div>
  )
}

function Picker({ roster, first, wide, onClose }: { roster: Roster; first: Player; wide: boolean; onClose: () => void }) {
  const { yous } = useYou()
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const mine = roster.players.filter((p) => yous.includes(p.tag) && p.tag !== first.tag)
  const hits = n ? roster.players.filter((p) => p.tag !== first.tag && p.name.toLowerCase().includes(n)).slice(0, 6) : mine
  return (
    <CardSheet label={`Compare ${first.name}`} wide={wide} onClose={onClose} head={
      <div className="flex min-w-0 flex-auto flex-col gap-0.5">
        <span className="font-display truncate text-[22px] leading-tight text-ink">Compare {first.name}</span>
        <span className="text-sm text-muted">With which player?</span>
      </div>
    }>
      <div className="relative min-w-0">
        <label htmlFor="compare-with" className="sr-only">Player's name</label>
        <SearchIcon />
        <input id="compare-with" type="search" placeholder="Player's name" value={q} autoComplete="off" spellCheck={false} onChange={(e) => setQ(e.target.value)}
          className="h-[50px] w-full rounded-[14px] border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint" />
      </div>
      {hits.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {hits.map((p, i) => (
            <li key={p.tag}>
              <a href={compareHref(first.tag, p.tag)} className={`flex min-h-11 items-center gap-2.5 px-1 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <Th th={p.th} />
                <span className="min-w-0 flex-auto truncate text-sm font-semibold">{p.name}</span>
                <span className="flex-none text-xs font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {n && !hits.length && <p className="m-0 text-sm text-faint">No one by that name</p>}
    </CardSheet>
  )
}

export default function CompareSheet({ roster, a: aTag, b: bTag, wide, onClose }: { roster: Roster; a: string; b: string | null; wide: boolean; onClose: () => void }) {
  const a = roster.players.find((p) => p.tag === aTag)
  const b = bTag ? roster.players.find((p) => p.tag === bTag) : undefined
  const cardA = usePlayerCard(aTag)
  const cardB = usePlayerCard(bTag ?? aTag)
  const [fromCard] = useState(openedFromCard)
  useEffect(() => () => markFromCard(false), [])
  // One fixed call per category, so the hooks keep their order; each is the list Stats already shares.
  const matrices: { label: string; data: Matrix | null }[] = CATS.map((c) => ({ label: c.label, data: useMatrix(c.id).data })) // eslint-disable-line react-hooks/rules-of-hooks

  const sections = useMemo(() => {
    if (!a || !b) return []
    const level = (m: Matrix | null, p: Player) => {
      const row = m?.players.find((x) => x.tag === p.tag)
      return row && m ? progress(row.levels, m.units) : null
    }
    const maxed = (m: Matrix | null, p: Player) => {
      const row = m?.players.find((x) => x.tag === p.tag)
      return row && m ? m.units.filter((u, i) => isMaxed(row.levels[i], u)).length : null
    }
    const heroesA = cardA?.heroes ?? [], heroesB = cardB?.heroes ?? []
    return [
      { title: 'War', lines: [
        { label: 'Score', a: a.score ?? null, b: b.score ?? null, show: fmtScore as (v: number) => string },
        { label: '3★ rate', a: threeStar(a, cardA), b: threeStar(b, cardB), show: percent },
        { label: 'Attacks missed', a: missed(a, cardA), b: missed(b, cardB), show: percent, low: true },
        { label: 'Best 3★ streak', a: cardA?.streaks?.three_stars_best ?? null, b: cardB?.streaks?.three_stars_best ?? null },
        { label: 'War stars', a: cardA?.war_stars ?? null, b: cardB?.war_stars ?? null },
      ] as Line[] },
      { title: 'Upgrades', lines: matrices.map((m) => ({ label: m.label, a: level(m.data, a), b: level(m.data, b), show: percent })) as Line[] },
      { title: 'Heroes', lines: heroesA.flatMap((h) => {
        const other = heroesB.find((x) => x.name === h.name)
        return other ? [{ label: h.name.split(' ').pop() ?? h.name, unit: h.name, a: h.level, b: other.level }] : []
      }) as Line[] },
      { title: 'Equipment maxed', lines: [{ label: 'Pieces', a: maxed(matrices[1].data, a), b: maxed(matrices[1].data, b) }] as Line[] },
      { title: 'Family', lines: [
        { label: 'Donated', a: cardA?.donations ?? null, b: cardB?.donations ?? null },
        { label: 'Received', a: cardA?.donations_received ?? null, b: cardB?.donations_received ?? null },
        { label: 'Capital', a: cardA?.capital ?? null, b: cardB?.capital ?? null },
        { label: 'Badges', a: cardA?.badges?.length ?? null, b: cardB?.badges?.length ?? null },
      ] as Line[] },
    ].filter((s) => s.lines.length)
  }, [a, b, cardA, cardB, matrices])

  if (!a) return null
  if (!b) return <Picker roster={roster} first={a} wide={wide} onClose={onClose} />

  const all = sections.flatMap((s) => s.lines)
  const leadA = all.filter((l) => ahead(l) === -1).length, leadB = all.filter((l) => ahead(l) === 1).length
  const ca = CLAN[a.clan].deep, cb = CLAN[b.clan].deep
  const person = (p: Player, leads: number, deep: string) => (
    <a href={`${window.location.hash.split('/v/')[0]}/p/${encodeURIComponent(p.tag.slice(1))}`} className="flex min-w-0 flex-col items-center gap-0.5 text-center no-underline">
      <Th th={p.th} size="lg" />
      <span className="font-display max-w-full truncate text-[17px] leading-tight" style={{ color: deep }}>{p.name}</span>
      <span className="text-[11px] font-bold text-muted">{p.clan}</span>
      <span className="font-display text-[26px] leading-none tabular-nums" style={{ color: deep }}>{leads}</span>
    </a>
  )
  return (
    <CardSheet label={`${a.name} and ${b.name}`} wide={wide} onClose={onClose} head={<>
      {fromCard && (
        <button type="button" aria-label="Back to the player card" onClick={() => window.history.back()}
          className="-ml-1 flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      <span className="font-display min-w-0 flex-auto truncate text-[22px] leading-tight text-ink">Compare</span>
    </>}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {person(a, leadA, ca)}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Ahead on</span>
          <button type="button" onClick={() => go.to(compareHref(a.tag))} className="min-h-8 cursor-pointer rounded-full border border-line bg-white px-2.5 text-xs font-bold text-ink-2 hover:bg-page">Change</button>
        </div>
        {person(b, leadB, cb)}
      </div>
      {sections.map((s) => (
        <section key={s.title} aria-label={s.title} className="flex flex-col">
          <Eyebrow className="pb-1 text-center">{s.title}</Eyebrow>
          {s.lines.map((l) => <Row key={l.label} line={l} a={ca} b={cb} />)}
        </section>
      ))}
    </CardSheet>
  )
}
