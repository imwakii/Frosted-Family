import { useEffect, useState } from 'react'
import { HttpError } from './data'

// GET and POST /api/visits. A random id this browser keeps, reported once a UTC day with its time zone and tied to nothing.
// Local development only reads, so testing never adds to the count. An older server has no such route, and the line stays hidden.
// A browser that says it is automated doesn't report either; the server sets apart the ones that don't say (server/visits.py).
export type Visits = { week: number; total: number }
export type VisitsDaily = Visits & { days: { day: string; total: number; regions: Record<string, number> }[]; regions: { name: string; total: number }[]; bots?: number }

export async function getVisitsDaily(): Promise<VisitsDaily> {
  const r = await fetch('/api/visits/daily', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new HttpError('/api/visits/daily', r.status)
  return r.json()
}

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

const automated = () => navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse/i.test(navigator.userAgent)

function visitorId() {
  let id = read('ff-visitor')
  if (!id) {
    id = crypto.randomUUID()
    write('ff-visitor', id)
  }
  return id
}

export function useVisits() {
  const [visits, setVisits] = useState<Visits | null>(null)
  useEffect(() => {
    let live = true
    const today = new Date().toISOString().slice(0, 10)
    const report = !import.meta.env.DEV && !automated() && read('ff-visit-day') !== today
    const answer = report
      ? fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: visitorId(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
      : fetch('/api/visits', { headers: { Accept: 'application/json' } })
    answer.then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then((d: Visits | null) => {
        if (!live || !d) return
        if (report) write('ff-visit-day', today)
        setVisits(d)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return visits
}
