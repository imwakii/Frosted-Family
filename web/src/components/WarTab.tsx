import { type CSSProperties, Fragment, useEffect, useRef, useState } from 'react'
import WarRecap from './WarRecap'
import { useYou, YouTag } from './You'
import { useClans } from '../clash'
import { useWide } from '../data'
import { ago, type ClanWar, useWarBoard, type WarAttack, type WarBase } from '../leaders'
import { playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { chip, ClanBadge, ClanSwitch, KEY_ROW, POINT, Stars, Th, useNow } from './ui'

// Each clan's war, side by side: our bases and badge on the left, the enemy's on the right, facing by map position.
// The attack log says who hit whom, how well and roughly when: we stay on the left and they on the right, and each row
// points the way the attack went. Tapping a base narrows the log beside the board,
// or on narrower screens, where the log is far below, opens that base's attacks under its row.
// Refetched every minute; the collector checks wars every minute while one is on.

// The API's times look like 20261104T080000.000Z.
const at = (t: string | null) => {
  const m = t?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}
const left = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const ENEMY = '#D5C8AC'
const ENEMY_ROW = '#F1E8D3'

// Where each spark flies from the point of impact, in px, and its colour.
const SPARKS = [[0, -34, '#F59E0B'], [25, -25, '#EF4444'], [36, -4, '#FBBF24'], [27, 20, '#F97316'], [-27, 20, '#FBBF24'], [-36, -4, '#EF4444'], [-25, -25, '#F97316'], [12, -32, '#F59E0B'], [-12, -32, '#EF4444']] as const

// The tab's crossed swords between the two clans. While the war is live they wind up and strike, with a flash,
// a shockwave and flying sparks; the two badges recoil from the blow.
function Swords({ live, color }: { live: boolean; color: string }) {
  return (
    <span className={`relative z-[1] flex size-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(43,33,20,.12)] ${live ? 'ff-shake' : ''}`}>
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" className="overflow-visible">
        <g className={live ? 'ff-sword-a' : ''}><path d="M5 5l14 14M16 20l4-4" /></g>
        <g className={live ? 'ff-sword-b' : ''}><path d="M19 5L5 19M4 16l4 4" /></g>
        {live && <>
          <circle cx="12" cy="9" r="4" stroke="#F59E0B" strokeWidth="1.8" className="ff-ring" />
          <circle cx="12" cy="9" r="3.4" fill="#FDE68A" stroke="none" className="ff-flash" />
          {SPARKS.map(([dx, dy, c], i) => (
            <circle key={i} cx="12" cy="9" r={i % 2 ? 1.7 : 2.3} fill={c} stroke="none" className="ff-burst" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties} />
          ))}
        </>}
      </svg>
    </span>
  )
}

// Share of the stars taken so far: ours from the left, theirs from the right.
function TugBar({ us, them, color }: { us: number; them: number; color: string }) {
  const share = us + them ? (100 * us) / (us + them) : 50
  return (
    <div aria-label={`Stars ${us} to ${them}`} className="flex h-2 overflow-hidden rounded-full" style={{ background: ENEMY }}>
      <span className="h-full rounded-r-full transition-[width] duration-700 ease-out" style={{ width: `${share}%`, background: color }} />
    </div>
  )
}

function Base({ b, right, live, picked, onPick }: { b: WarBase | null; right?: boolean; live: boolean; picked: boolean; onPick: () => void }) {
  if (!b) return <span />
  return (
    <button type="button" aria-pressed={picked} onClick={onPick}
      className={`flex min-h-[52px] min-w-0 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 px-1.5 text-left ${right ? 'flex-row-reverse' : ''} ${picked ? 'bg-moved' : 'bg-transparent hover:bg-hover'}`}>
      <Th th={b.th} />
      <span className={`flex min-w-0 flex-auto flex-col gap-0.5 ${right ? 'items-end' : 'items-start'}`}>
        <span className="max-w-full truncate text-[13px] font-semibold text-ink"><YouTag tag={b.tag} />{b.name}</span>
        <span className={`flex items-center gap-1.5 text-[11px] leading-none ${right ? 'flex-row-reverse' : ''}`}>
          {live && (
            <span aria-label={`${b.used} of ${b.allowed} attacks used`} className="flex gap-[3px]">
              {Array.from({ length: b.allowed }, (_, k) => <span key={k} className={`size-[7px] rounded-full ${k < b.used ? 'bg-[#16A34A]' : 'border-[1.5px] border-[#A3957C]'}`} />)}
            </span>
          )}
          <Stars n={b.best ?? 0} />
        </span>
      </span>
    </button>
  )
}

