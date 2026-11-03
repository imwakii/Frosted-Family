import { CATS, type Cat, competitionRanks, isMaxed, progress, useMatrix } from '../explore'
import { groupUnits } from '../equipment'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import { CardSheet } from './ClanSheet'
import { RowChevron, Star, Th, UnitIcon } from './ui'
import { YouTag } from './You'

// One player in one upgrade category, opened from that category's list or their player card: how far along they are, and every unit in it.

export default function UpgradeSheet({ cat, tag, unit, wide, onClose }: {
  cat: Cat; tag: string; unit: string | null; wide: boolean; onClose: () => void
}) {
  const { data, loading } = useMatrix(cat)
  const label = CATS.find((c) => c.id === cat)?.label ?? ''
  if (loading) return null
  const p = data?.players.find((x) => x.tag === tag)
  if (!data || !p) {
    return (
      <CardSheet label={label} wide={wide} onClose={onClose} head={<span className="font-display truncate text-[26px] leading-tight text-ink-2">{label}</span>}>
        <p className="m-0 text-sm text-faint">{data ? 'No longer in the family' : 'Unavailable right now'}</p>
      </CardSheet>
    )
  }
  const c = CLAN[p.clan]
  const { units } = data
  const pct = progress(p.levels, units)
  const ranks = data.players.map((x) => ({ tag: x.tag, pct: Math.round(progress(x.levels, units) * 10) / 10 }))
  const place = competitionRanks(ranks, (x) => x.pct).get(ranks.find((x) => x.tag === tag)!)
  const maxed = units.filter((u, i) => isMaxed(p.levels[i], u)).length
  const facts = [
    { label, value: `${Math.round(pct)}%` },
    { label: `of ${data.players.length} in family`, value: place ? `#${place}` : '—' },
    { label: 'Maxed', value: `${maxed} of ${units.length}` },
  ]
  return (
    <CardSheet label={`${p.name}, ${label}`} wide={wide} onClose={onClose} head={<>
      <Th th={p.th} />
      <div className="flex min-w-0 flex-auto flex-col">
        <span className="font-display truncate text-[22px] leading-tight text-ink"><YouTag tag={p.tag} />{p.name}</span>
        <span className="text-xs font-bold" style={{ color: c.deep }}>{p.clan}</span>
      </div>
    </>}>
      <dl className="m-0 grid grid-cols-3 gap-2">
        {facts.map((x) => (
          <div key={x.label} className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2" style={{ background: c.tint }}>
            <dd className="font-display m-0 whitespace-nowrap text-[19px] leading-none" style={{ color: c.deep }}>{x.value}</dd>
            <dt className="whitespace-nowrap text-[11px] font-semibold text-muted">{x.label}</dt>
          </div>
        ))}
      </dl>

      {groupUnits(cat, units).map((g) => (
        <section key={g.hero ?? 'all'} aria-label={g.hero ?? label} className="flex flex-col gap-1.5">
          {g.hero && <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><UnitIcon name={g.hero} size={22} />{g.hero}</span>}
          <ul className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
            {g.idx.map((i) => {
              const u = units[i], l = p.levels[i]
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

      <a href={playerHref(p.tag)} className="flex min-h-11 flex-none items-center justify-between gap-2 rounded-xl bg-[#F6EEDC] px-3 text-sm font-bold text-ink no-underline hover:bg-well">
        Full card
        <RowChevron />
      </a>
    </CardSheet>
  )
}
