import { type ReactNode, useEffect, useState } from 'react'
import { BADGES, TIER_LOOK, TIERS } from '../badges'
import { CATS, competitionRanks, isMaxed, tenth, useMatrix } from '../explore'
import { markFromCard, markStatFromCard, openedStatFromCard, playerHref, type StatKind, upgradeHref } from '../route'
import type { ClanName } from '../types'
import { type Earned, medals, medalScore, type Row as BadgeRow } from './BadgesBoard'
import { CardSheet } from './ClanSheet'
import { COLOR } from './ClansBoard'
import type { Cap, Games, Gift } from './ExploreTab'
import { Bar, combine, pct1 } from './OverallBoard'
import { type Row as BoardRow, useBoard } from './RankBoard'
import { Facts } from './UpgradeSheet'
import { GoblinNote, RowChevron, Star, UnitIcon } from './ui'
import { SheetTitle, TitleHolder } from './FitName'

// How one player came to their figure on a Stats board, opened from that board's row: Overall, Donations or Capital.

type Who = { tag: string; name: string; clan: ClanName; th: number | null }

const num = (v: number) => v.toLocaleString('en-GB')
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : num(v))
const share = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '—')
const LIST = 'm-0 flex-none list-none divide-y divide-hair rounded-2xl border border-line bg-white p-0'
const NOTE = 'm-0 flex-none px-1 text-xs leading-[1.45] text-muted'


const Loading = () => <div aria-busy="true" aria-label="Loading" className="h-40 flex-none animate-pulse rounded-2xl bg-well" />
const Missing = ({ known }: { known: boolean }) => <p className="m-0 text-sm text-faint">{known ? 'No longer in the family' : 'Unavailable right now'}</p>

function Sheet({ who, label, wide, onClose, fromCard, children }: { who: Who | null; label: string; wide: boolean; onClose: () => void; fromCard?: boolean; children: ReactNode }) {
  return (
    <CardSheet label={who ? `${who.name}, ${label}` : label} wide={wide} onClose={onClose} head={<>
      {who ? <SheetTitle th={who.th} name={who.name} sub={`${who.clan} · ${who.tag}`} /> : <TitleHolder />}
      {fromCard ? (
        <button type="button" aria-label="Back to the player card" onClick={() => window.history.back()}
          className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      ) : <span aria-hidden="true" className="size-11 flex-none" />}{/* Holds the back button's place, so a long name is one size on every card. */}
    </>}>
      {children}
      {who && !fromCard && <a href={playerHref(who.tag)} className="mt-auto flex min-h-11 flex-none items-center justify-between gap-2 rounded-xl bg-[#F6EEDC] px-3 text-sm font-bold text-ink no-underline hover:bg-well">
        Full card
        <RowChevron />
      </a>}
    </CardSheet>
  )
}

/** One figure: what it is, how they stand against the family's best, and the working where there is some. */
function Line({ label, sub, place, value, bar, color }: { label: string; sub?: string; place?: number | null; value: string; bar?: number; color: string }) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink">
      <span className="flex min-w-0 flex-auto flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="flex-none text-sm font-semibold">{label}</span>
          {sub && <span className="truncate text-xs text-faint">{sub}</span>}
        </span>
        {bar !== undefined && <Bar v={bar} color={color} />}
      </span>
      {place != null && <span className="w-9 flex-none text-right text-xs font-bold tabular-nums text-faint">#{place}</span>}
      <span className="w-[72px] flex-none text-right text-sm font-extrabold tabular-nums">{value}</span>
    </li>
  )
}

