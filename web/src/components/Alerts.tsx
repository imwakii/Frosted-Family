import { useEffect, useState } from 'react'
import { type AlertPrefs, alertState, type AlertState, device, readPrefs, setPrefs, turnOff, turnOn } from '../alerts'
import { Eyebrow, SwitchRow } from './ui'
import { useYou } from './You'

// In Settings: one switch per alert. The first switched on asks the phone's permission; the last switched off signs the phone out.
// The switches stay whatever the phone answers. If alerts are blocked, the steps for this phone sit under them; if this phone
// cannot get alerts yet, the steps take their place. Coming back from the phone's settings checks again.

const CHOICES: { key: keyof AlertPrefs; label: string; line: string }[] = [
  { key: 'attacks', label: 'Attack left', line: '2 hours to go, attack unused' },
  { key: 'days', label: 'CWL days', line: "You're in the next CWL day" },
  { key: 'war', label: 'War started', line: "Your clan's war has begun" },
]
const NONE: AlertPrefs = { attacks: false, days: false, war: false }

function steps(state: AlertState): string[] | null {
  const dev = device()
  if (state === 'install') {
    return ['Open this page in Safari', 'Tap Share, then Add to Home Screen', 'Open Frosted from your home screen', 'Come back to Settings and switch on an alert']
  }
  if (state === 'blocked') {
    if (dev === 'iphone') return ["Open your iPhone's Settings", 'Tap Notifications, then Frosted', 'Turn on Allow Notifications', 'Come back to Settings']
    if (dev === 'android') return ['Tap the icon left of the web address', 'Tap Permissions, then Notifications', 'Choose Allow', 'Reload this page']
    return ['Click the icon left of the web address', 'Allow notifications', 'Reload this page']
  }
  if (state === 'hidden') {
    if (dev === 'iphone') return ['Update your iPhone to iOS 16.4 or later', 'Open Frosted from your home screen', 'Come back to Settings and switch on an alert']
    if (dev === 'android') return ['Open this page in Chrome', 'Come back to Settings and switch on an alert']
    return null
  }
  return null
}

const Steps = ({ list }: { list: string[] }) => (
  <ol className="m-0 flex list-none flex-col gap-2 p-0">
    {list.map((s, i) => (
      <li key={s} className="flex items-center gap-2.5 text-sm text-ink-2">
        <span aria-hidden="true" className="flex size-5 flex-none items-center justify-center rounded-full bg-[#EFE6D2] text-[11px] font-bold text-ink-2">{i + 1}</span>
        {s}
      </li>
    ))}
  </ol>
)

export default function Alerts() {
  const { yous } = useYou()
  const [state, setState] = useState<AlertState | null>(null)
  const [prefs, setLocal] = useState(readPrefs)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const check = () => { alertState().then(setState, () => setState('hidden')) }
    check()
    // A permission sheet left unanswered can leave its question open for good, so coming back also frees the switches.
    const back = () => { if (document.visibilityState === 'visible') { setBusy(false); check() } }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])

  if (!state) return null
  const guide = steps(state)
  if (state === 'install' || state === 'hidden') {
    if (!guide) return null
    return (
      <section aria-label="Alerts" className="flex flex-col gap-1.5">
        <Eyebrow>Alerts</Eyebrow>
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3">
          <span className="text-[15px] font-bold text-ink">Get alerts on this phone</span>
          <Steps list={guide} />
        </div>
      </section>
    )
  }

  if (!yous.length) {
    return (
      <section aria-label="Alerts" className="flex flex-col gap-1.5">
        <Eyebrow>Alerts</Eyebrow>
        <ul className="m-0 flex list-none flex-col rounded-xl border border-line bg-white p-0 opacity-60">
          {CHOICES.map((c) => <li key={c.key} className="border-b border-hair last:border-b-0"><SwitchRow label={c.label} line={c.line} on={false} disabled onFlip={() => undefined} /></li>)}
        </ul>
        <span className="text-xs font-semibold text-muted">Add yourself above to get alerts</span>
      </section>
    )
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setFailed(false)
    try { await fn() } catch { setFailed(true) } finally { setBusy(false) }
  }
  const on = state === 'on'
  const shown = on ? prefs : NONE
  const flip = (key: keyof AlertPrefs) => {
    const was = prefs
    const next = { ...shown, [key]: !shown[key] }
    setLocal(next)
    act(async () => {
      try {
        if (!on) {
          await setPrefs(next, yous)  // no phone signed up yet, so this only keeps the choice for turnOn
          setState(await turnOn(yous))
        } else if (Object.values(next).some(Boolean)) {
          await setPrefs(next, yous)
        } else {
          await turnOff()
          setState('off')
        }
      } catch (e) {
        setLocal(was)
        throw e
      }
    })
  }
  return (
    <section aria-label="Alerts" className="flex flex-col gap-1.5">
      <Eyebrow>Alerts</Eyebrow>
      <ul className="m-0 flex list-none flex-col rounded-xl border border-line bg-white p-0">
        {CHOICES.map((c) => (
          <li key={c.key} className="border-b border-hair last:border-b-0">
            <SwitchRow label={c.label} line={c.line} on={shown[c.key]} disabled={busy} onFlip={() => flip(c.key)} />
          </li>
        ))}
      </ul>
      {failed && <span className="text-xs font-semibold text-[#92400E]">Not saved. Try again.</span>}
      {yous.length > 1 && <span className="text-xs text-muted">Covers all your accounts</span>}
      {state === 'blocked' && guide && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3">
          <span className="text-[15px] font-bold text-ink">Alerts are blocked</span>
          <Steps list={guide} />
        </div>
      )}
    </section>
  )
}
