// Alerts on this phone: asking for permission, signing up with the server (server/push.py), and keeping it told which
// accounts are this person's. iPhones only offer push once the app is on the home screen.

export type AlertPrefs = { attacks: boolean; days: boolean; war: boolean }
export type AlertState = 'hidden' | 'install' | 'blocked' | 'off' | 'on'

const PREFS = 'ff-alerts'
const DEFAULTS: AlertPrefs = { attacks: true, days: true, war: false }

export function readPrefs(): AlertPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } } catch { return DEFAULTS }
}
const savePrefs = (p: AlertPrefs) => { try { localStorage.setItem(PREFS, JSON.stringify(p)) } catch { /* private mode */ } }

/** iPads running desktop-class Safari call themselves a Mac, so a touch screen gives them away. */
export const onIpad = () => /ipad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIos = () => /iphone|ipod/i.test(navigator.userAgent) || onIpad()
export const device = () => (isIos() ? 'iphone' : /android/i.test(navigator.userAgent) ? 'android' : 'other')
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const current = async () => (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription() ?? null

export async function alertState(): Promise<AlertState> {
  if (!supported()) return isIos() && !installed() ? 'install' : 'hidden'
  if (Notification.permission === 'denied') return 'blocked'
  return (await current()) ? 'on' : 'off'
}

const post = async (path: string, body: unknown) => {
  const r = await fetch(`/api/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(String(r.status))
}
const register = (sub: PushSubscription, tags: string[], alerts: AlertPrefs) => post('subscribe', { ...sub.toJSON(), tags, alerts })

const toBytes = (b64url: string) => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** Called from a tap, as browsers require. Returns the state it ended in; throws if the server could not be told. */
export async function turnOn(tags: string[]): Promise<AlertState> {
  if ((await Notification.requestPermission()) !== 'granted') return alertState()
  await navigator.serviceWorker.register('/sw.js')
  const reg = await navigator.serviceWorker.ready
  const r = await fetch('/api/push/key')
  if (!r.ok) throw new Error(String(r.status))
  const { key } = await r.json() as { key: string }
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) })
  try {
    await register(sub, tags, readPrefs())
  } catch (e) {
    await sub.unsubscribe()
    throw e
  }
  return 'on'
}

export async function turnOff() {
  const sub = await current()
  if (!sub) return
  await post('unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe()
}

export async function setPrefs(p: AlertPrefs, tags: string[]) {
  savePrefs(p)
  const sub = await current()
  if (sub) await register(sub, tags, p)
}

/** A change of accounts reaches the server, or alerts would keep following the old list. */
export async function syncAccounts(tags: string[]) {
  if (!supported()) return
  const sub = await current()
  if (sub) await register(sub, tags, readPrefs()).catch(() => undefined)
}