function OverallSheet({ tag, wide, onClose }: { tag: string; wide: boolean; onClose: () => void }) {
  // One hook per category, in the fixed CATS order.
  const boards = CATS.map((c) => useMatrix(c.id)) // eslint-disable-line react-hooks/rules-of-hooks
  if (boards.some((b) => b.loading)) return <Sheet who={null} label="Overall" wide={wide} onClose={onClose}><Loading /></Sheet>
  const all = combine(boards.map((b) => b.data))
  const r = all.find((x) => x.tag === tag)
  if (!r) return <Sheet who={null} label="Overall" wide={wide} onClose={onClose}><Missing known={all.length > 0} /></Sheet>
  const place = competitionRanks(all, (x) => tenth(x.overall)).get(r)
  const counted = CATS.filter((_, i) => boards[i].data)
  const maxedCats = counted.filter((c) => (r.cats[c.id] ?? 0) >= 100).length
  const color = COLOR[r.clan]
  return (
    <Sheet who={r} label="Overall" wide={wide} onClose={onClose}>
      <Facts color={r.clan} facts={[
        { label: 'Overall', value: pct1(r.overall) },
        { label: `of ${all.length} in family`, value: place ? `#${place}` : '—' },
        { label: 'Maxed', value: `${maxedCats} of ${counted.length}` },
      ]} />
      <ul className={LIST}>
        {counted.map((c) => {
          const m = boards[CATS.indexOf(c)].data!
          const me = m.players.find((x) => x.tag === tag)
          const v = r.cats[c.id]
          const rank = v === undefined ? null : competitionRanks(all, (x) => (x.cats[c.id] === undefined ? null : tenth(x.cats[c.id]!))).get(r)
          const maxed = me ? m.units.filter((u, i) => isMaxed(me.levels[i], u)).length : 0
          return (
            <li key={c.id}>
              <a href={upgradeHref(c.id, tag)} onClick={() => markFromCard(true)} className="flex min-h-[52px] items-center gap-2.5 py-1.5 pl-3 pr-3.5 text-ink no-underline hover:bg-hover">
                <UnitIcon name={c.icon} size={30} />
                <span className="flex min-w-0 flex-auto flex-col gap-1">
                  <span className="flex min-w-0 items-baseline justify-between gap-1.5">
                    <span className="flex-none text-sm font-semibold">{c.label}</span>
                    <span className="flex-none text-xs tabular-nums text-faint">{maxed}/{m.units.length}<Star /></span>
                  </span>
                  <Bar v={v ?? 0} color={color} />
                </span>
                <span className="w-9 flex-none text-right text-xs font-bold tabular-nums text-faint">{rank ? `#${rank}` : '—'}</span>
                <span className="w-14 flex-none text-right text-sm font-extrabold tabular-nums">{pct1(v ?? 0)}</span>
                <RowChevron />
              </a>
            </li>
          )
        })}
        <li className="flex min-h-11 items-center justify-between gap-3 rounded-b-2xl bg-[#FBF5E6] py-1.5 pl-3 pr-[34px] text-sm font-extrabold text-ink">
          <span>Average of the {counted.length}</span>
          <span className="tabular-nums">{pct1(r.overall)}</span>
        </li>
      </ul>
    </Sheet>
  )
}

function DonationSheet({ tag, wide, onClose }: { tag: string; wide: boolean; onClose: () => void }) {
  const { data, loading } = useBoard('donations')
  if (loading) return <Sheet who={null} label="Donations" wide={wide} onClose={onClose}><Loading /></Sheet>
  const r = data?.players.find((x) => x.tag === tag)
  if (!data || !r) return <Sheet who={null} label="Donations" wide={wide} onClose={onClose}><Missing known={!!data} /></Sheet>
  const gift = (x: BoardRow) => x.donations as Gift
  const ratio = (x: BoardRow) => { const d = gift(x); return d && d.received ? d.donated / d.received : null }
  const rank = (v: (x: BoardRow) => number | null) => competitionRanks(data.players, v).get(r)
  const best = (v: (x: BoardRow) => number | null) => Math.max(1, ...data.players.map((x) => v(x) ?? 0))
  const d = gift(r)
  const donated = (x: BoardRow) => gift(x)?.donated ?? null
  const received = (x: BoardRow) => gift(x)?.received ?? null
  const clanTotal = data.players.filter((x) => x.clan === r.clan).reduce((s, x) => s + (donated(x) ?? 0), 0)
  const ranked = data.players.filter((x) => gift(x)).length
  const place = rank(donated)
  const color = COLOR[r.clan]
  return (
    <Sheet who={r} label="Donations" wide={wide} onClose={onClose}>
      {!d ? <GoblinNote box goblin="bored">No donations on record yet. Their Clan Castle is gathering dust</GoblinNote> : (
        <>
          <Facts color={r.clan} facts={[
            { label: 'Donated', value: num(d.donated) },
            { label: `of ${ranked} in family`, value: place ? `#${place}` : '—' },
            { label: `of ${r.clan}'s total`, value: share(d.donated, clanTotal) },
          ]} />
          <ul className={LIST}>
            <Line label="Received" place={rank(received)} value={num(d.received)} bar={(100 * d.received) / best(received)} color={color} />
            <Line label="Ratio" sub={d.received ? `${num(d.donated)} ÷ ${num(d.received)}` : 'Nothing received yet'} place={rank(ratio)} value={d.received ? (d.donated / d.received).toFixed(1) : '—'} color={color} />
          </ul>
          <p className={NOTE}>This season's troops and spells so far. The game resets them when the season ends.</p>
        </>
      )}
    </Sheet>
  )
}

