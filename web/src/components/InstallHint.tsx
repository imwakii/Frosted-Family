import { useEffect, useState } from 'react'

// A one-time nudge on phones to add the app to the home screen. Android can install from a button; iPhones can only be
// told where the option is. Dismissed for good on this device.

const SKIP_KEY = 'ff-install-skip'
type InstallEvent = Event & { prompt: () => Promise<void> }

// The browser offers this once, early, so it is caught before the app renders.
let offer: InstallEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e as InstallEvent; window.dispatchEvent(new Event('ff-install')) })

const skipped = () => { try { return !!localStorage.getItem(SKIP_KEY) } catch { return false } }
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const onIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

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
  return { show: !wide && !gone && !installed() && (!!offer || onIphone()), dismiss }
}

export function InstallHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside aria-label="Add to home screen" className="fixed inset-x-3 bottom-[calc(66px+env(safe-area-inset-bottom))] z-20 flex items-center gap-2.5 rounded-2xl bg-ink py-2 pl-2.5 pr-1.5 text-white shadow-[0_8px_24px_rgba(43,33,20,.3)]">
      <img src="/app-icon-192.png" alt="" width={36} height={36} className="flex-none rounded-[9px]" />
      <span className="flex min-w-0 flex-auto flex-col">
        <span className="text-[13px] font-bold">Add to your home screen</span>
        {!offer && <span className="text-xs text-white/70">Tap Share, then Add to Home Screen</span>}
      </span>
      {offer && (
        <button type="button" onClick={() => { offer?.prompt(); onDismiss() }}
          className="min-h-9 flex-none cursor-pointer rounded-full border-0 bg-white px-3 text-[13px] font-bold text-ink">Install</button>
      )}
      <button type="button" aria-label="Not now" onClick={onDismiss}
        className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-white/70 hover:text-white">×</button>
    </aside>
  )
}
