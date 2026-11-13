import { useMemo, useState } from 'react'
import { BY_HERO } from '../equipment'
import { type Gear, useGear } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN } from '../theme'
import { norm, PhoneSearch, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { chip, UnitIcon } from './ui'

// Stats › Gear. What the family has on its heroes: the combos most run on each hero, the pieces most and least
// equipped, and over the last 7 or 30 days, how much of the time each was worn. The game says what is equipped, not
// what was used in an attack, so this is equipment on, sampled about hourly.

type View = 'now' | 7 | 30
const VIEWS: { id: View; label: string }[] = [{ id: 'now', label: 'Equipped now' }, { id: 7, label: 'Worn 7 days' }, { id: 30, label: 'Worn 30 days' }]
const KNOWN_HEROES = BY_HERO.flatMap(([h]) => (h ? [h] : []))
const HERO_OF = new Map(BY_HERO.flatMap(([h, names]) => names.map((n) => [n, h] as const)))
const SHOWN = 3
// A piece owned by at least this many members, and equipped by under a tenth of them, is gathering dust.
const DUST_OWNERS = 5, DUST_SHARE = 0.1

type Combo = { pieces: string[]; weight: number; share: number; tags: string[] }
type Piece = { name: string; hero: string; owners: number; on: number; share: number; level: number | null }

const pct = (x: number) => `${Math.round(x * 100)}%`
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Combos per hero and every owned piece, for the clan picked. Equipped now counts members; worn counts looks. */
function tally(data: Gear, view: View, clan: string) {
  const clanOf = new Map(data.members.map((m) => [m.tag, m.clan]))
  const here = (tag: string) => clan === 'All' || clanOf.get(tag) === clan
  const rows: [string, string, string[], number][] = view === 'now'
    ? data.now.filter(([t]) => here(t)).map(([t, h, p]) => [t, h, p, 1])
    : data.worn.filter(([t]) => here(t))
  const combos = new Map<string, Combo[]>()
  const onPiece = new Map<string, number>()
  const heroTotal = new Map<string, number>()
  const byKey = new Map<string, Combo>()
  for (const [tag, hero, pieces, w] of rows) {
    heroTotal.set(hero, (heroTotal.get(hero) ?? 0) + w)
    const key = `${hero}|${pieces.join('+')}`
    let c = byKey.get(key)
    if (!c) { c = { pieces, weight: 0, share: 0, tags: [] }; byKey.set(key, c); combos.set(hero, [...(combos.get(hero) ?? []), c]) }
    c.weight += w
    if (!c.tags.includes(tag)) c.tags.push(tag)
    for (const p of pieces) onPiece.set(p, (onPiece.get(p) ?? 0) + w)
  }
  for (const [hero, cs] of combos) {
    const total = heroTotal.get(hero) || 1
    cs.forEach((c) => { c.share = c.weight / total })
    cs.sort((a, b) => b.weight - a.weight || a.pieces.join().localeCompare(b.pieces.join()))
  }
  // Pieces: owners and levels from what members own; how often on from the same rows as the combos.
  const owned = new Map<string, { owners: number; levels: number[] }>()
  for (const [tag, list] of Object.entries(data.owned)) {
    if (!here(tag)) continue
    for (const [name, level] of list) {
      const o = owned.get(name) ?? { owners: 0, levels: [] }
      o.owners += 1; o.levels.push(level); owned.set(name, o)
    }
  }
  // A piece this page doesn't know the hero of yet (new to the game) is left out until equipment.ts lists it.
  const pieces: Piece[] = [...owned.entries()].filter(([name]) => HERO_OF.has(name)).map(([name, o]) => {
    const hero = HERO_OF.get(name)!
    // Now: members with it on, of those who own it. Worn: its share of all that hero's looks.
    const on = onPiece.get(name) ?? 0
    const share = view === 'now' ? on / o.owners : on / (heroTotal.get(hero) || 1)
    return { name, hero, owners: o.owners, on, share, level: o.levels.length ? Math.round(o.levels.reduce((a, b) => a + b, 0) / o.levels.length) : null }
  })
  return { combos, pieces, heroTotal }
}

function Bar({ share }: { share: number }) {
  return (
    <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-well">
      <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
    </span>
  )
}

function ComboRow({ c, view, members, open, onToggle }: { c: Combo; view: View; members: Map<string, Gear['members'][number]>; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-t border-hair">
      <button type="button" aria-expanded={open} onClick={onToggle}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-1.5 text-left hover:bg-hover">
        <span className="flex flex-none -space-x-1.5">{c.pieces.map((p) => <span key={p} className="flex size-8 items-center justify-center rounded-lg bg-well"><UnitIcon name={p} size={28} /></span>)}</span>
        <span className="flex min-w-0 flex-auto flex-col gap-1">
          <span className="truncate text-[13px] font-semibold text-ink">{c.pieces.join(' + ')}</span>
          <Bar share={c.share} />
        </span>
        <span className="flex w-14 flex-none flex-col items-end">
          <span className="text-sm font-bold tabular-nums text-ink">{pct(c.share)}</span>
          <span className="text-[11px] font-semibold tabular-nums text-faint">{c.tags.length} {view === 'now' ? (c.tags.length === 1 ? 'runs it' : 'run it') : (c.tags.length === 1 ? 'player' : 'players')}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {c.tags.map((t) => members.get(t)).filter((m) => !!m).sort((a, b) => a!.name.localeCompare(b!.name)).map((m) => (
            <a key={m!.tag} href={playerHref(m!.tag)} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold no-underline hover:bg-hover" style={{ color: CLAN[m!.clan].deep }}>{m!.name}</a>
          ))}
        </div>
      )}
    </li>
  )
}