function CapitalSheet({ tag, wide, onClose }: { tag: string; wide: boolean; onClose: () => void }) {
  const { data, loading } = useBoard('capital')
  if (loading) return <Sheet who={null} label="Capital" wide={wide} onClose={onClose}><Loading /></Sheet>
  const r = data?.players.find((x) => x.tag === tag)
  if (!data || !r) return <Sheet who={null} label="Capital" wide={wide} onClose={onClose}><Missing known={!!data} /></Sheet>
  const cap = (x: BoardRow) => x.capital as Cap
  const contributed = (x: BoardRow) => cap(x)?.contributed ?? null
  const loot = (x: BoardRow) => cap(x)?.raid_loot ?? null
  const attacks = (x: BoardRow) => cap(x)?.raid_attacks ?? null
  const perAttack = (x: BoardRow) => { const l = loot(x), a = attacks(x); return l !== null && a ? l / a : null }
  const rank = (v: (x: BoardRow) => number | null) => competitionRanks(data.players, v).get(r)
  const best = (v: (x: BoardRow) => number | null) => Math.max(1, ...data.players.map((x) => v(x) ?? 0))
  const c = cap(r)
  const clan = data.players.filter((x) => x.clan === r.clan)
  const clanRaided = clan.some((x) => attacks(x) !== null)
  const clanLoot = clan.reduce((s, x) => s + (loot(x) ?? 0), 0)
  const myLoot = loot(r), myAttacks = attacks(r), mine = perAttack(r)
  const held = contributed(r)
  const inFamily = data.players.filter((x) => contributed(x) !== null).length
  const color = COLOR[r.clan]
  return (
    <Sheet who={r} label="Capital" wide={wide} onClose={onClose}>
      <Facts color={r.clan} facts={[
        { label: 'All-time', value: held === null ? '—' : short(held) },
        { label: `of ${inFamily} in family`, value: rank(contributed) ? `#${rank(contributed)}` : '—' },
        { label: `of ${r.clan}'s last loot`, value: myLoot === null ? '—' : share(myLoot, clanLoot) },
      ]} />
      <section aria-label="Last raid" className="flex flex-none flex-col gap-1.5">
        <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">Last raid</span>
        {myLoot === null || !c ? (
          <GoblinNote box goblin="bored">{clanRaided ? `Not in ${r.clan}'s last raid. Their hammer stayed in the shed` : `No raid on record for ${r.clan} yet`}</GoblinNote>
        ) : (
          <ul className={LIST}>
            <Line label="Loot" place={rank(loot)} value={num(myLoot)} bar={(100 * myLoot) / best(loot)} color={color} />
            <Line label="Attacks" place={rank(attacks)} value={myAttacks === null ? '—' : num(myAttacks)} color={color} />
            <Line label="Per attack" sub={myAttacks ? `${num(myLoot)} ÷ ${myAttacks}` : undefined} place={rank(perAttack)} value={mine === null ? '—' : num(Math.round(mine))} color={color} />
          </ul>
        )}
      </section>
      <p className={NOTE}>All-time is everything they've put into Capital halls in their whole Clash career, in any clan.</p>
    </Sheet>
  )
}

function GamesSheet({ tag, wide, onClose }: { tag: string; wide: boolean; onClose: () => void }) {
  const { data, loading } = useBoard('games')
  if (loading) return <Sheet who={null} label="Clan Games" wide={wide} onClose={onClose}><Loading /></Sheet>
  const r = data?.players.find((x) => x.tag === tag)
  if (!data || !r) return <Sheet who={null} label="Clan Games" wide={wide} onClose={onClose}><Missing known={!!data} /></Sheet>
  const g = (x: BoardRow) => x.games as Games
  const month = (x: BoardRow) => g(x)?.month ?? null
  const last = (x: BoardRow) => g(x)?.last_month ?? null
  const total = (x: BoardRow) => g(x)?.total ?? null
  const rank = (v: (x: BoardRow) => number | null) => competitionRanks(data.players, v).get(r)
  const best = (v: (x: BoardRow) => number | null) => Math.max(1, ...data.players.map((x) => v(x) ?? 0))
  const inFamily = data.players.filter((x) => total(x) !== null).length
  const color = COLOR[r.clan]
  const mine = month(r), before = last(r), all = total(r)
  return (
    <Sheet who={r} label="Clan Games" wide={wide} onClose={onClose}>
      <Facts color={r.clan} facts={[
        { label: 'All-time', value: all === null ? '—' : short(all) },
        { label: `of ${inFamily} in family`, value: rank(total) ? `#${rank(total)}` : '—' },
        { label: 'This month', value: mine === null ? '—' : num(mine) },
      ]} />
      {mine === null && before === null ? (
        <GoblinNote box goblin="bored">No Clan Games on record for them yet</GoblinNote>
      ) : (
        <ul className={LIST}>
          <Line label="This month" place={rank(month)} value={mine === null ? '—' : num(mine)} bar={mine === null ? undefined : (100 * mine) / best(month)} color={color} />
          <Line label="Last month" place={rank(last)} value={before === null ? '—' : num(before)} bar={before === null ? undefined : (100 * before) / best(last)} color={color} />
        </ul>
      )}
      <p className={NOTE}>The game keeps a lifetime count of Clan Games points, so a month is how far that count rose in it.</p>
    </Sheet>
  )
}

