import { useEffect, useState } from 'react'
import { useRecap, type Recap as Month, type RecapPlace } from '../leaders'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { COLOR } from './ClansBoard'
import Info from './Info'
import { MilestoneRow } from './LogTab'
import { fit, shareCanvas } from './WarRecap'
import { Eyebrow, GoblinNote, Picker, Th } from './ui'

// One month in the family, to look back on and post in Discord. The month in progress updates as it goes.

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const count = (n: number) => n.toLocaleString('en-GB')
const pct = (p: RecapPlace) => `${Math.round((p.rate ?? 0) * 100)}%`

function Award({ title, places, value, why, none }: { title: string; places: RecapPlace[]; value: (p: RecapPlace) => string; why: (p: RecapPlace) => string; none: string }) {
  const [top, ...next] = places
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-line bg-white px-3.5 py-3">
      <h3 className="font-display m-0 text-lg font-normal leading-tight text-[#92400E]">{title}</h3>
      {!top ? <p className="m-0 text-[13px] text-muted">{none}</p> : <>
        <a href={playerHref(top.tag)} className="flex min-h-11 items-center gap-2.5 text-ink no-underline">
          <Th th={top.th} />
          <span className="flex min-w-0 flex-auto flex-col leading-tight">
            <span className="truncate text-[15px] font-bold">{top.name}</span>
            <span className="text-xs font-bold" style={{ color: CLAN[top.clan].deep }}>{top.clan}</span>
          </span>
          <span className="font-display flex-none text-[26px] tabular-nums">{value(top)}</span>
        </a>
        <p className="m-0 text-[13px] text-ink-2">{why(top)}</p>
        {next.length > 0 && <p className="m-0 truncate text-xs text-muted">Next: {next.map((p) => `${p.name} ${value(p)}`).join(', ')}</p>}
      </>}
    </article>
  )
}

function Race({ title, totals }: { title: string; totals: Record<ClanName, number> }) {
  const rows = (Object.entries(totals) as [ClanName, number][]).sort((a, b) => b[1] - a[1])
  const top = Math.max(1, rows[0][1])
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-line bg-white px-3.5 py-3">
      <span className="text-sm font-bold text-ink">{title}</span>
      {rows.map(([clan, n]) => (
        <div key={clan} className="grid grid-cols-[48px_minmax(0,1fr)_54px] items-center gap-2 text-xs">
          <span className="font-semibold text-ink-2">{clan}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-hair"><span className="ff-grow block h-full rounded-full" style={{ width: `${Math.max((n / top) * 100, 1.5)}%`, background: COLOR[clan] }} /></span>
          <span className="text-right text-[13px] font-bold tabular-nums">{count(n)}</span>
        </div>
      ))}
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

export default function Recap({ wide }: { wide: boolean }) {
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
        : shown ? <div className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}><Page r={shown} /></div>
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

function Page({ r }: { r: Month }) {
  const { awards, race, comings, milestones } = r
  const { wars, built, gave } = has(r)
  const raced = wars || built || gave
  const came = comings.joined + comings.left + comings.moved > 0
  if (!raced && !came) return <GoblinNote box goblin="bored">All quiet in the village</GoblinNote>
  return (
    <>
      {raced && <>
        <section aria-label="Awards" className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between px-0.5"><Eyebrow>Awards</Eyebrow><Info topic="recap" /></span>
          <div className={`grid gap-2 ${FIT}`}>
            <Award title="Three-Star General" places={awards.three_star} value={pct} why={(p) => `${p.three} of ${p.attacks} attacks`} none={`Nobody reached ${r.min_attacks} attacks`} />
            <Award title="Master Builder" places={awards.builder} value={(p) => count(p.n ?? 0)} why={() => 'upgrades'} none="No upgrades" />
            <Award title="Friend in Need" places={awards.donor} value={(p) => count(p.n ?? 0)} why={() => 'donated'} none="No donations" />
          </div>
        </section>
        <section aria-label="Clan race" className="flex flex-col gap-1.5">
          <Eyebrow>Clan race</Eyebrow>
          <div className={`grid gap-2 ${FIT}`}>
            {wars && <Race title="War stars" totals={race.war_stars} />}
            {built && <Race title="Upgrades" totals={race.upgrades} />}
            {gave && <Race title="Donations" totals={race.donations} />}
          </div>
        </section>
      </>}
      {came && (
        <section aria-label="Comings and goings" className="flex flex-col gap-1.5">
          <Eyebrow>Comings and goings</Eyebrow>
          <div className="grid grid-cols-3 gap-2">
            {([[comings.joined, 'joined'], [comings.left, 'left'], [comings.moved, 'moved']] as const).map(([n, label]) => (
              <div key={label} className="flex flex-col items-center rounded-2xl border border-line bg-white px-2 py-2.5">
                <span className="font-display text-2xl tabular-nums">{count(n)}</span>
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {milestones.length > 0 && (
        <section aria-label="Milestones" className="flex flex-col gap-1.5">
          <Eyebrow>Milestones</Eyebrow>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {milestones.map((m) => (
              <li key={`${m.kind}-${m.tag}-${m.at}-${m.unit ?? ''}`} className="min-w-0 bg-[#F7E8BC]">
                <MilestoneRow tag={m.tag} name={m.name}>{m.kind === 'hero' ? `Maxed ${m.unit}` : `${count(m.stars ?? 0)} war stars`}</MilestoneRow>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
