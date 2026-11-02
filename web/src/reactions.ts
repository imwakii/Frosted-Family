import { useEffect, useState } from 'react'
import { takeSigninError } from './auth'

// GET /api/reactions: counts for everyone; who reacted, and reacting, once signed in with Discord. An older server has
// no such route, and the bars stay hidden. A tap while signed out goes through Discord and lands when they come back.
export type Reaction = { n: number; mine: boolean; names?: string[] }
export type Reactions = Record<string, Reaction>
type Store = { ready: boolean; signedIn: boolean; csrf: string | null; emojis: string[]; byTarget: Record<string, Reactions>; refused: string | null }

const PENDING = 'ff-react-pending'
let store: Store = { ready: false, signedIn: false, csrf: null, emojis: [], byTarget: {}, refused: null }
let started = false
const listeners = new Set<() => void>()
const set = (s: Partial<Store>) => { store = { ...store, ...s }; listeners.forEach((f) => f()) }
const read = () => { try { return sessionStorage.getItem(PENDING) } catch { return null } }
const write = (v: string | null) => { try { if (v) sessionStorage.setItem(PENDING, v); else sessionStorage.removeItem(PENDING) } catch { /* private mode */ } }

// Dev only: ?as=member previews a signed-in member with some reactions; nothing leaves the page.
const dev = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('as')

async function send(target: string, emoji: string) {
  if (dev()) {
    const had = store.byTarget[target]?.[emoji]
    const next = { ...store.byTarget[target] }
    if (had?.mine) { if (had.n > 1) next[emoji] = { n: had.n - 1, mine: false, names: had.names?.filter((x) => x !== 'You') }; else delete next[emoji] }
    else next[emoji] = { n: (had?.n ?? 0) + 1, mine: true, names: [...(had?.names ?? []), 'You'] }
    return set({ byTarget: { ...store.byTarget, [target]: next } })
  }
  const r = await fetch('/api/reactions', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': store.csrf ?? '' },
    body: JSON.stringify({ target, emoji }),
  }).catch(() => null)
  if (r?.ok) set({ byTarget: { ...store.byTarget, [target]: await r.json() } })
}

export function react(target: string, emoji: string) {
  if (store.signedIn) return void send(target, emoji)
  write(JSON.stringify({ target, emoji }))
  window.location.href = `/api/auth/login?return_to=${encodeURIComponent(`/${window.location.hash}`)}`
}

function start() {
  if (started) return
  started = true
  if (dev()) return set({ ready: true, signedIn: true, csrf: 'dev', emojis: ['\u{1F525}', '\u{1F44F}', '\u{1F602}'] })
  const pending = read()
  // The Plan tab reads its own sign-in result.
  const refused = !window.location.hash.startsWith('#/plan') && takeSigninError()
  fetch('/api/reactions', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
    .then((d) => {
      if (!d?.reactions) return
      const p = pending ? JSON.parse(pending) as { target: string; emoji: string } : null
      set({ ready: true, signedIn: !!d.member, csrf: d.member?.csrf ?? null, emojis: d.emojis, byTarget: d.reactions, refused: refused && p ? p.target : null })
      write(null)
      if (p && d.member && !d.reactions[p.target]?.[p.emoji]?.mine) void send(p.target, p.emoji)
    })
    .catch(() => {})
}

export function useReactions() {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    listeners.add(on)
    start()
    return () => { listeners.delete(on) }
  }, [])
  return store
}
