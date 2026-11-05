import { useEffect, useRef, useState } from 'react'
import { CATS, type Cat, competitionRanks, isMaxed, preloadMatrices, progress, tenth, useMatrix } from '../explore'
import { groupUnits } from '../equipment'
import { markFromCard, openedFromCard, playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { CardSheet } from './ClanSheet'
import { chip, RowChevron, Star, UnitIcon } from './ui'
import { SheetTitle, TitleHolder } from './FitName'

// One player in one upgrade category, opened from that category's list or their player card: how far along they are, and every unit in it.
// The chips change category in place, at one height, so nothing moves under the thumb.

/** The three headline figures at the top of a player's sheet, in their clan's colours. */
export function Facts({ color, facts }: { color: ClanName; facts: { label: string; value: string }[] }) {
  const c = CLAN[color]
  return (
    <dl className="m-0 grid flex-none grid-cols-3 gap-2">
      {facts.map((x) => (
        <div key={x.label} className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2" style={{ background: c.tint }}>
          <dd className="font-display m-0 whitespace-nowrap text-[19px] leading-none" style={{ color: c.deep }}>{x.value}</dd>
          <dt className="whitespace-nowrap text-[11px] font-semibold text-muted">{x.label}</dt>
        </div>
      ))}
    </dl>
  )
}

export default function UpgradeSheet({ cat: start, tag, unit, wide, onClose }: {
  cat: Cat; tag: string; unit: string | null; wide: boolean; onClose: () => void
}) {
  const [cat, setCat] = useState<Cat>(start)
  const { data, loading } = useMatrix(cat)
  const [fromCard] = useState(openedFromCard)
  useEffect(() => () => markFromCard(false), [])
  useEffect(preloadMatrices, [])
  // Opened on a category further along the row, its chip starts in view.
  const chips = useRef<HTMLDivElement>(null)
  useEffect(() => { chips.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [])
  const label = CATS.find((c) => c.id === cat)?.label ?? ''
  const p = data?.players.find((x) => x.tag === tag)
  // The name stays up while the next category loads.
  const seen = useRef(p)
  if (p) seen.current = p
  const who = p ?? seen.current
  let summary: { label: string; value: string }[] = []
  if (data && p) {
    const ranks = data.players.map((x) => ({ tag: x.tag, pct: tenth(progress(x.levels, data.units)) }))
    const place = competitionRanks(ranks, (x) => x.pct).get(ranks.find((x) => x.tag === tag)!)
    summary = [
      { label, value: `${tenth(progress(p.levels, data.units)).toFixed(1)}%` },
      { label: `of ${data.players.length} in family`, value: place ? `#${place}` : '—' },
      { label: 'Maxed', value: `${data.units.filter((u, i) => isMaxed(p.levels[i], u)).length} of ${data.units.length}` },
    ]
  }
  return (
    <CardSheet label={who ? `${who.name}, ${label}` : label} wide={wide} onClose={onClose} head={<>
      {who ? <SheetTitle th={who.th} name={who.name} sub={`${who.clan} · ${who.tag}`} />
        : <TitleHolder />}
      {/* Holds the back button's place, so a long name is one size on every card. */}
      {!fromCard && <span aria-hidden="true" className="size-11 flex-none" />}
      {fromCard && (
        <button type="button" aria-label="Back" onClick={() => window.history.back()}
          className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
    </>}>
      <div ref={chips} role="group" aria-label="Category" className={`flex flex-none gap-1.5 ${wide ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:none]'}`}>
        {CATS.map((x) => <button key={x.id} type="button" aria-pressed={x.id === cat} onClick={() => setCat(x.id)} className={`${chip(x.id === cat)} flex-none`}>{x.label}</button>)}
      </div>
      {loading ? <div aria-busy="true" aria-label="Loading" className="min-h-0 flex-auto animate-pulse rounded-2xl bg-well" />
        : !data || !p ? <p className="m-0 min-h-0 flex-auto text-sm text-faint">{data ? 'No longer in the family' : 'Unavailable right now'}</p>
        : <>
          <Facts color={p.clan} facts={summary} />
          <div key={cat} className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto">
            {groupUnits(cat, data.units).map((g) => (
              <section key={g.hero ?? 'all'} aria-label={g.hero ?? label} className="flex flex-none flex-col gap-1.5">
                {g.hero && <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><UnitIcon name={g.hero} size={22} />{g.hero}</span>}
                <ul className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
                  {g.idx.map((i) => {
                    const u = data.units[i], l = p.levels[i]
                    return (
                      <li key={u.name} title={u.name} className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 ${u.name === unit ? 'shadow-[inset_0_0_0_2px_var(--color-gold)]' : ''} ${l ? 'bg-[#F6EEDC]' : 'bg-[#F6EEDC]/50'}`}>
                        <span className={l ? '' : 'opacity-40 grayscale'}><UnitIcon name={u.name} size={36} /></span>
                        <span className={`whitespace-nowrap text-[11px] tabular-nums ${isMaxed(l, u) ? 'font-extrabold text-ink' : l ? 'font-semibold text-muted' : 'text-faint'}`}>
                          {l ? `${l}/${u.max}` : 'Locked'}{isMaxed(l, u) && <Star />}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>}
      {!fromCard && who && <a href={playerHref(who.tag)} className="flex min-h-11 flex-none items-center justify-between gap-2 rounded-xl bg-[#F6EEDC] px-3 text-sm font-bold text-ink no-underline hover:bg-well">
        Full card
        <RowChevron />
      </a>}
    </CardSheet>
  )
}
