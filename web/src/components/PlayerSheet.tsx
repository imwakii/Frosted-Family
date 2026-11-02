import { useEffect, useRef, useState } from 'react'
import { loadPlayer, loadPlayerCard, type PlayerCard } from '../data'
import { ago } from '../leaders'
import { useYou } from './You'
import { CLAN, cycleLong, cycleShort, fmtScore, fmtWindow } from '../theme'
import type { Player, Roster } from '../types'
import { Arrow, PlayDays, Stars, StatusPill, Th, UnitIcon } from './ui'

function Trend({ p, cycles }: { p: Player; cycles: string[] }) {
  const pts = cycles.map((c) => ({ c, s: p.history.find((h) => h.cycle === c)?.score ?? null }))
  const vals = pts.map((x) => x.s).filter((s): s is number => s !== null)
  if (vals.length < 2) return null
  const W = 350, H = 90
  const lo = Math.max(0, Math.min(...vals) - 10), hi = Math.max(...vals) + 10
  const x = (i: number) => (pts.length === 1 ? W : (i / (pts.length - 1)) * W)
  const y = (s: number) => H - ((s - lo) / (hi - lo || 1)) * (H - 10)
  const accent = CLAN[p.clan].accent
  // Break the line where a cycle has no score.
  const runs: string[] = []
  let run: string[] = []
  pts.forEach((pt, i) => {
    if (pt.s === null) { if (run.length) runs.push(run.join(' ')); run = [] } else run.push(`${x(i).toFixed(1)},${y(pt.s).toFixed(1)}`)
  })
  if (run.length) runs.push(run.join(' '))
  const lastI = pts.map((pt) => pt.s !== null).lastIndexOf(true)
  const label = pts.map((pt) => `${cycleLong(pt.c)} ${fmtScore(pt.s)}`).join(', ')

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">Score by cycle</span>
      <svg role="img" aria-label={`Score by cycle: ${label}`} viewBox="-8 -12 366 130" className="h-auto w-full overflow-visible">
        <line x1="0" y1={H} x2={W} y2={H} stroke="#EEF1F6" />
        {runs.map((r) => <polyline key={r} points={r} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
        {pts.map((pt, i) => pt.s === null ? null : (
          <g key={pt.c}>
            <circle cx={x(i)} cy={y(pt.s)} r={i === lastI ? 5.5 : 3.5} fill={i === lastI ? accent : '#FFFFFF'} stroke={i === lastI ? '#FFFFFF' : accent} strokeWidth={i === lastI ? 2.5 : 2} />
            <text x={x(i)} y={y(pt.s) - 11} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
              fontSize="12" fontWeight={i === lastI ? 800 : 600} fill={i === lastI ? CLAN[p.clan].deep : '#64748B'}>{fmtScore(pt.s)}</text>
            <title>{`${cycleLong(pt.c)}: ${fmtScore(pt.s)}`}</title>
          </g>
        ))}
        {pts.map((pt, i) => (
          <text key={pt.c} x={x(i)} y={H + 22} fontSize="12" fill="#64748B"
            textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}>{cycleShort(pt.c)}</text>
        ))}
      </svg>
    </div>
  )
}

