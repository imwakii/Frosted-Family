import { useCallback, useEffect, useState } from 'react'
import { useAuth, type Me } from './auth'
import CalendarTab from './components/CalendarTab'
import CwlTab from './components/CwlTab'
import ClanSheet from './components/ClanSheet'
import CompareSheet from './components/CompareSheet'
import RivalSheet from './components/RivalSheet'
import UpgradeHistory from './components/UpgradeHistory'
import UpgradeSheet from './components/UpgradeSheet'
import Welcome from './components/Welcome'
import Settings from './components/Settings'
import CwlGroup from './components/CwlGroup'
import ExploreTab from './components/ExploreTab'
import LogTab from './components/LogTab'
import PlanTab from './components/PlanTab'
import PlayerSheet from './components/PlayerSheet'
import WarTab from './components/WarTab'
import { InstallHint, useInstallHint } from './components/InstallHint'
import { JumpToYou, YouChip } from './components/You'
import { fetchPlayer, useRoster, useWar, useWide } from './data'
import { useVisits } from './visits'
import { decodeTag, go, onDrill, useRoute } from './route'
import { CalendarButton, SubNav } from './components/ui'

const CWL_SUBS = [{ id: 'lineups', label: 'Lineups', href: '#/cwl' }, { id: 'group', label: 'Group', href: '#/cwl/group' }]
const WAR_SUBS = [{ id: 'latest', label: 'Current', href: '#/war' }, { id: 'log', label: 'War log', href: '#/war/log' }]