function LogRow({ a, tint, now }: { a: WarAttack; tint: string; now: number }) {
  const point = a.ours ? POINT.right : POINT.left
  const us = a.ours ? a.attacker : a.defender
  const them = a.ours ? a.defender : a.attacker
  const who = (hit: boolean) => (hit ? 'text-ink-2 font-medium' : 'text-ink font-bold')
  return (
    <li aria-label={`${a.attacker.name} attacked ${a.defender.name}`} className={`grid min-h-[46px] grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] items-center gap-1.5 py-1 text-[13px] ${point.cls}`} style={{ ...point.style, background: a.ours ? tint : ENEMY_ROW }}>
      <span className={`flex min-w-0 items-center gap-1.5 ${who(!a.ours)}`}>
        <span className="flex-none text-[11px] font-bold tabular-nums text-faint">{us.position}</span>
        <span className="min-w-0 truncate">{us.name}</span>
      </span>
      <span className="flex flex-col items-center gap-0.5 text-[11px]">
        <Stars n={a.stars} />
        <span className="whitespace-nowrap tabular-nums text-muted"><b className="font-bold text-ink-2">{Math.round(a.destruction)}%</b>{a.seen_at && <span title="To within about a minute"> · ~{ago(a.seen_at, now)}</span>}</span>
      </span>
      <span className={`flex min-w-0 items-center justify-end gap-1.5 ${who(a.ours)}`}>
        <span className="min-w-0 truncate">{them.name}</span>
        <span className="flex-none text-[11px] font-bold tabular-nums text-faint">{them.position}</span>
      </span>
    </li>
  )
}

