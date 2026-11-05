import { useEffect, useState } from 'react'
import { type LogEvent, useClanLog, useRecap, type Recap as Month, type RecapPlace } from '../leaders'
import { attacksHref, historyHref, markFromCard, statHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName, Roster } from '../types'
import Info from './Info'
import { EventRow, MilestoneRow } from './LogTab'
import { fit, shareCanvas } from './WarRecap'
import { Eyebrow, GoblinNote, Picker, RowChevron, Th } from './ui'

// One month in the family, to look back on and post in Discord. The month in progress updates as it goes.

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const count = (n: number) => n.toLocaleString('en-GB')
const pct = (p: RecapPlace) => `${Math.round((p.rate ?? 0) * 100)}%`
const dayOf = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const POSTED: Record<LogEvent['kind'], 'joined' | 'left' | 'moved' | null> = { joined: 'joined', rejoined: 'joined', left: 'left', moved: 'moved', visited: null, promoted: null, demoted: null }

// Each award opens the card behind it, as a row on Stats does.
function Award({ title, places, value, unit, href }: { title: string; places: RecapPlace[]; value: (p: RecapPlace) => string; unit: (p: RecapPlace) => string; href: (tag: string) => string }) {
  const [top, ...next] = places
  const open = () => markFromCard(false)
  return (
    <article className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-white px-3.5 py-3">
      <h3 className="font-display m-0 text-lg font-normal leading-tight text-[#92400E]">{title}</h3>
      <a href={href(top.tag)} onClick={open} className="flex min-h-11 items-center gap-2.5 text-ink no-underline">
        <Th th={top.th} />
        <span className="flex min-w-0 flex-auto flex-col leading-tight">
          <span className="truncate text-[15px] font-bold">{top.name}</span>
          <span className="text-xs font-bold" style={{ color: CLAN[top.clan].deep }}>{top.clan}</span>
        </span>
        <span className="flex flex-none flex-col items-end leading-tight">
          <span className="font-display text-[26px] leading-none tabular-nums">{value(top)}</span>
          <span className="text-xs text-muted">{unit(top)}</span>
        </span>
        <RowChevron />
      </a>
      {next.length > 0 && (
        <p className="m-0 flex flex-wrap items-center gap-x-1 text-xs text-muted">
          Next
          {next.map((p) => <a key={p.tag} href={href(p.tag)} onClick={open} className="flex min-h-8 items-center rounded-full px-1.5 font-semibold text-ink-2 no-underline hover:bg-hover">{p.name}&nbsp;<span className="font-bold tabular-nums">{value(p)}</span></a>)}
        </p>
      )}
    </article>
  )
}

// One row a race, the clans in their usual order, with the month's leader picked out.
function Races({ rows }: { rows: { title: string; totals: Record<ClanName, number> }[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(58px,auto))] items-center rounded-2xl border border-line bg-white px-3.5 py-2 text-sm">
      <span />
      {CLANS.map((k) => <span key={k} className="py-1 text-right text-xs font-bold" style={{ color: CLAN[k].deep }}>{k}</span>)}
      {rows.map(({ title, totals }) => {
        const top = Math.max(...CLANS.map((k) => totals[k]))
        return [
          <span key={title} className="min-w-0 truncate border-t border-hair py-2 font-semibold text-ink">{title}</span>,
          ...CLANS.map((k) => (
            <span key={`${title}-${k}`} className={`border-t border-hair py-2 pl-2 text-right tabular-nums ${totals[k] === top && top > 0 ? 'font-extrabold text-ink' : 'text-muted'}`}>{count(totals[k])}</span>
          )),
        ]
      })}
    </div>
  )
}