const TABS = [
  { id: 'war', label: 'War', href: '#/war', icon: <path d="M5 5l14 14M19 5L5 19M4 16l4 4M20 16l-4 4" /> },
  { id: 'cwl', label: 'CWL', href: '#/cwl', icon: <path d="M8.5 20.5h7M12 15.5v5M7.5 4h9v6.5a4.5 4.5 0 0 1-9 0V4zM7.5 6.5H4.5c0 2 1 3.2 3 3.6M16.5 6.5h3c0 2-1 3.2-3 3.6" /> },
  { id: 'log', label: 'Log', href: '#/log', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { id: 'explore', label: 'Stats', href: '#/stats/players', icon: <path d="M5 20V10M12 20V4M19 20v-7" /> },
  { id: 'plan', label: 'Plan', href: '#/plan/days', icon: <path d="M7 4v16M17 4v16M3 8h8M13 16h8" /> },
] as const

function Account({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  if (!me.user) return null
  const initial = me.user.name.slice(0, 1).toUpperCase()
  return (
    <span className="relative">
      <button type="button" aria-expanded={open} aria-label={`Account: ${me.user.name}`} onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 cursor-pointer items-center rounded-full border border-line bg-white p-1 text-[13px] font-bold text-ink-2 hover:bg-page">
        {me.user.avatar_url
          ? <img src={me.user.avatar_url} alt="" className="size-7 rounded-full" />
          : <span className="flex size-7 items-center justify-center rounded-full bg-well text-xs">{initial}</span>}
      </button>
      {open && <span aria-hidden="true" className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
      {open && (
        <span className="ff-fade absolute right-0 top-[calc(100%+6px)] z-40 flex min-w-[160px] flex-col rounded-xl border border-line bg-white p-1 shadow-[0_10px_30px_rgba(43,33,20,.12)]">
          <span className="px-3 py-2 text-[13px] font-bold text-ink">{me.user.name}</span>
          <button type="button" onClick={() => { setOpen(false); onSignOut() }}
            className="min-h-10 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-left text-sm font-semibold text-ink-2 hover:bg-page">Sign out</button>
        </span>
      )}
    </span>
  )
}

export default function App() {
  const { roster, error, reload } = useRoster()
  const war = useWar()
  const wide = useWide()
  const roomy = useWide('(min-width: 1024px)')
  const route = useRoute()
  const auth = useAuth()
  const install = useInstallHint(wide)
  const [q, setQ] = useState('')
  const visits = useVisits()
  // A finger on a player's row starts their card loading, ahead of the tap landing.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.('[data-tag], a[href*="/p/"]')
      const href = el?.getAttribute('href')?.split('/p/')[1]
      const decoded = href ? decodeTag(href) : null
      const tag = el?.getAttribute('data-tag') ?? (decoded ? `#${decoded}` : null)
      if (tag) void fetchPlayer(tag)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [])
  onDrill(useCallback(() => setQ(''), []))
  const closeSheet = useCallback(() => go.closePlayer(), [])
  // Plan is for leaders: a member reaches sign-in from the footer's link, and sees the tab only while on it.
  const tabs = TABS.filter((t) => t.id !== 'plan' || !!auth.me.user || route.tab === 'plan')
  // On Plan a signed-in account sits beside your card, and narrower screens shrink the other two to fit.
  const account = route.tab === 'plan' && auth.me.user ? <Account me={auth.me} onSignOut={auth.signOut} /> : null
  const you = roster && <YouChip roster={roster} compact={!roomy && !!account} />
  const corner = wide
    ? <span className="flex items-center gap-2">{you}{account}<CalendarButton current={route.tab === 'calendar'} /><Settings wide roster={roster} leader={!!auth.me.role} /></span>
    : <span className="flex min-w-0 items-center gap-2">{you}{account}<CalendarButton current={route.tab === 'calendar'} /><Settings wide={false} roster={roster} leader={!!auth.me.role} /></span>

  return (
    <div className={`min-h-dvh ${wide ? '' : 'pb-[calc(58px+env(safe-area-inset-bottom))]'}`}>
      {wide ? (
        <header className="border-b border-gold-line bg-white">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-3 lg:gap-x-6 px-[clamp(16px,3vw,32px)] py-3">
            <span className="font-display text-2xl text-brand">Frosted Family</span>
            <nav aria-label="Sections" className="flex gap-1 rounded-xl bg-[#EFE6D2] p-1">
              {tabs.map((t) => (
                <a key={t.id} href={t.href} aria-current={route.tab === t.id ? 'page' : undefined}
                  className={`flex min-h-[38px] items-center rounded-[9px] px-3 font-bold lg:px-[18px] no-underline ${route.tab === t.id ? 'bg-white text-ink shadow-[0_1px_3px_rgba(43,33,20,.12),inset_0_-2px_0_var(--color-gold)]' : 'text-muted hover:text-ink'}`}>
                  {t.label}
                </a>
              ))}
            </nav>
            <span className="ml-auto">{corner}</span>
          </div>
        </header>
      ) : (
        <header className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
          <span className="font-display flex-none text-[clamp(20px,6vw,24px)] text-brand">Frosted Family</span>
          <div className="flex min-h-11 min-w-0 items-center justify-end">{corner}</div>
        </header>
      )}

      <div key={route.tab} className="ff-fade">
      {error ? (
        <p className="px-4 pt-16 text-center text-sm font-semibold text-faint">Roster unavailable. Try again shortly.</p>
      ) : !roster ? (
        <div aria-busy="true" aria-label="Loading" className="mx-auto flex max-w-[1320px] flex-col gap-3 px-4 pt-4">
          {[48, 120, 46, 320].map((h, i) => <div key={i} className="animate-pulse rounded-2xl bg-well" style={{ height: h }} />)}
        </div>
      ) : route.tab === 'war' ? (
        <>
          <SubNav items={WAR_SUBS} current={route.sub} wide={wide} />
          <WarTab wide={wide} roster={roster} sub={route.sub} opened={route.kind} />
        </>
      ) : route.tab === 'plan' ? (
        <PlanTab sub={route.sub} roster={roster} onPublished={reload} me={auth.me} ready={auth.status === 'ready'} wide={wide} onSignOut={auth.signOut} />
      ) : route.tab === 'calendar' ? (
        <CalendarTab wide={wide} />
      ) : route.tab === 'log' ? (
        <LogTab roster={roster} q={q} setQ={setQ} wide={wide} />
      ) : route.tab === 'explore' ? (
        <ExploreTab sub={route.sub} kind={route.kind} q={q} setQ={setQ} wide={wide} />
      ) : (
        <>
          <SubNav items={CWL_SUBS} current={route.sub} wide={wide} />
          {route.sub !== 'lineups' ? <CwlGroup wide={wide} /> : <CwlTab roster={roster} war={war} wide={wide} q={q} setQ={setQ} />}
        </>
      )}
      </div>

      {!!auth.me.user && !!visits?.total && (
        <p className="m-0 px-4 pb-1 pt-3 text-center text-xs font-semibold text-muted">
          {visits.total.toLocaleString('en-GB')} {visits.total === 1 ? 'visitor' : 'visitors'} so far · {visits.week.toLocaleString('en-GB')} this week
        </p>
      )}
      <footer className="mx-auto max-w-[1320px] px-4 pb-4 pt-1 text-center text-[10px] text-faint opacity-70">
        {!auth.me.user && <><a href="#/plan" className="text-faint underline hover:text-muted">Leader sign-in</a>{' · '}</>}
        Unofficial, not endorsed by Supercell.{' '}
        <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noopener noreferrer" className="text-faint underline hover:text-muted">Fan Content Policy</a>
      </footer>

      {!route.player && (install.show ? <InstallHint onDismiss={install.dismiss} /> : wide && route.tab !== 'plan' && route.tab !== 'calendar' && <JumpToYou wide={wide} />)}

      {roster && <Welcome roster={roster} wide={wide} />}
      {roster && route.player &&<PlayerSheet tag={route.player} roster={roster} wide={wide} onClose={closeSheet} />}
      {roster && route.clan && !route.player && <ClanSheet clan={route.clan} roster={roster} wide={wide} onClose={closeSheet} />}
      {roster && route.compare && !route.player && <CompareSheet roster={roster} {...route.compare} wide={wide} onClose={closeSheet} />}
      {route.upgrade && !route.player && <UpgradeSheet {...route.upgrade} wide={wide} onClose={closeSheet} />}
      {roster && route.history && !route.player && <UpgradeHistory key={route.history.tag} {...route.history} roster={roster} wide={wide} onClose={closeSheet} />}
      {route.rival && !route.player && <RivalSheet clan={route.rival.clan} tag={route.rival.tag} wide={wide} onClose={closeSheet} />}

      {!wide && (
        <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-gold-line bg-white pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <a key={t.id} href={t.href} aria-current={route.tab === t.id ? 'page' : undefined}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-[3px] text-xs font-bold no-underline ${route.tab === t.id ? 'text-ink shadow-[inset_0_2px_0_var(--color-gold)]' : 'text-faint'}`}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{t.icon}</svg>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
