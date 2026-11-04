import { useCallback, useEffect, useState } from 'react'

// Discord sign-in through the API (/api/auth/*); the session cookie is
// HttpOnly and set on this origin by the Vercel rewrite.
export type Me = {
  user: { id: string; name: string; avatar_url: string | null } | null
  role: 'publisher' | 'leader' | null
  publishers: string[]
  csrf: string | null
  /** False until the Discord app is set up on the server. */
  configured: boolean
  /** How this session signed in; a passcode session is a leader that cannot publish. */
  via: 'passcode' | 'discord' | null
  passcode_enabled: boolean
}
export type AuthState = { status: 'loading' | 'ready'; me: Me }

const SIGNED_OUT: Me = { user: null, role: null, publishers: [], csrf: null, configured: true, via: null, passcode_enabled: false }
// No answer from /auth/me is treated as sign-in not set up yet.
const NOT_SET_UP: Me = { ...SIGNED_OUT, configured: false }

// Dev only: ?as=publisher|leader|member previews each signed-in state.
function devMe(): Me | null {
  if (!import.meta.env.DEV) return null
  const as = new URLSearchParams(window.location.search).get('as')
  if (!as) return null
  return {
    user: { id: '0', name: as === 'publisher' ? 'Waki' : 'Leader', avatar_url: null },
    role: as === 'publisher' || as === 'leader' ? as : null,
    publishers: ['Waki'],
    csrf: 'dev',
    configured: true,
    via: 'discord',
    passcode_enabled: true,
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', me: SIGNED_OUT })
  const load = useCallback(() => {
    const dev = devMe()
    if (dev) return setState({ status: 'ready', me: dev })
    fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : NOT_SET_UP))
      .then((me: Me) => setState({ status: 'ready', me: { ...SIGNED_OUT, ...me } }))
      .catch(() => setState({ status: 'ready', me: NOT_SET_UP }))
  }, [])
  useEffect(load, [load])
  const csrf = state.me.csrf
  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: csrf ? { 'X-CSRF-Token': csrf } : {} }).catch(() => null)
    setState({ status: 'ready', me: SIGNED_OUT })
  }, [csrf])
  return { ...state, signOut }
}

/** ?signin=denied|failed, added by the callback on a failed sign-in; read once at load and dropped from the URL, so a remount cannot lose it. */
function takeSigninError(): 'denied' | 'failed' | null {
  const params = new URLSearchParams(window.location.search)
  const v = params.get('signin')
  if (v !== 'denied' && v !== 'failed') return null
  params.delete('signin')
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
  return v
}

export const signinError = takeSigninError()

export const loginHref = () => `/api/auth/login?return_to=${encodeURIComponent('/#/plan/days')}`