function WarBoard({ clan, war, now }: { clan: ClanName; war: ClanWar; now: number }) {
  const t = CLAN[clan]
  const clans = useClans()
  const [picked, setPicked] = useState<string | null>(null)
  const [openOnly, setOpenOnly] = useState(false)
  const { yous } = useYou()
  const sideBySide = useWide('(min-width: 1024px)')
  const opened = useRef<HTMLLIElement>(null)
  useEffect(() => { setPicked(null); setOpenOnly(false) }, [clan])
  useEffect(() => { if (picked) opened.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [picked])
  const end = at(war.end_time), start = at(war.start_time)
  const live = war.state === 'inWar', over = war.state === 'warEnded', prep = war.state === 'preparation'
  const won = war.stars > war.opponent_stars || (war.stars === war.opponent_stars && war.destruction > war.opponent_destruction)
  const draw = war.stars === war.opponent_stars && war.destruction === war.opponent_destruction
  const toAttack = war.pairs.filter((p) => p.us && p.us.used < p.us.allowed).length
  const total = war.team_size * war.attacks_allowed
  // Bases still worth hitting: not yet three-starred.
  const open = war.pairs.filter((p) => p.them && p.them.best !== 3)
  const rows = live && openOnly ? open : war.pairs
  // All your accounts in this war, together; tapping goes to the first with an attack left.
  const accounts = war.pairs.flatMap((p) => (p.us && yous.includes(p.us.tag) ? [p.us] : []))
  const mineLeft = accounts.reduce((n, b) => n + b.allowed - b.used, 0)
  const mine = accounts.find((b) => b.used < b.allowed) ?? accounts[0]
  const pickedLog = picked ? war.log.filter((a) => a.attacker.tag === picked || a.defender.tag === picked) : []
  const log = picked && sideBySide ? pickedLog : war.log
  const pickedName = picked ? war.pairs.flatMap((p) => [p.us, p.them]).find((b) => b?.tag === picked)?.name : null
  const toggle = (tag?: string) => {
    if (!tag) return
    if (!rows.some((p) => p.us?.tag === tag || p.them?.tag === tag)) setOpenOnly(false)
    setPicked((p) => (p === tag ? null : tag))
  }
  const pickedActions = picked && (
    <span className="flex flex-none items-center gap-1.5">
      {war.pairs.some((p) => p.us?.tag === picked) && (
        <a href={playerHref(picked)} className="flex min-h-8 items-center rounded-full bg-ink px-2.5 text-xs font-bold text-white no-underline">View card</a>
      )}
      <button type="button" onClick={() => setPicked(null)} className="min-h-8 cursor-pointer rounded-full border border-line bg-white px-2.5 text-xs font-bold text-ink-2 hover:bg-page">{sideBySide ? 'Show all' : 'Close'}</button>
    </span>
  )
  const score = (stars: number, pct: number, used: number, deep: string) => (
    <span className={`flex flex-col items-center gap-0.5 ${prep ? 'invisible' : ''}`}>
      <span className="font-display flex items-baseline gap-1 text-[26px] leading-none tabular-nums" style={{ color: deep }}>{stars}<span className="text-base text-gold">★</span></span>
      <span className="text-[11px] font-semibold tabular-nums text-muted">{Math.round(pct)}% · {used}/{total}</span>
    </span>
  )
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label={`${clan} against ${war.opponent}`} className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-col gap-2 p-3.5" style={{ background: t.tint }}>
          <div className="flex justify-center">
            <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${live ? 'bg-white text-[#15803D]' : over ? 'bg-white/60 text-muted' : 'bg-[#FFEDD5] text-[#B4451A]'}`}>
              {war.kind === 'cwl' ? `Day ${war.day ?? '?'} · ` : ''}{live ? (end ? `${left(end - now)} left` : 'Live') : over ? (draw ? 'Draw' : won ? 'Won' : 'Lost') : start ? `Starts in ${left(start - now)}` : 'Prep'}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span className="flex max-w-full flex-col items-center gap-1.5">
                <span className={`h-11 ${live ? 'ff-recoil-l' : ''}`}><ClanBadge src={war.badge ?? clans[clan]?.badge} size={44} /></span>
                <span className="font-display max-w-full truncate text-[17px] leading-tight" style={{ color: t.deep }}>{clans[clan]?.name ?? `Frosted ${clan}`}</span>
              </span>
              {score(war.stars, war.destruction, war.attacks_used, t.deep)}
            </div>
            <Swords live={live} color={t.deep} />
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span className="flex max-w-full flex-col items-center gap-1.5">
                <span className={`h-11 ${live ? 'ff-recoil-r' : ''}`}><ClanBadge src={war.opponent_badge} size={44} /></span>
                <span className="font-display max-w-full truncate text-[17px] leading-tight text-ink-2">{war.opponent}</span>
              </span>
              {score(war.opponent_stars, war.opponent_destruction, war.opponent_attacks_used, '#5E5240')}
            </div>
          </div>
          <TugBar us={war.stars} them={war.opponent_stars} color={t.deep} />
          {/* The same lines in every state, so each clan's list starts at the same height. */}
          <span className="text-center text-xs font-bold" style={{ color: !live ? '#7A6C55' : toAttack ? '#B45309' : '#15803D' }}>
            {live ? (toAttack ? `${toAttack} yet to attack` : 'All attacked') : over ? `Ended ${end ? ago(new Date(end).toISOString(), now) : ''}` : `${war.team_size} v ${war.team_size}`}
          </span>
          <span className="text-center text-[11px] font-semibold text-faint">Updated {ago(war.updated_at, now)}</span>
        </div>
        {over && war.recap && <WarRecap clan={clan} war={war} result={draw ? 'Draw' : won ? 'Won' : 'Lost'} recap={war.recap} />}
        <div className="flex min-h-[53px] items-center gap-2 border-b border-hair px-3 py-2">
            {live ? (
              <>
                {mine && (
                  <button type="button" onClick={() => toggle(mine.tag)} className={`min-h-9 cursor-pointer rounded-full border-0 px-3 text-[13px] font-bold ${mineLeft ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]'}`}>
                    You: {mineLeft ? `${mineLeft} ${mineLeft === 1 ? 'attack' : 'attacks'} left` : 'all attacked'}
                  </button>
                )}
                <button type="button" aria-pressed={openOnly} disabled={!open.length} onClick={() => { setOpenOnly((v) => !v); setPicked(null) }}
                  className={`ml-auto min-h-9 cursor-pointer rounded-full border px-3 text-[13px] font-bold disabled:cursor-default disabled:opacity-50 ${openOnly ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`}>
                  Open bases {open.length}
                </button>
              </>
            ) : (
              <span className="text-[13px] font-semibold text-muted">{over ? `${war.pairs.filter((p) => p.them?.best === 3).length} of ${war.team_size} bases three-starred` : 'Preparation day'}</span>
            )}
        </div>
        <div aria-label="Key" className={`${KEY_ROW} border-b border-hair px-3 py-2`}>
          {live && <>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-[#A3957C]" />Attack left</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#16A34A]" />Used</span>
          </>}
          <span className="flex items-center gap-1.5"><span className="text-gold">★</span>Best on this base</span>
        </div>
        <ol className="m-0 list-none px-1.5 py-1">
          {rows.map((p, i) => (
            <Fragment key={p.position}>
              <li className={`grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-0.5 ${i ? 'border-t border-hair' : ''}`}>
                <Base b={p.us} live={live} picked={!!p.us && p.us.tag === picked} onPick={() => toggle(p.us?.tag)} />
                <span className="text-center text-[11px] font-bold tabular-nums text-faint">{p.position}</span>
                <Base b={p.them} right live={live} picked={!!p.them && p.them.tag === picked} onPick={() => toggle(p.them?.tag)} />
              </li>
              {!sideBySide && picked && (p.us?.tag === picked || p.them?.tag === picked) && (
                <li ref={opened} className="mb-1.5 scroll-mb-[72px] overflow-hidden rounded-xl border border-line bg-white">
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-bold text-ink">{pickedName}</span>
                    {pickedActions}
                  </div>
                  {pickedLog.length ? (
                    <ol className="m-0 flex list-none flex-col gap-1 px-2 pb-2">{pickedLog.map((a) => <LogRow key={a.order} a={a} tint={t.tint} now={now} />)}</ol>
                  ) : <p className="m-0 border-t border-hair px-3 py-3 text-sm text-faint">No attacks yet</p>}
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </section>

      {!prep && (
        <section aria-label="Attacks" className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="min-w-0 truncate text-sm font-bold text-ink">{(sideBySide && pickedName) || 'Attacks'}</span>
            {picked && sideBySide ? pickedActions : (
              <span className="flex flex-none items-center gap-3 text-xs font-semibold text-muted">
                <span className="flex items-center gap-1.5"><span aria-hidden="true" style={{ color: t.deep }}>▶</span>Ours</span>
                <span className="flex items-center gap-1.5"><span aria-hidden="true" className="text-faint">◀</span>Enemy</span>
              </span>
            )}
          </div>
          {log.length ? (
            <ol className="m-0 flex list-none flex-col gap-1 px-2 pb-2">
              {log.map((a) => <LogRow key={a.order} a={a} tint={t.tint} now={now} />)}
            </ol>
          ) : <p className="m-0 border-t border-hair px-3.5 py-5 text-sm text-faint">No attacks yet</p>}
        </section>
      )}
    </div>
  )
}

export default function WarTab({ wide }: { wide: boolean }) {
  const { data, loading } = useWarBoard()
  const [pick, setPick] = useState<ClanName | null>(null)
  const { yous } = useYou()
  const now = useNow(30_000)
  const wars = (data?.clans ?? []).filter((c) => c.war)
  // Opens on your own war if you are in one.
  const clan = wars.find((c) => c.clan === pick)
    ?? wars.find((c) => c.war!.state !== 'warEnded' && c.war!.pairs.some((p) => p.us && yous.includes(p.us.tag)))
    ?? wars.find((c) => c.war!.state === 'inWar') ?? wars.find((c) => c.war!.state === 'preparation') ?? wars[0]
  const [nextDay, setNextDay] = useState(false)
  useEffect(() => { setNextDay(false) }, [clan?.clan])
  const shown = clan && (nextDay && clan.next ? clan.next : clan.war!)
  return (
    <main className={wide ? 'mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'flex flex-col gap-3 px-4 pb-6 pt-1'}>
      <ClanSwitch value={clan?.clan ?? 'Fire'} onPick={setPick}
        live={wars.filter((c) => c.war!.state === 'inWar').map((c) => c.clan)}
        off={data ? CLANS.filter((k) => !wars.some((c) => c.clan === k)) : []} />
      {!data ? (
        loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" /> : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">Unavailable right now</div>
      ) : !clan ? (
        <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">No war on</div>
      ) : (
        <>
          {/* During CWL a day's war runs while the next day's prepares. */}
          {clan.next && (
            <div role="group" aria-label="Day" className="flex gap-1.5">
              <button type="button" aria-pressed={!nextDay} onClick={() => setNextDay(false)} className={chip(!nextDay)}>{clan.war!.day ? `Day ${clan.war!.day} · ` : ''}Live</button>
              <button type="button" aria-pressed={nextDay} onClick={() => setNextDay(true)} className={chip(nextDay)}>{clan.next.day ? `Day ${clan.next.day} · ` : ''}Preparation</button>
            </div>
          )}
          <WarBoard key={shown!.start_time} clan={clan.clan} war={shown!} now={now} />
        </>
      )}
    </main>
  )
}
