import { useEffect, useState } from 'react'
import { useYou, YouTag } from './You'
import { useClans } from '../clash'
import { ago, type ClanWar, useWarBoard, type WarAttack, type WarBase } from '../leaders'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { ClanBadge, Stars, Th, useNow } from './ui'

// Each clan's war, side by side: our bases and badge on the left, the enemy's on the right, facing by map position.
// The attack log below says who hit whom, how well and roughly when; tapping a base narrows it to that base.
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
const ENEMY = '#94A3B8'

// The tab's crossed swords between the two clans; they clash, with a spark, while the war is live.
function Swords({ live, color }: { live: boolean; color: string }) {
  return (
    <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,.12)]">
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" className="overflow-visible">
        <g className={live ? 'ff-sword-a' : ''}><path d="M5 5l14 14M16 20l4-4" /></g>
        <g className={live ? 'ff-sword-b' : ''}><path d="M19 5L5 19M4 16l4 4" /></g>
        {live && <circle cx="12" cy="10" r="2.2" fill="#F59E0B" stroke="none" className="ff-spark" />}
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
              {Array.from({ length: b.allowed }, (_, k) => <span key={k} className={`size-[7px] rounded-full ${k < b.used ? 'bg-[#16A34A]' : 'border-[1.5px] border-[#94A3B8]'}`} />)}
            </span>
          )}
          {b.best !== null && <Stars n={b.best} />}
        </span>
      </span>
    </button>
  )
}

