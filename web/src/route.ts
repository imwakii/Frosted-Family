import { useEffect, useState } from 'react'

// Hash routes: #/ (CWL), #/explore/<kind>, #/plan. A player sheet opens over
// CWL or Explore by appending /p/<tag without #>, and closes by dropping it.
export type Tab = 'cwl' | 'explore' | 'plan'
export type Route = { tab: Tab; kind: string | null; player: string | null; base: string }

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, tag] = h.split(/\/?p\//)
  const player = tag ? '#' + decodeURIComponent(tag) : null
  const parts = path.split('/').filter(Boolean)
  const base = '#/' + parts.join('/')
  if (parts[0] === 'plan') return { tab: 'plan', kind: null, player: null, base }
  if (parts[0] === 'explore') return { tab: 'explore', kind: parts[1] ?? null, player, base }
  return { tab: 'cwl', kind: null, player, base: '#/' }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
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
