import { useEffect, useState } from 'react'
import { device } from '../alerts'
import InstallGuide from './InstallGuide'

// A one-time nudge on phones and tablets to add the app to the home screen, dismissed for good on this device. Android can
// install from a button; an iPhone or iPad can only be shown the way. Settings keeps a way back to the guide.

const SKIP_KEY = 'ff-install-skip'
type InstallEvent = Event & { prompt: () => Promise<void> }

// The browser offers this once, early, so it is caught before the app renders.
let offer: InstallEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e as InstallEvent; window.dispatchEvent(new Event('ff-install')) })
let added = false
window.addEventListener('appinstalled', () => { added = true })

const skipped = () => { try { return !!localStorage.getItem(SKIP_KEY) } catch { return false } }
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Whether adding to the home screen means anything here: a phone or tablet where it isn't already added. */
export const canInstall = () => !added && !installed() && device() !== 'other'
export const canPrompt = () => !!offer
/** The browser's offer only works once. */
export const installNow = () => { offer?.prompt(); offer = null; window.dispatchEvent(new Event('ff-install')) }

export function useInstallHint(wide: boolean) {
  const [, redraw] = useState(0)
  const [gone, setGone] = useState(skipped)
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    const done = () => setGone(true)
    window.addEventListener('ff-install', on)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('ff-install', on); window.removeEventListener('appinstalled', done) }
  }, [])
  const dismiss = () => {
    setGone(true)
    try { localStorage.setItem(SKIP_KEY, '1') } catch { /* private mode */ }
  }
  return { show: !gone && canInstall() && (!!offer || device() === 'iphone') && (!wide || device() !== 'other'), dismiss }
}

export function InstallHint({ wide, onDismiss }: { wide: boolean; onDismiss: () => void }) {
  const [guide, setGuide] = useState(false)
  return (
    <>
      <aside aria-label="Add to home screen" className={`fixed z-20 flex items-center gap-2.5 rounded-2xl bg-ink py-2 pl-2.5 pr-1.5 text-white shadow-[0_8px_24px_rgba(43,33,20,.3)] ${wide ? 'bottom-4 left-4 w-[380px]' : 'inset-x-3 bottom-[calc(66px+env(safe-area-inset-bottom))]'}`}>
        <img src="/app-icon-192.png" alt="" width={36} height={36} className="flex-none rounded-[9px]" />
        <span className="flex min-w-0 flex-auto flex-col">
          <span className="text-[13px] font-bold">Add to home screen</span>
          <span className="text-xs text-white/70">Opens like an app</span>
        </span>
        {canPrompt()
          ? <button type="button" onClick={() => { installNow(); onDismiss() }} className="min-h-9 flex-none cursor-pointer rounded-full border-0 bg-white px-3 text-[13px] font-bold text-ink">Install</button>
          : <button type="button" onClick={() => setGuide(true)} className="min-h-9 flex-none cursor-pointer rounded-full border-0 bg-white px-3 text-[13px] font-bold text-ink">Show me</button>}
        <button type="button" aria-label="Not now" onClick={onDismiss}
          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-white/70 hover:text-white">×</button>
      </aside>
      {guide && <InstallGuide wide={wide} onClose={() => setGuide(false)} />}
    </>
  )
}
