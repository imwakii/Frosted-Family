import { useCallback, useState } from 'react'
import { useAuth, type Me } from './auth'
import CwlTab from './components/CwlTab'
import ExploreTab from './components/ExploreTab'
import PlanTab from './components/PlanTab'
import PlayerSheet from './components/PlayerSheet'
import { useRoster, useWar, useWide } from './data'
import { go, useRoute } from './route'
import { fmtStart } from './theme'

const TABS = [
  { id: 'cwl', label: 'CWL', href: '#/', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { id: 'explore', label: 'Explore', href: '#/explore', icon: <path d="M5 20V10M12 20V4M19 20v-7" /> },
  { id: 'plan', label: 'Plan', href: '#/plan', icon: <path d="M7 4v16M17 4v16M3 8h8M13 16h8" /> },
] as const

function Account({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  if (!me.user) return null
  const initial = me.user.name.slice(0, 1).toUpperCase()
  return (
    <span className="relative">
      <button type="button" aria-expanded={open} aria-label={`Account: ${me.user.name}`} onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-[13px] font-bold text-ink-2 hover:bg-page">
        {me.user.avatar_url
          ? <img src={me.user.avatar_url} alt="" className="size-7 rounded-full" />
          : <span className="flex size-7 items-center justify-center rounded-full bg-well text-xs">{initial}</span>}
        <span className="max-w-[120px] truncate">{me.user.name}</span>
      </button>
      {open && <span aria-hidden="true" className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
      {open && (
        <span className="ff-fade absolute right-0 top-[calc(100%+6px)] z-40 flex min-w-[160px] flex-col rounded-xl border border-line bg-white p-1 shadow-[0_10px_30px_rgba(15,23,42,.12)]">
          <button type="button" onClick={() => { setOpen(false); onSignOut() }}
            className="min-h-10 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-left text-sm font-semibold text-ink-2 hover:bg-page">Sign out</button>
        </span>
      )}
    </span>
  )
}

export default function App() {
  const { roster, error } = useRoster()
  const war = useWar()
  const wide = useWide()
  const route = useRoute()
  const auth = useAuth()
  const [q, setQ] = useState('')
  const closeSheet = useCallback(() => go.closePlayer(), [])
  const start = fmtStart(roster?.cwlStart ?? null)
  const corner = route.tab === 'plan' && auth.me.user ? <Account me={auth.me} onSignOut={auth.signOut} /> : start && (
    <span className="whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-[5px] text-xs font-bold text-muted md:px-3 md:py-1.5 md:text-[13px]">CWL · {start}</span>
  )

  return (
    <div className={`min-h-dvh ${wide ? '' : 'pb-[calc(58px+env(safe-area-inset-bottom))]'}`}>
      {wide ? (
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-3 px-[clamp(16px,3vw,32px)] py-3">
            <span className="font-display text-2xl text-brand">Frosted Family</span>
            <nav aria-label="Sections" className="flex gap-1 rounded-xl bg-[#EEF1F6] p-1">
              {TABS.map((t) => (
                <a key={t.id} href={t.href} aria-current={route.tab === t.id ? 'page' : undefined}
                  className={`flex min-h-[38px] items-center rounded-[9px] px-[18px] font-bold no-underline ${route.tab === t.id ? 'bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'text-muted hover:text-ink'}`}>
                  {t.label}
                </a>
              ))}
            </nav>
            <span className="ml-auto">{corner}</span>
          </div>
        </header>
      ) : (
        <header className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
          <span className="font-display text-2xl text-brand">Frosted Family</span>
          {corner}
        </header>
      )}

      {error ? (
        <p className="px-4 pt-16 text-center text-sm font-semibold text-faint">Roster unavailable. Try again shortly.</p>
      ) : !roster ? (
        <div aria-busy="true" aria-label="Loading" className="mx-auto flex max-w-[1320px] flex-col gap-3 px-4 pt-4">
          {[48, 120, 46, 320].map((h, i) => <div key={i} className="animate-pulse rounded-2xl bg-well" style={{ height: h }} />)}
        </div>
      ) : route.tab === 'plan' ? (
        <PlanTab roster={roster} me={auth.me} ready={auth.status === 'ready'} onSignOut={auth.signOut} />
      ) : route.tab === 'explore' ? (
        <ExploreTab kind={route.kind} q={q} setQ={setQ} wide={wide} />
      ) : (
        <CwlTab roster={roster} war={war} wide={wide} q={q} setQ={setQ} />
      )}

      <footer className="mx-auto max-w-[1320px] px-4 pb-6 pt-2 text-center text-[11px] leading-relaxed text-faint">
        This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy:{' '}
        <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noopener noreferrer" className="text-faint underline hover:text-muted">www.supercell.com/fan-content-policy</a>.
      </footer>

      {roster && route.player &&<PlayerSheet tag={route.player} roster={roster} wide={wide} onClose={closeSheet} />}

      {!wide && (
        <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <a key={t.id} href={t.href} aria-current={route.tab === t.id ? 'page' : undefined}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-[3px] text-xs font-bold no-underline ${route.tab === t.id ? 'text-action' : 'text-faint'}`}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{t.icon}</svg>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
