import { useEffect, useState } from 'react'

// Hash routes: #/ (CWL), #/plan, #/p/<tag without #> (player sheet over CWL).
export type Route = { tab: 'cwl' | 'plan'; player: string | null }

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'plan') return { tab: 'plan', player: null }
  if (h.startsWith('p/')) return { tab: 'cwl', player: '#' + decodeURIComponent(h.slice(2)) }
  return { tab: 'cwl', player: null }
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

export const go = {
  cwl: () => { window.location.hash = '#/' },
  plan: () => { window.location.hash = '#/plan' },
  player: (tag: string) => { window.location.hash = '#/p/' + encodeURIComponent(tag.replace(/^#/, '')) },
}
