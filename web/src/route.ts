import { useEffect, useState } from 'react'

// Hash routes: #/ (Lineups), #/stats/<sub>[/<category>], #/plan/<sub>. A player sheet opens over
// Lineups or Stats by appending /p/<tag without #>, and closes by dropping it.
// Old links (#/explore/<kind>, #/leaders/<sub>) are rewritten to their new place.
export type Tab = 'cwl' | 'explore' | 'plan'
export type Route = { tab: Tab; sub: string; kind: string | null; player: string | null; base: string }

export const STATS_SUBS = ['players', 'war', 'upgrades', 'donations', 'capital', 'trends'] as const
export const LEADERS_SUBS = ['builder', 'days', 'attacks', 'members'] as const

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, tag] = h.split(/\/?p\//)
  const player = tag ? '#' + decodeURIComponent(tag) : null
  let parts = path.split('/').filter(Boolean)
  if (parts[0] === 'explore') parts = parts[1] === 'war' || parts[1] === 'upgrades' ? ['stats', parts[1]] : ['stats', 'players', ...parts.slice(1, 2)]
  if (parts[0] === 'plan' || parts[0] === 'leaders') {
    const sub = (LEADERS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'builder'
    return { tab: 'plan', sub, kind: null, player: null, base: `#/plan/${sub}` }
  }
  if (parts[0] === 'stats' && parts[1] === 'clans') parts = ['stats', 'trends']  // renamed 2 Nov 2026
  if (parts[0] === 'stats') {
    const sub = (STATS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'players'
    const kind = sub === 'players' ? parts[2] ?? null : null
    return { tab: 'explore', sub, kind, player, base: `#/stats/${sub}${kind ? '/' + kind : ''}` }
  }
  return { tab: 'cwl', sub: '', kind: null, player, base: '#/' }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      const r = parse()
      // Rewrite an old link in place, so the address bar shows the new route.
      const want = r.base === '#/' ? null : r.base + (r.player ? `/p/${encodeURIComponent(r.player.slice(1))}` : '')
      if (want && window.location.hash !== want) history.replaceState(null, '', want)
      setRoute(r)
    }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** Link to a player's sheet over the current view. */
export const playerHref = (tag: string) => {
  const base = parse().base
  return `${base === '#/' ? '#' : base}/p/${encodeURIComponent(tag.replace(/^#/, ''))}`
}

export const go = {
  to: (hash: string) => { window.location.hash = hash },
  closePlayer: () => { window.location.hash = parse().base },
}
