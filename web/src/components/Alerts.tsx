import { useEffect, useState } from 'react'
import { type AlertPrefs, alertState, type AlertState, device, readPrefs, setPrefs, turnOff, turnOn } from '../alerts'
import { Eyebrow } from './ui'
import { Chevron } from './WhatsNew'
import { useYou } from './You'

// In Settings: one switch per alert. The first switched on asks the phone's permission; the last switched off signs the phone out.
// The walkthrough follows this phone and where it has got to: open when something is in the way, a quiet row otherwise.

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
  return ['Switch on the alerts you want', dev === 'other' ? 'Choose Allow when your browser asks' : 'Tap Allow when your phone asks']
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
  useEffect(() => { alertState().then(setState, () => setState('hidden')) }, [])

  if (!state) return null
  const guide = steps(state)
  if (state !== 'on' && state !== 'off') {
    if (!guide) return null
    return (
      <section aria-label="Alerts" className="flex flex-col gap-1.5">
        <Eyebrow>Alerts</Eyebrow>
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3">
          <span className="text-[15px] font-bold text-ink">{state === 'blocked' ? 'Alerts are blocked' : 'Get alerts on this phone'}</span>
          <Steps list={guide} />
        </div>
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
            <button type="button" role="switch" aria-checked={shown[c.key]} aria-label={c.label} disabled={busy} onClick={() => flip(c.key)}
              className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2 text-left disabled:cursor-default">
              <span className="flex min-w-0 flex-auto flex-col">
                <span className="text-[15px] font-bold text-ink">{c.label}</span>
                <span className="truncate text-[13px] leading-[1.3] text-muted">{c.line}</span>
              </span>
              <span aria-hidden="true" className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors ${shown[c.key] ? 'bg-ink' : 'bg-[#E3D8BF]'}`}>
                <span className={`absolute left-0.5 top-0.5 size-[27px] rounded-full bg-white shadow-[0_2px_5px_rgba(43,33,20,.25)] transition-transform ${shown[c.key] ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {failed && <span className="text-xs font-semibold text-[#92400E]">Not saved. Try again.</span>}
      {guide && (
        <details className="group/how">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-normal text-ink-2 [&::-webkit-details-marker]:hidden">
            How to turn on alerts
            <Chevron className="group-open/how:rotate-90" />
          </summary>
          <div className="pb-2 pt-1"><Steps list={guide} /></div>
        </details>
      )}
    </section>
  )
}