function PieceRow({ p, view, tag = true }: { p: Piece; view: View; tag?: boolean }) {
  const dust = tag && view === 'now' && p.owners >= DUST_OWNERS && p.share < DUST_SHARE
  return (
    <li className="flex min-h-[44px] items-center gap-2.5 border-t border-hair px-3 py-1">
      <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-well"><UnitIcon name={p.name} size={28} /></span>
      <span className="flex min-w-0 flex-auto flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
          {dust && <span className="flex-none rounded-full bg-[#F6EEDC] px-1.5 py-px text-[10px] font-bold text-muted">Gathering dust</span>}
        </span>
        <Bar share={p.share} />
      </span>
      <span className="flex flex-none flex-col items-end">
        <span className="text-sm font-bold tabular-nums text-ink">{pct(p.share)}</span>
        <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-faint">{p.owners} own · lv {p.level ?? '—'}</span>
      </span>
    </li>
  )
}

function HeroCard({ hero, combos, pieces, view, members }: { hero: string; combos: Combo[]; pieces: Piece[]; view: View; members: Map<string, Gear['members'][number]> }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const shown = all ? combos : combos.slice(0, SHOWN)
  return (
    <section aria-label={hero} className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <UnitIcon name={hero} size={30} />
        <span className="text-sm font-bold text-ink">{hero}</span>
      </div>
      {combos.length ? (
        <ol className="m-0 list-none">
          {shown.map((c) => { const k = c.pieces.join('+'); return <ComboRow key={k} c={c} view={view} members={members} open={open === k} onToggle={() => setOpen(open === k ? null : k)} /> })}
        </ol>
      ) : <p className="m-0 border-t border-hair px-3 py-5 text-center text-sm font-semibold text-faint">Nobody's dressed this hero up yet</p>}
      {combos.length > SHOWN && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}
          className="min-h-11 w-full cursor-pointer border-0 border-t border-hair bg-transparent text-[13px] font-bold text-action">{all ? 'Show fewer' : `Show all ${combos.length} combos`}</button>
      )}
      <div className="border-t border-line bg-page/40 px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Pieces</div>
      <ul className="m-0 list-none">{pieces.map((p) => <PieceRow key={p.name} p={p} view={view} />)}</ul>
    </section>
  )
}

