import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Small movements, only when something has changed for this person since they last saw it. Each remembers what it has
// shown in this browser, and none plays for someone whose phone is set to reduce motion.

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** True once, the first time this key comes up on this device. */
export function useOnce(key: string | null) {
  const [fire, setFire] = useState(false)
  useEffect(() => {
    if (!key || read(key)) return
    write(key, '1')
    setFire(true)
  }, [key])
  return fire
}

/** The number on screen: runs up over a moment when it differs from the one last seen, and sits still otherwise. */
export function useCountUp(value: number | null, key: string | null) {
  const [shown, setShown] = useState(value)
  // Before the screen draws, so the final number never flashes up first.
  useLayoutEffect(() => {
    setShown(value)
    if (value === null || !key) return
    const was = read(key)
    write(key, String(value))
    if (was === null || Number(was) === value || still()) return
    const from = Number(was), started = performance.now()
    setShown(from)
    let frame = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - started) / 300)
      setShown(from + (value - from) * k)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, key])
  return shown
}

/** Which of these ids are new since last time. The first look only remembers them, so nothing shines for no reason. */
export function useNewIds(ids: string[] | null, key: string | null) {
  const [fresh, setFresh] = useState<string[]>([])
  const list = ids?.join()
  useEffect(() => {
    if (!key || list === undefined) return
    const was = read(key)
    write(key, list)
    if (was !== null && !still()) setFresh(list.split(',').filter((id) => id && !was.split(',').includes(id)))
  }, [key, list])
  return fresh
}

const SPARKS = 12

/** A short burst of stars from the middle of the screen, for a big moment. Rare on purpose. */
export function StarBurst({ show }: { show: boolean }) {
  const [on, setOn] = useState(false)
  const done = useRef(0)
  useEffect(() => {
    if (!show || still()) return
    setOn(true)
    done.current = window.setTimeout(() => setOn(false), 900)
    return () => window.clearTimeout(done.current)
  }, [show])
  if (!on) return null
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed left-1/2 top-1/2 z-[70]">
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * 2 * Math.PI, reach = 90 + (i % 3) * 35
        return <span key={i} className="ff-spark absolute text-[22px] text-gold" style={{ '--x': `${Math.cos(angle) * reach}px`, '--y': `${Math.sin(angle) * reach}px` } as React.CSSProperties}>★</span>
      })}
    </div>,
    document.body,
  )
}
