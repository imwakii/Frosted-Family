import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { leagueIcon } from '../clash'
import { type ClansStats, type Point, type StatClan, type StatsWar, type TrendPoint, useClanStats } from '../clanStats'
import { CLANS, cycleShort } from '../theme'

type Range = '30d' | 'all'
const SERIES: StatClan[] = [...CLANS, 'Family']
// Cake uses its accent: the deep blue sits too close to Flakes' violet for colour-blind readers.
// Mid-tone clan hues, softer than the badge colours, so lines and bars read calmly on white.
const COLOR: Record<StatClan, string> = { Fire: '#F0905F', Cake: '#5A9BE3', Flakes: '#9686EE', Family: '#94A3B8' }
const DASH: Partial<Record<StatClan, string>> = { Family: '4 3' }
const OUTCOME = { won: '#BBEACB', draw: '#E2E8F0', lost: '#F9C9C9' } as const
const OUTCOME_INK = { won: '#166534', draw: '#475569', lost: '#991B1B' } as const
const DAY = 86_400_000

const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
const dayText = (x: number) => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const seasonText = (s: string) => `${cycleShort(s)} ${s.slice(2, 4)}`
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${+v.toFixed(1)}`)
const pct = (v: number) => `${Math.round(v * 100)}%`
const last = <T,>(a: T[]) => a[a.length - 1]

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function ticks(lo: number, hi: number, n = 3) {
  if (lo === hi) { const d = Math.abs(lo) > 2 ? Math.max(1, Math.abs(lo) * 0.02) : Math.abs(lo) * 0.05 || 0.1; lo -= d; hi += d }
  const raw = (hi - lo) / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(+v.toFixed(10))
  return out
}

const Dot = ({ k }: { k: StatClan }) => <span aria-hidden="true" className="size-2 flex-none rounded-full" style={{ background: COLOR[k] }} />

function Key({ k }: { k: StatClan }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
      <svg aria-hidden="true" width="16" height="8"><line x1="1" y1="4" x2="15" y2="4" stroke={COLOR[k]} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={DASH[k]} /></svg>
      {k}
    </span>
  )
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-[15px] font-bold text-ink">{title}</h3>
        {aside && <span className="flex-none text-xs font-semibold text-faint">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** Latest value per clan, for a series too short to draw. */
function Latest({ rows, fmt, since }: { rows: { k: StatClan; v: number | null }[]; fmt: (v: number) => string; since: string }) {
  return (
    <div className="flex flex-auto flex-col justify-between gap-3">
      <div className={`grid gap-x-3 gap-y-3 ${rows.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {rows.map(({ k, v }) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-faint"><Dot k={k} />{k}</span>
            <span className="font-display text-[28px] leading-none text-ink tabular-nums">{v === null ? '—' : fmt(v)}</span>
          </div>
        ))}
      </div>
      <span className="text-xs text-faint">Collecting since {since}</span>
    </div>
  )
}

type Line = { k: StatClan; pts: { x: number; y: number; m?: boolean }[] }

