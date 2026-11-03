import { useEffect, useState } from 'react'
import { loadPlayerAll, type PlayerCard, playerNow } from '../data'
import { markFromCard, openedFromCard, playerHref } from '../route'
import type { Roster } from '../types'
import { CardSheet } from './ClanSheet'
import { chip, Stars, Th } from './ui'

// One player's attacks over the last 7 or 30 days, a war at a time. Opens from Latest attacks on their card.

const DAY = 86_400_000
type Range = 7 | 30
type Attack = NonNullable<PlayerCard['attack_history']>[number]

const warLabel = (a: Attack) => (a.kind === 'cwl' ? `CWL day ${a.day ?? '?'} · ${a.opponent ?? ''}` : a.opponent ?? 'War')

export default function AttackHistory({ tag, days: start, roster, wide, onClose }: { tag: string; days: Range; roster: Roster; wide: boolean; onClose: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(() => playerNow(tag)?.card ?? null)
  const [days, setDays] = useState<Range>(start)
  const [fromCard] = useState(openedFromCard)
  useEffect(() => () => markFromCard(false), [])
  useEffect(() => {
    let live = true
    if (!playerNow(tag)) loadPlayerAll(tag).then((x) => { if (live) setCard(x.card) })
    else setCard(playerNow(tag)?.card ?? null)
    return () => { live = false }
  }, [tag])
  const p = roster.players.find((x) => x.tag === tag)
  const cut = new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
  const hits = (card?.attack_history ?? []).filter((a) => a.date >= cut)
  const stars = hits.reduce((n, a) => n + a.stars, 0)
  const byWar = new Map<string, Attack[]>()
  hits.forEach((a) => byWar.set(a.war_key, [...(byWar.get(a.war_key) ?? []), a]))
  return (
    <CardSheet label={`${p?.name ?? 'Player'}'s attacks`} wide={wide} onClose={onClose} head={<>
      {fromCard && (
        <button type="button" aria-label="Back to the player card" onClick={() => window.history.back()}
          className="-ml-1 flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      <a href={playerHref(tag)} className="flex min-w-0 flex-auto items-center gap-2.5 text-ink no-underline">
        {p && <Th th={p.th} />}
        <span className="flex min-w-0 flex-col">
          <span className="font-display truncate text-[22px] leading-tight">{p?.name ?? tag}</span>
          <span className="text-xs text-muted">{card ? `${hits.length} ${hits.length === 1 ? 'attack' : 'attacks'} · ${stars}★` : ' '}</span>
        </span>
      </a>
    </>}>
      <div role="group" aria-label="Range" className="flex flex-none gap-1.5">
        {([7, 30] as const).map((d) => <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={chip(d === days)}>{d} days</button>)}
      </div>
      {!card ? <div aria-busy="true" aria-label="Loading" className="h-40 flex-none animate-pulse rounded-2xl bg-well" />
        : !hits.length ? <p className="m-0 rounded-2xl border border-line bg-white p-5 text-sm text-faint">No attacks in the last {days} days</p>
        : [...byWar.entries()].map(([key, rows]) => (
          <section key={key} aria-label={warLabel(rows[0])} className="flex flex-none flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-2 px-1">
              <span className="truncate text-xs font-bold uppercase tracking-[0.06em] text-faint">{warLabel(rows[0])}</span>
              <span className="flex-none text-xs text-faint">{new Date(`${rows[0].date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            </span>
            <ul className="m-0 list-none divide-y divide-hair rounded-2xl border border-line bg-white p-0">
              {rows.map((a, i) => (
                <li key={i} className="flex min-h-12 items-center gap-2.5 px-3 py-1.5 text-sm">
                  <Th th={a.target_th} />
                  <span className="min-w-0 flex-auto truncate font-semibold text-ink">{a.target ?? 'Unknown'}</span>
                  <Stars n={a.stars} />
                  <span className="w-10 flex-none text-right text-xs font-bold tabular-nums text-ink-2">{Math.round(a.destruction)}%</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </CardSheet>
  )
}