export default function GearBoard({ q, setQ, wide }: { q: string; setQ: (v: string) => void; wide: boolean }) {
  const [clan, setClan] = useClanPick()
  const [view, setView] = useState<View>('now')
  const { data, loading } = useGear(view === 7 ? 7 : 30)
  const nq = norm(q.trim())
  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.tag, m])), [data])
  const t = useMemo(() => (data ? tally(data, view, clan) : null), [data, view, clan])
  // A name search shows that member's own loadout on each hero instead.
  const found = nq && data ? data.members.filter((m) => norm(m.name).includes(nq) || m.tag.toLowerCase().includes(nq)).slice(0, 8) : []
  // Both lists rank by the same share each row shows, among pieces enough members own to say something.
  const most = t ? t.pieces.filter((p) => p.on && p.owners >= DUST_OWNERS).sort((a, b) => b.share - a.share || b.owners - a.owners).slice(0, 5) : []
  const dust = t && view === 'now' ? t.pieces.filter((p) => p.owners >= DUST_OWNERS).sort((a, b) => a.share - b.share || b.owners - a.owners).slice(0, 5) : []
  const started = !!data?.since && !!data.from && view !== 'now' && data.since > data.from
  // A hero new to the game still gets a card from what members have on it.
  const heroes = [...KNOWN_HEROES, ...new Set((data?.now ?? []).map(([, h]) => h).filter((h) => !KNOWN_HEROES.includes(h)))]

  const body = !data || !t ? <Empty loading={loading} /> : (
    <>
      <div role="group" aria-label="View" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={chip(view === v.id)}>{v.label}</button>)}
      </div>
      <p className="m-0 px-1 text-xs font-semibold text-faint">{view === 'now' ? 'Share of members running each combo, and of owners with each piece on' : `Share of the time each was on${started ? `, since ${day(data.since!)}` : ''}`}</p>
      {nq ? (
        found.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {found.map((m) => {
              const mine = data.now.filter(([tag]) => tag === m.tag)
              return (
                <li key={m.tag} className="rounded-2xl border border-line bg-white px-3 py-2.5">
                  <a href={playerHref(m.tag)} className="text-sm font-bold no-underline" style={{ color: CLAN[m.clan].deep }}>{m.name}</a>
                  <ul className="m-0 mt-1.5 grid list-none gap-1.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {heroes.map((h) => { const on = mine.find(([, hero]) => hero === h)?.[2]; return on ? (
                      <li key={h} className="flex items-center gap-2 text-xs font-semibold text-ink-2"><UnitIcon name={h} size={22} />{on.join(' + ')}</li>
                    ) : null })}
                  </ul>
                </li>
              )
            })}
          </ul>
        ) : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">No one by that name in this village</div>
      ) : (
        <>
          <div className={`grid gap-3 ${dust.length ? 'md:grid-cols-2' : ''}`}>
            <section aria-label="Most equipped" className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="px-3 py-2.5 text-sm font-bold text-ink">Most equipped</div>
              <ul className="m-0 list-none">{most.map((p) => <PieceRow key={p.name} p={p} view={view} />)}</ul>
            </section>
            {dust.length > 0 && (
              <section aria-label="Gathering dust" className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="px-3 py-2.5 text-sm font-bold text-ink">Gathering dust</div>
                <ul className="m-0 list-none">{dust.map((p) => <PieceRow key={p.name} p={p} view={view} tag={false} />)}</ul>
              </section>
            )}
          </div>
          <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
            {heroes.map((h) => (
              <HeroCard key={`${h}|${clan}|${view}`} hero={h} view={view} members={members} combos={t.combos.get(h) ?? []}
                pieces={t.pieces.filter((p) => p.hero === h).sort((a, b) => b.share - a.share || b.owners - a.owners)} />
            ))}
          </div>
        </>
      )}
    </>
  )

  const enter = () => { if (found[0]) go.to(playerHref(found[0].tag)) }
  return wide ? (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div className="flex items-center justify-between gap-4">
        <ClanFilter clan={clan} setClan={setClan} />
        <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      </div>
      {body}
    </main>
  ) : (
    <div className="flex flex-col gap-2.5 pb-6">
      <PhoneSearch q={q} setQ={setQ} onEnter={enter}><ClanFilter clan={clan} setClan={setClan} /></PhoneSearch>
      <div className="flex flex-col gap-2.5 px-4">{body}</div>
    </div>
  )
}