async function saveImage(r: Month) {
  const W = 1080, PAD = 64, ROW = 150, HEAD = 200, RACE = 240
  const awards: [string, RecapPlace | undefined, (p: RecapPlace) => string][] = [
    ['Three-Star General', r.awards.three_star[0], pct],
    ['Master Builder', r.awards.builder[0], (p) => `${count(p.n ?? 0)} upgrades`],
    ['Friend in Need', r.awards.donor[0], (p) => `${count(p.n ?? 0)} donated`],
  ]
  const won = awards.filter((a) => a[1])
  const canvas = document.createElement('canvas')
  canvas.width = W
  const wars = Object.values(r.race.war_stars).some(Boolean)
  canvas.height = HEAD + ROW * won.length + (wars ? RACE : 0)
  const ctx = canvas.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily
  const display = '"Lilita One", sans-serif'
  const text = (s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left', width = W - 2 * PAD, family = font) => {
    ctx.font = `${weight} ${size}px ${family}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(fit(ctx, s, width), x, y)
  }
  ctx.fillStyle = '#FFFBF1'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = '#F3E3B3'
  ctx.fillRect(0, 0, W, HEAD)
  text('Frosted Family', W / 2, 96, 64, 400, '#33271A', 'center', W, display)
  text(`${monthName(r.month)}${r.live ? ' so far' : ''}`, W / 2, 152, 36, 600, '#5E5240', 'center')
  won.forEach(([title, p, value], i) => {
    const y = HEAD + i * ROW
    if (i) { ctx.fillStyle = '#E3D8BF'; ctx.fillRect(PAD, y, W - 2 * PAD, 2) }
    text(title, PAD, y + 56, 28, 600, '#92400E', 'left', 560)
    text(p!.name ?? '', PAD, y + 108, 42, 700, '#2B2114', 'left', 560)
    text(value(p!), W - PAD, y + 96, 40, 700, '#2B2114', 'right', 360)
  })
  if (wars) {
    const y = HEAD + won.length * ROW
    ctx.fillStyle = '#E3D8BF'
    ctx.fillRect(PAD, y, W - 2 * PAD, 2)
    text('War stars', PAD, y + 56, 28, 600, '#7A6C55')
    const rows = (Object.entries(r.race.war_stars) as [ClanName, number][]).sort((a, b) => b[1] - a[1])
    rows.forEach(([clan, n], i) => {
      const x = PAD + (i * (W - 2 * PAD)) / rows.length
      text(clan, x, y + 112, 32, 600, CLAN[clan].deep, 'left', 280)
      text(count(n), x, y + 176, 56, 400, '#2B2114', 'left', 280, display)
    })
  }
  await shareCanvas(canvas, `frosted-recap-${r.month}.png`)
}

const FIT = '[grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]'

export default function Recap({ wide, roster }: { wide: boolean; roster: Roster }) {
  const [month, setMonth] = useState<string | null>(null)
  const [visit, setVisit] = useState(0)
  // Coming back to an app left open fetches again, so a new month never reads as the old one.
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') setVisit((v) => v + 1) }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  const { data, loading } = useRecap(month, visit)
  const [shown, setShown] = useState<Month | null>(null)
  useEffect(() => { if (data) setShown(data) }, [data])
  // The last answer stays on screen while the next loads, and through a failed refresh. Only a month that can't be shown says so.
  const missed = !data && !loading && !!shown && !!month && month !== shown.month
  const body = (
    <>
      {shown && <Header r={shown} picked={month ?? shown.month} canSave={!missed && !loading} onMonth={setMonth} />}
      {(missed || (!shown && !loading)) ? <GoblinNote box goblin="panic">The Recap's under a shield. Try again shortly.</GoblinNote>
        : shown ? <div className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}><Page r={shown} roster={roster} /></div>
        : <div aria-busy="true" aria-label="Loading" className="h-64 animate-pulse rounded-2xl bg-well" />}
    </>
  )
  if (wide) return <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5">{body}</main>
  return <div className="flex flex-col gap-4 px-4 pb-6 pt-1">{body}</div>
}

const has = (r: Month) => ({
  wars: Object.values(r.race.war_stars).some(Boolean),
  built: Object.values(r.race.upgrades).some(Boolean),
  gave: Object.values(r.race.donations).some(Boolean),
})

function Header({ r, picked, canSave, onMonth }: { r: Month; picked: string; canSave: boolean; onMonth: (m: string) => void }) {
  const { wars, built, gave } = has(r)
  return (
    <div className="flex items-center gap-2.5">
      <Picker label="Month" value={picked} options={r.months.map((m) => ({ id: m, label: monthName(m) }))} onPick={onMonth} />
      {r.live && <span className="text-xs font-semibold text-muted">So far</span>}
      {canSave && (wars || built || gave) && <button type="button" onClick={() => { void saveImage(r) }} className="ml-auto min-h-9 flex-none cursor-pointer rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink-2 hover:bg-hover">Save image</button>}
    </div>
  )
}

function Page({ r, roster }: { r: Month; roster: Roster }) {
  const { awards, race, comings, milestones } = r
  const { wars, built, gave } = has(r)
  const raced = wars || built || gave
  const came = comings.joined + comings.left + comings.moved > 0
  const [who, setWho] = useState<'joined' | 'left' | 'moved' | null>(null)
  useEffect(() => setWho(null), [r.month])
  // The names behind the counts come from the Log, which has every member event on record.
  const log = useClanLog()
  const here = new Set(roster.players.map((p) => p.tag))
  const people = !who ? [] : (log.data?.events ?? []).filter((e) => e.at.slice(0, 7) === r.month && POSTED[e.kind] === who)
  const list = [
    { title: 'Three-Star General', places: awards.three_star, value: pct, unit: (p: RecapPlace) => `${p.three} of ${p.attacks} attacks`, href: (t: string) => attacksHref(t, 30), none: `Nobody reached ${r.min_attacks} attacks` },
    { title: 'Master Builder', places: awards.builder, value: (p: RecapPlace) => count(p.n ?? 0), unit: () => 'upgrades', href: (t: string) => historyHref(t, 30), none: 'No upgrades' },
    { title: 'Friend in Need', places: awards.donor, value: (p: RecapPlace) => count(p.n ?? 0), unit: () => 'donated', href: (t: string) => statHref('donations', t), none: 'No donations' },
  ]
  // Who won comes first; an award nobody has won yet is a line under them.
  const won = list.filter((a) => a.places.length).map(({ none: _, ...a }) => a)
  const none = list.filter((a) => !a.places.length)
  if (!raced && !came) return <GoblinNote box goblin="bored">All quiet in the village</GoblinNote>
  return (
    <>
      {raced && <>
        <section aria-label="Awards" className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between px-0.5"><Eyebrow>Awards</Eyebrow><Info topic="recap" /></span>
          <div className={`grid gap-2 ${FIT}`}>
            {won.map(({ title, ...a }) => <Award key={title} title={title} {...a} />)}
          </div>
          {none.map(({ title, none: why }) => <p key={title} className="m-0 px-0.5 text-xs text-muted"><span className="font-semibold text-ink-2">{title}</span> · {why}</p>)}
        </section>
        <section aria-label="Clan race" className="flex flex-col gap-1.5">
          <Eyebrow>Clan race</Eyebrow>
          <Races rows={[
            ...(wars ? [{ title: 'War stars', totals: race.war_stars }] : []),
            ...(built ? [{ title: 'Upgrades', totals: race.upgrades }] : []),
            ...(gave ? [{ title: 'Donations', totals: race.donations }] : []),
          ]} />
        </section>
      </>}
      {came && (
        <section aria-label="Comings and goings" className="flex flex-col gap-1.5">
          <Eyebrow>Comings and goings</Eyebrow>
          <div className="grid grid-cols-3 gap-2">
            {([[comings.joined, 'joined'], [comings.left, 'left'], [comings.moved, 'moved']] as const).map(([n, label]) => (
              <button key={label} type="button" disabled={!n} aria-expanded={who === label} onClick={() => setWho((w) => (w === label ? null : label))}
                className={`flex cursor-pointer flex-col items-center rounded-2xl border px-2 py-2.5 disabled:cursor-default ${who === label ? 'border-ink bg-[#F6EEDC]' : 'border-line bg-white'} ${n ? 'hover:bg-hover' : ''}`}>
                <span className="font-display text-2xl tabular-nums text-ink">{count(n)}</span>
                <span className="text-xs text-muted">{label}</span>
              </button>
            ))}
          </div>
          {who && (log.loading && !people.length ? <div aria-busy="true" aria-label="Loading" className="h-20 animate-pulse rounded-2xl bg-well" /> : (
            <ol className="m-0 grid list-none grid-cols-1 gap-1 p-0 md:grid-cols-2">
              {people.map((e) => <li key={`${e.kind}-${e.tag}-${e.at}`} className="min-w-0"><EventRow e={e} onRoster={here.has(e.tag)} /></li>)}
            </ol>
          ))}
        </section>
      )}
      {milestones.length > 0 && (
        <section aria-label="Milestones" className="flex flex-col gap-1.5">
          <Eyebrow>Milestones</Eyebrow>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {milestones.map((m) => (
              <li key={`${m.kind}-${m.tag}-${m.at}-${m.unit ?? ''}`} className="min-w-0 bg-[#F7E8BC]">
                <MilestoneRow tag={m.tag} name={m.name} day={dayOf(m.at)}>{m.kind === 'hero' ? `Maxed ${m.unit}` : `${count(m.stars ?? 0)} war stars`}</MilestoneRow>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
