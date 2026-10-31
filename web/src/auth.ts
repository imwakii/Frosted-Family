import { useCallback, useEffect, useState } from 'react'

// Discord sign-in through the API (/api/auth/*); the session cookie is
// HttpOnly and set on this origin by the Vercel rewrite.
export type Me = {
  user: { id: string; name: string; avatar_url: string | null } | null
  role: 'publisher' | 'leader' | null
  publishers: string[]
}
export type AuthState = { status: 'loading' | 'ready'; me: Me }

const SIGNED_OUT: Me = { user: null, role: null, publishers: [] }

// Dev only: ?as=publisher|leader|member previews each signed-in state.
function devMe(): Me | null {
  if (!import.meta.env.DEV) return null
  const as = new URLSearchParams(window.location.search).get('as')
  if (!as) return null
  return {
    user: { id: '0', name: as === 'publisher' ? 'Waki' : 'Leader', avatar_url: null },
    role: as === 'publisher' || as === 'leader' ? as : null,
    publishers: ['Waki'],
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', me: SIGNED_OUT })
  const load = useCallback(() => {
    const dev = devMe()
    if (dev) return setState({ status: 'ready', me: dev })
    fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : SIGNED_OUT))
      .then((me: Me) => setState({ status: 'ready', me: { ...SIGNED_OUT, ...me } }))
      .catch(() => setState({ status: 'ready', me: SIGNED_OUT }))
  }, [])
  useEffect(load, [load])
  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    setState({ status: 'ready', me: SIGNED_OUT })
  }, [])
  return { ...state, signOut }
}

export const loginHref = () => `/api/auth/login?return_to=${encodeURIComponent('/#/plan')}`