function LineChart({ lines, xs, xLabel, fmt, dots = false }: { lines: Line[]; xs: number[]; xLabel: (x: number) => string; fmt: (v: number) => string; dots?: boolean }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const H = 172, L = 36, R = 86, T = 10, B = 24
  const ys = lines.flatMap((l) => l.pts.map((p) => p.y))
  const yt = ticks(Math.min(...ys), Math.max(...ys))
  const y0 = yt[0], y1 = last(yt)
  const x0 = xs[0], x1 = last(xs)
  const iw = Math.max(0, w - L - R), ih = H - T - B
  const sx = (x: number) => L + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw)
  const sy = (y: number) => T + ih - ((y - y0) / (y1 - y0 || 1)) * ih

  const ends = lines.filter((l) => l.pts.length).map((l) => { const p = last(l.pts); return { k: l.k, x: sx(p.x), y: sy(p.y), v: p.y } }).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13
  const spill = ends.length ? last(ends).y - (H - B) : 0
  if (spill > 0) ends.forEach((e) => { e.y -= spill })

  // The middle label is the date nearest the middle of the range; one that would touch its neighbour is dropped.
  const mid = xs.reduce((a, b) => (Math.abs(b - (x0 + x1) / 2) < Math.abs(a - (x0 + x1) / 2) ? b : a), x0)
  const wanted = xs.length <= 6 || iw / xs.length > 44 ? xs : [...new Set([x0, mid, x1])]
  const textW = (x: number) => xLabel(x).length * 6
  let reach = sx(x0) + textW(x0)
  const xt = wanted.filter((x, i) => {
    if (i === 0 || i === wanted.length - 1) return true
    const from = sx(x) - textW(x) / 2, to = sx(x) + textW(x) / 2
    if (from < reach + 8 || to > sx(x1) - textW(x1) - 8) return false
    reach = to
    return true
  })
  const hx = hover === null ? null : xs[hover]
  const move = (e: PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    const px = e.clientX - r.left
    let best = 0
    xs.forEach((x, i) => { if (Math.abs(sx(x) - px) < Math.abs(sx(xs[best]) - px)) best = i })
    setHover(best)
  }
  const label = lines.map((l) => `${l.k} ${l.pts.length ? fmt(last(l.pts).y) : 'none'}`).join(', ')

  return (
    <div ref={ref} className="relative w-full select-none">
      {w > 0 && (
        <svg role="img" aria-label={label} width={w} height={H} className="block touch-pan-y" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
          {yt.map((t) => (
            <g key={t}>
              <line x1={L} x2={L + iw} y1={sy(t)} y2={sy(t)} stroke="#EEF1F6" />
              <text x={L - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#64748B" className="tabular-nums">{fmt(t)}</text>
            </g>
          ))}
          {xt.map((x, i) => (
            <text key={x} x={sx(x)} y={H - 6} fontSize="10.5" fill="#64748B" textAnchor={xt.length > 1 && i === 0 ? 'start' : xt.length > 1 && i === xt.length - 1 ? 'end' : 'middle'}>{xLabel(x)}</text>
          ))}
          {hx !== null && <line x1={sx(hx)} x2={sx(hx)} y1={T} y2={T + ih} stroke="#CBD5E1" />}
          {lines.map((l) => (
            <g key={l.k}>
              <path d={l.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('')} fill="none" stroke={COLOR[l.k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={DASH[l.k]} />
              {l.pts.filter((p) => p.m).map((p) => <circle key={'m' + p.x} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="#fff" stroke={COLOR[l.k]} strokeWidth="2" />)}
              {(dots ? l.pts : l.pts.slice(-1)).filter((p) => !p.m).map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={COLOR[l.k]} stroke="#fff" strokeWidth="2" />)}
              {hx !== null && l.pts.filter((p) => p.x === hx).map((p) => <circle key="h" cx={sx(p.x)} cy={sy(p.y)} r="5" fill={COLOR[l.k]} stroke="#fff" strokeWidth="2" />)}
            </g>
          ))}
          {ends.map((e) => (
            <text key={e.k} x={L + iw + 10} y={e.y} dy="0.32em" fontSize="11" className="tabular-nums">
              <tspan fontWeight="700" fill="#0F172A">{fmt(e.v)}</tspan>
              <tspan dx="4" fill="#64748B">{e.k}</tspan>
            </text>
          ))}
        </svg>
      )}
      {w === 0 && <div style={{ height: H }} />}
      {hx !== null && (
        <div role="tooltip" className="pointer-events-none absolute top-0 z-10 flex min-w-[120px] flex-col gap-1 rounded-lg border border-line bg-white px-2.5 py-2 text-xs shadow-[0_6px_20px_rgba(15,23,42,.12)]"
          style={sx(hx) > w / 2 ? { right: w - sx(hx) + 10 } : { left: sx(hx) + 10 }}>
          <span className="font-bold text-ink">{xLabel(hx)}</span>
          {lines.flatMap((l) => l.pts.filter((p) => p.x === hx).map((p) => (
            <span key={l.k} className="flex items-center gap-1.5 text-ink-2"><Dot k={l.k} />{l.k}<span className="ml-auto pl-2 font-bold text-ink tabular-nums">{fmt(p.y)}</span></span>
          )))}
        </div>
      )}
    </div>
  )
}

function SeriesCard({ title, data, metric, keys, fmt, range, since, aside }: {
  title: string; data: ClansStats; metric: 'members' | 'avg_th' | 'hero_progress'; keys: StatClan[]; fmt: (v: number) => string; range: Range; since: string; aside?: ReactNode
}) {
  const cut = range === '30d' ? ms(data.as_of) - 30 * DAY : -Infinity
  const lines: Line[] = keys.map((k) => ({ k, pts: (data.clans[k]?.[metric] ?? []).filter((p: Point) => ms(p.date) >= cut).map((p) => ({ x: ms(p.date), y: p.value })) }))
  const xs = [...new Set(lines.flatMap((l) => l.pts.map((p) => p.x)))].sort((a, b) => a - b)
  return (
    <Card title={title} aside={aside}>
      {Math.max(0, ...lines.map((l) => l.pts.length)) < 2
        ? <Latest rows={lines.map((l) => ({ k: l.k, v: l.pts.length ? last(l.pts).y : null }))} fmt={fmt} since={since} />
        : <LineChart lines={lines} xs={xs} xLabel={dayText} fmt={fmt} />}
    </Card>
  )
}

type TrendKey = 'members' | 'avg_th' | 'score' | 'three_star_rate' | 'miss_rate'

// Monthly export points (hollow) up to the first daily reading, then the daily line.
function stitched(data: ClansStats, k: StatClan, key: TrendKey, cut: number) {
  const t = data.clans[k]?.trend
  const daily: { x: number; y: number }[] = key === 'members' || key === 'avg_th'
    ? (data.clans[k]?.[key] ?? []).map((p: Point) => ({ x: ms(p.date), y: p.value }))
    : (t?.daily ?? []).filter((p) => p[key] != null).map((p) => ({ x: ms(p.date), y: p[key] as number }))
  const start = daily.length ? daily[0].x : Infinity
  const monthly = (t?.monthly ?? []).filter((p: TrendPoint) => p[key] != null && ms(p.date) < start).map((p) => ({ x: ms(p.date), y: p[key] as number, m: true }))
  return [...monthly, ...daily].filter((p) => p.x >= cut)
}

function TrendCard({ title, data, metric, keys, fmt, range, since, aside }: {
  title: string; data: ClansStats; metric: TrendKey; keys: StatClan[]; fmt: (v: number) => string; range: Range; since: string; aside?: ReactNode
}) {
  const cut = range === '30d' ? ms(data.as_of) - 30 * DAY : -Infinity
  const lines: Line[] = keys.map((k) => ({ k, pts: stitched(data, k, metric, cut) }))
  const xs = [...new Set(lines.flatMap((l) => l.pts.map((p) => p.x)))].sort((a, b) => a - b)
  // A monthly point is named by its cycle (the November roster's export was pulled on 30 Oct).
  const cycleAt = new Map(keys.flatMap((k) => (data.clans[k]?.trend?.monthly ?? []).map((p) => [ms(p.date), p.cycle] as const)))
  const xLabel = (x: number) => (cycleAt.has(x) ? cycleShort(cycleAt.get(x)!) : dayText(x))
  return (
    <Card title={title} aside={aside}>
      {xs.length < 2
        ? <Latest rows={lines.map((l) => ({ k: l.k, v: l.pts.length ? last(l.pts).y : null }))} fmt={fmt} since={since} />
        : <LineChart lines={lines} xs={xs} xLabel={xLabel} fmt={fmt} />}
    </Card>
  )
}

function ScoreCard({ data, since }: { data: ClansStats; since: string }) {
  const cycles = [...new Set(SERIES.flatMap((k) => (data.clans[k]?.score_by_cycle ?? []).map((c) => c.cycle)))].sort()
  const lines: Line[] = SERIES.map((k) => ({
    k,
    pts: (data.clans[k]?.score_by_cycle ?? []).filter((c) => c.avg_score !== null).map((c) => ({ x: cycles.indexOf(c.cycle), y: c.avg_score as number })).sort((a, b) => a.x - b.x),
  }))
  const fmt = (v: number) => `${Math.round(v)}`
  return (
    <Card title="Average score by cycle">
      {cycles.length < 2
        ? <Latest rows={lines.map((l) => ({ k: l.k, v: l.pts.length ? last(l.pts).y : null }))} fmt={fmt} since={since} />
        : <LineChart lines={lines} xs={cycles.map((_, i) => i)} xLabel={(i) => cycleShort(cycles[i])} fmt={fmt} dots />}
    </Card>
  )
}

function warsIn(data: ClansStats, range: Range) {
  const cut = range === '30d' ? ms(data.as_of) - 30 * DAY : -Infinity
  // Family's list repeats the clans' wars, so read each clan's own.
  return Object.fromEntries(CLANS.map((k) => [k, (data.clans[k]?.wars ?? []).filter((w) => ms(w.date) >= cut).sort((a, b) => ms(a.date) - ms(b.date))])) as Record<(typeof CLANS)[number], StatsWar[]>
}

const NoWars = () => <span className="py-6 text-center text-sm text-faint">No wars in this range</span>

function ResultsCard({ wars }: { wars: ReturnType<typeof warsIn> }) {
  const rows = CLANS.map((k) => ({ k, won: wars[k].filter((w) => w.result === 'won').length, draw: wars[k].filter((w) => w.result === 'draw').length, lost: wars[k].filter((w) => w.result === 'lost').length }))
  const max = Math.max(...rows.map((r) => r.won + r.draw + r.lost))
  return (
    <Card title="War results">
      {!max ? <NoWars /> : (
        <>
          <div className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <div key={r.k} className="grid grid-cols-[64px_1fr] items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Dot k={r.k} />{r.k}</span>
                <div className="flex h-6 gap-[2px]" style={{ width: `${((r.won + r.draw + r.lost) / max) * 100}%` }}>
                  {(['won', 'draw', 'lost'] as const).filter((o) => r[o]).map((o, i, a) => (
                    <span key={o} title={`${r[o]} ${o}`} className={`flex min-w-6 items-center justify-center text-[11px] font-bold tabular-nums ${i === a.length - 1 ? 'rounded-r' : ''}`}
                      style={{ flex: r[o], background: OUTCOME[o], color: OUTCOME_INK[o] }}>{r[o]}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs font-semibold text-ink-2">
            {(['won', 'draw', 'lost'] as const).map((o) => <span key={o} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: OUTCOME[o] }} />{o[0].toUpperCase() + o.slice(1)}</span>)}
          </div>
        </>
      )}
    </Card>
  )
}

function StarsCard({ wars }: { wars: ReturnType<typeof warsIn> }) {
  const rows = CLANS.map((k) => ({ k, us: wars[k].reduce((s, w) => s + w.stars, 0), them: wars[k].reduce((s, w) => s + w.opponent_stars, 0), n: wars[k].length }))
  const max = Math.max(...rows.map((r) => Math.max(r.us, r.them)))
  const bar = (v: number, c: string, who: string) => (
    <div className="flex items-center gap-2" title={`${who}: ${v} stars`}>
      <span className="h-2.5 rounded-r" style={{ width: `${max ? (v / max) * 82 : 0}%`, minWidth: v ? 3 : 0, background: c }} />
      <span className="text-xs font-bold text-ink tabular-nums">{v}</span>
    </div>
  )
  return (
    <Card title="Stars for and against">
      {!max ? <NoWars /> : (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.k} className="grid grid-cols-[64px_1fr] items-center gap-2">
                <span className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Dot k={r.k} />{r.k}</span>
                  <span className="pl-3.5 text-[11px] text-faint">{r.n} {r.n === 1 ? 'war' : 'wars'}</span>
                </span>
                <div className="flex flex-col gap-[3px]">{bar(r.us, COLOR[r.k], r.k)}{bar(r.them, '#E2E8F0', 'Opponents')}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs font-semibold text-ink-2">
            <span className="flex items-center gap-1.5"><span className="flex gap-px">{CLANS.map((k) => <span key={k} className="h-2.5 w-1.5 first:rounded-l-sm last:rounded-r-sm" style={{ background: COLOR[k] }} />)}</span>Ours</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#E2E8F0]" />Opponents</span>
          </div>
        </>
      )}
    </Card>
  )
}

function ThreeStarCard({ wars, since }: { wars: ReturnType<typeof warsIn>; since: string }) {
  const lines: Line[] = CLANS.map((k) => ({ k, pts: wars[k].filter((w) => w.three_star_rate !== null).map((w) => ({ x: ms(w.date), y: w.three_star_rate as number })) }))
  const xs = [...new Set(lines.flatMap((l) => l.pts.map((p) => p.x)))].sort((a, b) => a - b)
  return (
    <Card title="3★ rate per war">
      {!xs.length ? <NoWars /> : Math.max(...lines.map((l) => l.pts.length)) < 2
        ? <Latest rows={lines.map((l) => ({ k: l.k, v: l.pts.length ? last(l.pts).y : null }))} fmt={pct} since={since} />
        : <LineChart lines={lines} xs={xs} xLabel={dayText} fmt={pct} dots />}
    </Card>
  )
}

function Columns({ cats, series, fmt }: { cats: string[]; series: { k: StatClan; v: (number | null)[] }[]; fmt: (v: number) => string }) {
  const [ref, w] = useWidth()
  const H = 172, L = 36, T = 16, B = 24
  const yt = ticks(0, Math.max(1, ...series.flatMap((s) => s.v.map((v) => v ?? 0))))
  const y1 = last(yt), iw = Math.max(0, w - L), ih = H - T - B
  const band = iw / cats.length
  const bw = Math.min(24, (band * 0.7 - 2 * (series.length - 1)) / series.length)
  const sy = (v: number) => T + ih - (v / y1) * ih
  const col = (x: number, v: number) => { const y = sy(v), h = T + ih - y, r = Math.min(4, h, bw / 2); return `M${x},${T + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${T + ih}Z` }
  return (
    <div ref={ref} className="w-full">
      {w > 0 ? (
        <svg role="img" aria-label={cats.map((c, i) => `${c}: ${series.map((s) => `${s.k} ${s.v[i] ?? 'none'}`).join(', ')}`).join('; ')} width={w} height={H} className="block">
          {yt.map((t) => (
            <g key={t}>
              <line x1={L} x2={w} y1={sy(t)} y2={sy(t)} stroke="#EEF1F6" />
              <text x={L - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#64748B">{fmt(t)}</text>
            </g>
          ))}
          {cats.map((c, i) => {
            const gx = L + i * band + (band - (bw * series.length + 2 * (series.length - 1))) / 2
            return (
              <g key={c}>
                {series.map((s, j) => s.v[i] ? <path key={s.k} d={col(gx + j * (bw + 2), s.v[i] as number)} fill={COLOR[s.k]}><title>{`${s.k}, ${c}: ${s.v[i]!.toLocaleString('en-GB')}`}</title></path> : null)}
                <text x={L + i * band + band / 2} y={H - 6} fontSize="10.5" fill="#64748B" textAnchor="middle">{c}</text>
              </g>
            )
          })}
        </svg>
      ) : <div style={{ height: H }} />}
    </div>
  )
}

function DonationsCard({ data, since }: { data: ClansStats; since: string }) {
  const key = (p: { season?: string; date?: string }) => (p.season ?? p.date ?? '').slice(0, 7)
  const seasons = [...new Set(CLANS.flatMap((k) => (data.clans[k]?.donations_by_season ?? []).map(key)))].filter(Boolean).sort().slice(-6)
  const fam = last(data.clans.Family?.donations ?? [])
  return (
    <Card title="Donations by season" aside={fam ? `Family ${compact(fam.value)} this season` : undefined}>
      {seasons.length < 2
        ? <Latest rows={CLANS.map((k) => ({ k, v: last(data.clans[k]?.donations ?? [])?.value ?? null }))} fmt={compact} since={since} />
        : <Columns cats={seasons.map(seasonText)} fmt={compact}
            series={CLANS.map((k) => ({ k, v: seasons.map((s) => (data.clans[k]?.donations_by_season ?? []).find((p) => key(p) === s)?.value ?? null) }))} />}
    </Card>
  )
}

const shortLeague = (l: string) => l.replace(/ League/, '')

function LeagueCard({ data }: { data: ClansStats }) {
  const seasons = [...new Set(CLANS.flatMap((k) => (data.clans[k]?.cwl_league ?? []).map((s) => s.season)))].sort().slice(-3)
  return (
    <Card title="CWL league">
      {!seasons.length ? <span className="py-6 text-center text-sm text-faint">No league yet</span> : (
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr>
              <th className="w-[64px]" />
              {seasons.map((s) => <th key={s} className="pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">{seasonText(s)}</th>)}
            </tr>
          </thead>
          <tbody>
            {CLANS.map((k) => (
              <tr key={k} className="border-t border-hair">
                <td className="py-2"><span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Dot k={k} />{k}</span></td>
                {seasons.map((s) => {
                  const l = data.clans[k]?.cwl_league.find((x) => x.season === s)?.league ?? null
                  const icon = leagueIcon(l)
                  return (
                    <td key={s} className="py-2 pr-1 align-middle">
                      {l ? (
                        <span className="flex min-w-0 items-center gap-1" title={l}>
                          {icon && <img src={icon} alt="" width={22} height={22} className="size-[22px] flex-none" />}
                          <span className="truncate text-xs font-semibold text-ink">{shortLeague(l)}</span>
                        </span>
                      ) : <span className="text-xs text-faint">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'

export default function ClansBoard({ wide }: { wide: boolean }) {
  const { data, loading } = useClanStats()
  const [range, setRange] = useState<Range>('all')
  const pad = wide ? '' : 'px-4'

  if (!data) {
    return loading ? (
      <div aria-busy="true" aria-label="Loading" className={`${GRID} ${pad}`}>
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[236px] animate-pulse rounded-2xl bg-well" />)}
      </div>
    ) : (
      <div className={pad}>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-6 py-14 text-center">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M4 20h16M7 16V9M12 16V5M17 16v-4" /></svg>
          <span className="text-sm font-semibold text-faint">Clan stats are unavailable right now</span>
        </div>
      </div>
    )
  }

  const since = dayText(ms(data.since))
  const wars = warsIn(data, range)
  const fam = (m: 'members') => last(data.clans.Family?.[m] ?? [])?.value
  // Older API answers have no trend; their cards stay as they were.
  const trended = !!data.clans.Fire?.trend

  return (
    <div className={`flex flex-col gap-3 ${pad}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Range" className="flex rounded-lg bg-well p-0.5">
          {([['30d', '30 days'], ['all', 'All']] as const).map(([id, text]) => (
            <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)}
              className={`min-h-8 cursor-pointer rounded-md border-0 px-3 text-[13px] font-bold ${range === id ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,.1)]' : 'bg-transparent text-faint'}`}>
              {text}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {SERIES.map((k) => <Key key={k} k={k} />)}
          {trended && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <svg aria-hidden="true" width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="#fff" stroke="#94A3B8" strokeWidth="2" /></svg>Monthly export
            </span>
          )}
        </div>
      </div>
      <div className={GRID}>
        {trended ? (
          <>
            <TrendCard title="Average score" data={data} metric="score" keys={SERIES} fmt={(v) => `${Math.round(v)}`} range={range} since={since} />
            <TrendCard title="Members" data={data} metric="members" keys={[...CLANS]} fmt={(v) => `${Math.round(v)}`} range={range} since={since}
              aside={fam('members') !== undefined ? `Family ${fam('members')}` : undefined} />
            <TrendCard title="Average town hall" data={data} metric="avg_th" keys={SERIES} fmt={(v) => v.toFixed(1)} range={range} since={since} />
            <TrendCard title="3★ rate" data={data} metric="three_star_rate" keys={SERIES} fmt={pct} range={range} since={since} />
            <TrendCard title="Miss rate" data={data} metric="miss_rate" keys={SERIES} fmt={pct} range={range} since={since} />
            <SeriesCard title="Hero progress" data={data} metric="hero_progress" keys={SERIES} fmt={pct} range={range} since={since} />
            <ResultsCard wars={wars} />
            <StarsCard wars={wars} />
          </>
        ) : (
          <>
            <SeriesCard title="Members" data={data} metric="members" keys={[...CLANS]} fmt={(v) => `${Math.round(v)}`} range={range} since={since}
              aside={fam('members') !== undefined ? `Family ${fam('members')}` : undefined} />
            <SeriesCard title="Average town hall" data={data} metric="avg_th" keys={SERIES} fmt={(v) => v.toFixed(1)} range={range} since={since} />
            <SeriesCard title="Hero progress" data={data} metric="hero_progress" keys={SERIES} fmt={pct} range={range} since={since} />
            <ScoreCard data={data} since={since} />
            <ResultsCard wars={wars} />
            <StarsCard wars={wars} />
            <ThreeStarCard wars={wars} since={since} />
          </>
        )}
        <DonationsCard data={data} since={since} />
        <LeagueCard data={data} />
      </div>
    </div>
  )
}