/** A badge's three tiers, with the one this player holds picked out. */
function Ladder({ id, tier }: { id: string; tier?: Earned['tier'] }) {
  return (
    <span className="grid grid-cols-3 gap-1.5">
      {TIERS.map((t, i) => (
        <span key={t} className={`rounded-lg border px-1 py-0.5 text-center text-[11px] font-bold ${t === tier ? TIER_LOOK[t].on : 'border-line bg-white text-faint'}`}>{TIER_LOOK[t].name} · {BADGES[id].ladder[i]}</span>
      ))}
    </span>
  )
}

function BadgeSheet({ tag, focus, wide, onClose }: { tag: string; focus: string | null; wide: boolean; onClose: () => void }) {
  const { data, loading } = useBoard('badges')
  const [fromCard] = useState(openedStatFromCard)
  useEffect(() => () => markStatFromCard(false), [])
  if (loading) return <Sheet who={null} label="Badges" wide={wide} onClose={onClose} fromCard={fromCard}><Loading /></Sheet>
  const players = (data?.players ?? []) as unknown as BadgeRow[]
  const r = players.find((x) => x.tag === tag)
  if (!data || !r) return <Sheet who={null} label="Badges" wide={wide} onClose={onClose} fromCard={fromCard}><Missing known={!!data} /></Sheet>
  const holders = players.filter((x) => x.badges.length)
  const place = r.badges.length ? competitionRanks(holders, medalScore).get(r) : null
  const ids = Object.keys(BADGES)
  const rank = (id: string) => (id === focus ? -1 : 0)
  const held = r.badges.filter((b) => BADGES[b.id]).sort((a, b) => rank(a.id) - rank(b.id) || TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier))
  const rest = ids.filter((id) => !held.some((b) => b.id === id)).sort((a, b) => rank(a) - rank(b))
  const mark = (id: string) => (id === focus ? 'shadow-[inset_0_0_0_2px_var(--color-gold)]' : '')
  return (
    <Sheet who={r} label="Badges" wide={wide} onClose={onClose} fromCard={fromCard}>
      <Facts color={r.clan} facts={[
        { label: 'Badges', value: `${held.length} of ${ids.length}` },
        { label: `of ${holders.length} with badges`, value: place ? `#${place}` : '—' },
        { label: 'Gold', value: String(medals(r, 'gold')) },
      ]} />
      {held.length > 0 && (
        <ul className={LIST}>
          {held.map((b) => (
            <li key={b.id} className={`flex flex-col gap-1.5 px-3.5 py-2.5 first:rounded-t-2xl last:rounded-b-2xl ${mark(b.id)}`}>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{BADGES[b.id].label}</span>
                <span className="text-xs text-muted">{b.detail}</span>
              </span>
              <Ladder id={b.id} tier={b.tier} />
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <section aria-label="Still to earn" className="flex flex-none flex-col gap-1.5">
          <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">Still to earn</span>
          <ul className={LIST}>
            {rest.map((id) => (
              <li key={id} className={`flex flex-col gap-1.5 px-3.5 py-2.5 first:rounded-t-2xl last:rounded-b-2xl ${mark(id)}`}>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-ink-2">{BADGES[id].label}</span>
                  <span className="text-xs text-muted">{BADGES[id].means}</span>
                </span>
                <Ladder id={id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  )
}

export default function StatSheet({ kind, tag, focus, wide, onClose }: { kind: StatKind; tag: string; focus: string | null; wide: boolean; onClose: () => void }) {
  if (kind === 'badges') return <BadgeSheet tag={tag} focus={focus} wide={wide} onClose={onClose} />
  if (kind === 'overall') return <OverallSheet tag={tag} wide={wide} onClose={onClose} />
  if (kind === 'donations') return <DonationSheet tag={tag} wide={wide} onClose={onClose} />
  if (kind === 'games') return <GamesSheet tag={tag} wide={wide} onClose={onClose} />
  return <CapitalSheet tag={tag} wide={wide} onClose={onClose} />
}