function LogRow({ a, accent, now }: { a: WarAttack; accent: string; now: number }) {
  return (
    <li className="flex flex-col gap-0.5 border-t border-hair py-2 pl-3 pr-3.5" style={{ boxShadow: `inset 3px 0 0 ${a.ours ? accent : ENEMY}` }}>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
        <span className="flex-none text-[11px] font-bold tabular-nums text-faint">{a.attacker.position}</span>
        <span className="min-w-0 truncate">{a.attacker.name}</span>
        <span aria-label="attacked" className="flex-none font-extrabold text-faint">→</span>
        <span className="flex-none text-[11px] font-bold tabular-nums text-faint">{a.defender.position}</span>
        <span className="min-w-0 truncate">{a.defender.name}</span>
      </span>
      <span className="flex items-center gap-2 text-xs">
        <Stars n={a.stars} />
        <span className="font-bold tabular-nums text-ink-2">{Math.round(a.destruction)}%</span>
        {a.seen_at && <span title="To within about a minute" className="ml-auto font-semibold text-faint">~{ago(a.seen_at, now)}</span>}
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
  useEffect(() => { setPicked(null); setOpenOnly(false) }, [clan])
  const end = at(war.end_time), start = at(war.start_time)
  const live = war.state === 'inWar', over = war.state === 'warEnded', prep = war.state === 'preparation'
  const won = war.stars > war.opponent_stars || (war.stars === war.opponent_stars && war.destruction > war.opponent_destruction)
  const draw = war.stars === war.opponent_stars && war.destruction === war.opponent_destruction
  const toAttack = war.pairs.filter((p) => p.us && p.us.used < p.us.allowed).length
  const total = war.team_size * war.attacks_allowed
  // Bases still worth hitting: not yet three-starred.
  const open = war.pairs.filter((p) => p.them && p.them.best !== 3)
  const rows = openOnly ? open : war.pairs
  // All your accounts in this war, together; tapping goes to the first with an attack left.
  const accounts = war.pairs.flatMap((p) => (p.us && yous.includes(p.us.tag) ? [p.us] : []))
  const mineLeft = accounts.reduce((n, b) => n + b.allowed - b.used, 0)
  const mine = accounts.find((b) => b.used < b.allowed) ?? accounts[0]
  const log = picked ? war.log.filter((a) => a.attacker.tag === picked || a.defender.tag === picked) : war.log
  const pickedName = picked ? war.pairs.flatMap((p) => [p.us, p.them]).find((b) => b?.tag === picked)?.name : null
  const toggle = (tag?: string) => tag && setPicked((p) => (p === tag ? null : tag))
  const score = (stars: number, pct: number, used: number, deep: string, right?: boolean) => (
    <span className={`flex flex-col gap-0.5 ${right ? 'items-end' : 'items-start'} ${prep ? 'invisible' : ''}`}>
      <span className="font-display flex items-baseline gap-1 text-[26px] leading-none tabular-nums" style={{ color: deep }}>{stars}<span className="text-base text-gold">★</span></span>
      <span className="text-[11px] font-semibold tabular-nums text-muted">{Math.round(pct)}% · {used}/{total}</span>
    </span>
  )
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label={`${clan} against ${war.opponent}`} className="overflow-hidden rounded-[18px] border border-line bg-white">
        <div className="flex flex-col gap-2 p-3.5" style={{ background: t.tint }}>
          <div className="flex justify-center">
            <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${live ? 'bg-white text-[#15803D]' : over ? 'bg-white/60 text-muted' : 'bg-[#FFEDD5] text-[#C2410C]'}`}>
              {war.kind === 'cwl' ? `Day ${war.day ?? '?'} · ` : ''}{live ? (end ? `${left(end - now)} left` : 'Live') : over ? (draw ? 'Draw' : won ? 'Won' : 'Lost') : start ? `Starts in ${left(start - now)}` : 'Prep'}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2">
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <span className="h-11"><ClanBadge src={war.badge ?? clans[clan]?.badge} size={44} /></span>
              <span className="font-display max-w-full truncate text-[17px] leading-tight" style={{ color: t.deep }}>{clan}</span>
              {score(war.stars, war.destruction, war.attacks_used, t.deep)}
            </div>
            <Swords live={live} color={t.deep} />
            <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
              <span className="h-11"><ClanBadge src={war.opponent_badge} size={44} /></span>
              <span className="font-display max-w-full truncate text-[17px] leading-tight text-ink-2">{war.opponent}</span>
              {score(war.opponent_stars, war.opponent_destruction, war.opponent_attacks_used, '#475569', true)}
            </div>
          </div>
          <TugBar us={war.stars} them={war.opponent_stars} color={t.accent} />
          {/* The same lines in every state, so each clan's list starts at the same height. */}
          <span className="text-center text-xs font-bold" style={{ color: !live ? '#64748B' : toAttack ? '#B45309' : '#15803D' }}>
            {live ? (toAttack ? `${toAttack} yet to attack` : 'All attacked') : over ? `Ended ${end ? ago(new Date(end).toISOString(), now) : ''}` : `${war.team_size} v ${war.team_size}`}
          </span>
          <span className="text-center text-[11px] font-semibold text-faint">Updated {ago(war.updated_at, now)}</span>
        </div>
        <div className="flex min-h-[53px] items-center gap-2 border-b border-hair px-3 py-2">
            {live && mine && (
              <button type="button" onClick={() => toggle(mine.tag)} className={`min-h-9 cursor-pointer rounded-full border-0 px-3 text-[13px] font-bold ${mineLeft ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]'}`}>
                You: {mineLeft ? `${mineLeft} ${mineLeft === 1 ? 'attack' : 'attacks'} left` : 'all attacked'}
              </button>
            )}
            <button type="button" aria-pressed={openOnly} disabled={!open.length} onClick={() => setOpenOnly((v) => !v)}
              className={`ml-auto min-h-9 cursor-pointer rounded-full border px-3 text-[13px] font-bold disabled:cursor-default disabled:opacity-50 ${openOnly ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`}>
              Open bases {open.length}
            </button>
        </div>
        <ol className="m-0 list-none px-1.5 py-1">
          {rows.map((p, i) => (
            <li key={p.position} className={`grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-0.5 ${i ? 'border-t border-hair' : ''}`}>
              <Base b={p.us} live={live} picked={!!p.us && p.us.tag === picked} onPick={() => toggle(p.us?.tag)} />
              <span className="text-center text-[11px] font-bold tabular-nums text-faint">{p.position}</span>
              <Base b={p.them} right live={live} picked={!!p.them && p.them.tag === picked} onPick={() => toggle(p.them?.tag)} />
            </li>
          ))}
        </ol>
        <div aria-label="Key" className="flex flex-wrap justify-center gap-x-[18px] gap-y-1 border-t border-hair px-3 py-2.5 text-xs font-semibold text-muted">
          {live && <>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-[#94A3B8]" />Attack left</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#16A34A]" />Used</span>
          </>}
          <span className="flex items-center gap-1.5"><span className="text-gold">★</span>Best on this base</span>
        </div>
      </section>

      {!prep && (
        <section aria-label="Attacks" className="overflow-hidden rounded-[18px] border border-line bg-white">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="min-w-0 truncate text-sm font-bold text-ink">{pickedName ?? 'Attacks'}</span>
            {picked ? (
              <button type="button" onClick={() => setPicked(null)} className="min-h-8 flex-none cursor-pointer rounded-full border border-line bg-white px-2.5 text-xs font-bold text-ink-2 hover:bg-page">Show all</button>
            ) : (
              <span className="flex flex-none items-center gap-3 text-xs font-semibold text-muted">
                <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded" style={{ background: t.accent }} />Ours</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded" style={{ background: ENEMY }} />Enemy</span>
              </span>
            )}
          </div>
          {log.length ? (
            <ol className="m-0 list-none p-0">
              {log.map((a) => <LogRow key={a.order} a={a} accent={t.accent} now={now} />)}
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
    ?? wars.find((c) => c.war!.state === 'inWar') ?? wars[0]
  return (
    <main className={wide ? 'mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'flex flex-col gap-3 px-4 pb-6 pt-3'}>
      {wars.length > 1 && (
        <nav aria-label="Clan" className="grid w-full max-w-[480px] gap-1 rounded-xl bg-well p-1" style={{ gridTemplateColumns: `repeat(${wars.length}, 1fr)` }}>
          {wars.map((c) => (
            <button key={c.clan} type="button" aria-pressed={c.clan === clan?.clan} onClick={() => setPick(c.clan)}
              className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-0 text-[15px] font-bold ${c.clan === clan?.clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
              style={c.clan === clan?.clan ? { color: CLAN[c.clan].deep } : undefined}>
              {c.clan}
              {c.war!.state === 'inWar' && <span className="ff-live size-1.5 rounded bg-[#16A34A]" />}
            </button>
          ))}
        </nav>
      )}
      {!data ? (
        loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" /> : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">Unavailable right now</div>
      ) : !clan ? (
        <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">No war on</div>
      ) : <WarBoard clan={clan.clan} war={clan.war!} now={now} />}
    </main>
  )
}