export default function PlayerSheet({ tag, roster, wide, onClose }: { tag: string; roster: Roster; wide: boolean; onClose: () => void }) {
  const base = roster.players.find((p) => p.tag === tag)
  const [extra, setExtra] = useState<Partial<Player> | null>(null)
  const [card, setCard] = useState<PlayerCard | null>(null)
  const [you, setYou] = useYou()
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    setExtra(null)
    setCard(null)
    loadPlayer(tag).then((x) => { if (live && x && x.tag === tag) setExtra(x) })
    loadPlayerCard(tag).then((x) => { if (live) setCard(x) })
    return () => { live = false }
  }, [tag])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose])

  const p: Player | undefined = base && { ...base, ...extra, history: extra?.history ?? base.history }
  const inCwl = p ? !!roster.clans[p.clan]?.inCwl : false
  const where = p ? `${p.clan} · ${p.slot === 'NEW' ? 'new' : inCwl ? { CORE: 'core', SUB: 'sub', OUT: 'not in' }[p.slot] : 'not in CWL'}` : ''
  const c = p && CLAN[p.clan]
  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

  return (
    <div className="fixed inset-0 z-40">
      <div className="ff-fade absolute inset-0 bg-[rgba(15,23,42,.35)]" onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label={p?.name ?? 'Player'}
        className={wide
          ? 'ff-sheet absolute left-1/2 top-1/2 flex max-h-[min(720px,90vh)] w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-[22px] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,.25)]'
          : 'ff-sheet absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-64px)] flex-col gap-4 overflow-auto rounded-t-[22px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(15,23,42,.18)]'}>
        {!wide && <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-[3px] bg-[#D5DBE5]" />}
        <div className="flex items-center gap-3">
          {p && <Th th={p.th} size="lg" />}
          <div className="flex min-w-0 flex-auto flex-col">
            <span className="font-display truncate text-[26px] leading-tight">{p?.name ?? 'Not on the roster'}</span>
            <span className="truncate text-[13px] text-faint">{tag}{p ? ` · ${where}` : ''}</span>
          </div>
          <button ref={close} type="button" aria-label="Close" onClick={onClose}
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F1F4F9] text-muted hover:bg-well">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {p && c && (
          <>
            <button type="button" onClick={() => setYou(you === tag ? null : tag)}
              className={`-mt-2 self-start cursor-pointer rounded-full border px-2.5 py-1 text-xs font-bold ${you === tag ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`}>
              {you === tag ? 'You · not me?' : 'This is me'}
            </button>
            {p.inClan && p.inClan !== p.clan && (
              <div className="flex min-h-12 items-center gap-2 rounded-[14px] bg-[#EFF4FF] px-4 text-sm font-semibold text-action-deep">
                <span className="flex-auto">Move before sign-up</span>
                <span className="font-bold" style={{ color: CLAN[p.inClan].deep }}>{p.inClan}</span>
                <Arrow size={14} />
                <span className="font-bold" style={{ color: c.deep }}>{p.clan}</span>
              </div>
            )}
            {p.days && (
              <div className="flex min-h-12 items-center justify-between gap-2 rounded-[14px] border border-line px-4">
                <span className="text-sm font-semibold text-muted">CWL days</span>
                <PlayDays days={p.days} clan={p.clan} size={24} />
              </div>
            )}
            <div className="flex items-end justify-between rounded-2xl p-4" style={{ background: c.tint }}>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: c.label }}>Score</span>
                <span className="font-display text-5xl leading-none tabular-nums" style={{ color: c.deep }}>{fmtScore(p.score)}</span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusPill status={p.status} className="!px-2.5 !py-[3px] !text-xs !font-bold" />
                {p.rank && <span className="text-[13px] font-semibold text-muted">#{p.rank} in the family</span>}
                {p.attackScore != null && p.defenceScore != null && (
                  <span className="text-xs font-semibold tabular-nums text-muted">Attack {p.attackScore.toFixed(1)} + Defence {p.defenceScore.toFixed(1)}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-2">
                {[['Three stars', pct(p.threeStar)], ['Missed', pct(p.missPct)], ['Attacks', p.attacks ?? '—']].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-line p-3">
                    <span className="text-xs text-faint">{k}</span>
                    <span className="text-[19px] font-bold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              {roster.window && <span className="text-xs text-faint">{fmtWindow(roster.window)}</span>}
            </div>
            {card && card.heroes.length > 0 && (
              <section aria-label="Heroes" className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">Heroes</span>
                <div className="grid grid-cols-4 gap-2">
                  {card.heroes.map((h) => (
                    <div key={h.name} title={h.name} className="flex flex-col items-center gap-1 rounded-xl border border-line py-2">
                      <UnitIcon name={h.name} size={34} />
                      <span className={`text-xs font-bold tabular-nums ${h.max && h.level >= h.max ? 'text-gold' : 'text-ink-2'}`}>{h.level}{h.max ? <span className="font-semibold text-faint">/{h.max}</span> : null}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {card && card.attacks.length > 0 && (
              <section aria-label="Latest attacks" className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">Latest attacks</span>
                <ul className="m-0 flex list-none flex-col rounded-xl border border-line p-0">
                  {card.attacks.map((a, i) => (
                    <li key={i} className={`flex items-center gap-2 px-3 py-2 ${i ? 'border-t border-hair' : ''}`}>
                      <Th th={a.target_th} />
                      <span className="flex min-w-0 flex-auto flex-col">
                        <span className="truncate text-[13px] font-semibold text-ink">{a.target ?? 'Unknown'}</span>
                        <span className="truncate text-[11px] text-faint">{a.kind === 'cwl' ? `CWL day ${a.day ?? '?'} · ` : ''}{a.opponent}</span>
                      </span>
                      <Stars n={a.stars} />
                      <span className="w-9 flex-none text-right text-xs font-bold tabular-nums text-ink-2">{Math.round(a.destruction)}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {card && card.upgrades.length > 0 && (
              <section aria-label="Latest upgrades" className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">Latest upgrades</span>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {card.upgrades.map((u) => (
                    <li key={`${u.unit}-${u.to}`} className="flex items-center gap-2 text-[13px]">
                      <UnitIcon name={u.unit} size={24} />
                      <span className="min-w-0 flex-auto truncate font-semibold text-ink-2">{u.unit} <span className="font-bold tabular-nums text-faint">{u.from} → {u.to}</span></span>
                      <span className="flex-none text-xs text-faint">{ago(u.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {card && (
              <div className="grid grid-cols-2 gap-2">
                {([['Donated this season', card.donations], ['Received this season', card.donations_received], ['War stars, lifetime', card.war_stars], ['Capital, lifetime', card.capital]] as const).map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-line p-3">
                    <span className="text-xs text-faint">{k}</span>
                    <span className="text-[17px] font-bold tabular-nums">{v === null ? '—' : v.toLocaleString('en-GB')}</span>
                  </div>
                ))}
              </div>
            )}
            <Trend p={p} cycles={roster.cycles} />
          </>
        )}
      </section>
    </div>
  )
}
