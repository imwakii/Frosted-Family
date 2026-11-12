import type { ReactNode } from 'react'
import { device, onIpad } from '../alerts'
import { CardSheet } from './ClanSheet'
import { installNow, canPrompt } from './InstallHint'

// How to add the app to the home screen, drawn step by step for the device in hand. Simple drawings of each browser's
// menus, not screenshots. Safari 26 reports an older version, so a phone can't tell which layout it has and the first step shows both.
// Apple's steps as of iOS 26: Share, More, Add to Home Screen, Add. On an iPhone, Share can sit under ••• beside the address bar.

const Share = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M8 7.5L12 3.5l4 4M7 11H5.5v9.5h13V11H17" />
  </svg>
)
const PlusBox = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></svg>
)

/** What to tap: a gold ring round it, the one thing in the drawing that stands out. */
const Tap = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`flex items-center justify-center rounded-lg bg-white text-ink shadow-[0_0_0_2.5px_var(--color-gold)] ${className}`}>{children}</span>
)
const Bar = ({ children, label }: { children: ReactNode; label?: string }) => (
  <span className="flex flex-col gap-1">
    {label && <span className="text-[11px] font-semibold text-muted">{label}</span>}
    <span className="flex h-11 items-center justify-between gap-2 rounded-xl bg-white px-2.5 text-faint">{children}</span>
  </span>
)
const Address = () => <span className="flex h-7 min-w-0 flex-auto items-center justify-center truncate rounded-full bg-[#F6EEDC] px-2 text-[11px] font-semibold text-muted">frostedfamily.com</span>
const Menu = ({ rows, pick, icon }: { rows: string[]; pick: string; icon?: ReactNode }) => (
  <span className="flex flex-col gap-1 rounded-xl bg-white p-1.5 text-[13px] text-faint">
    {rows.map((r) => (r === pick
      ? <Tap key={r} className="min-h-9 justify-between! px-2.5 font-bold">{r}{icon}</Tap>
      : <span key={r} className="flex min-h-8 items-center px-2.5">{r}</span>))}
  </span>
)
const Home = () => (
  <span className="grid grid-cols-4 justify-items-center gap-2 rounded-xl bg-white p-2.5">
    {[0, 1, 2].map((i) => <span key={i} className="mb-3.5 size-11 rounded-[11px] bg-[#EFE6D2]" />)}
    <span className="flex flex-col items-center gap-0.5">
      <Tap className="size-11 overflow-hidden rounded-[11px]!"><img src="/app-icon-192.png" alt="" width={44} height={44} /></Tap>
      <span className="text-[10px] font-bold text-ink">Frosted</span>
    </span>
  </span>
)
const AddSheet = ({ action }: { action: string }) => (
  <span className="flex flex-col gap-2 rounded-xl bg-white p-2.5">
    <span className="flex items-center justify-between text-[13px] text-faint">
      Cancel
      <Tap className="min-h-8 px-3 font-bold">{action}</Tap>
    </span>
    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
      <img src="/app-icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
      Frosted
    </span>
  </span>
)

const IPHONE = (ipad: boolean): { text: string; note?: string; art: ReactNode }[] => [
  ipad ? {
    text: 'Tap Share',
    note: 'At the top right of Safari. If it is not there, look under •••.',
    art: <Bar><Address /><Tap className="size-8"><Share /></Tap></Bar>,
  } : {
    text: 'Tap Share',
    note: 'Newer iPhones keep it under ••• beside the address bar.',
    art: (
      <span className="flex flex-col gap-2">
        <Bar label="Share in the bottom bar"><span>‹</span><span>›</span><Tap className="size-8"><Share /></Tap><span className="size-4 rounded-[4px] border-2 border-current" /></Bar>
        <Bar label="Or ••• first, then Share"><span>‹</span><Address /><Tap className="size-8 font-bold">•••</Tap></Bar>
      </span>
    ),
  },
  {
    text: 'Tap Add to Home Screen',
    note: 'Not in the list? Tap More or scroll down first.',
    art: <Menu rows={['Copy', 'Add to Bookmarks', 'Add to Home Screen', 'Find on Page']} pick="Add to Home Screen" icon={<PlusBox />} />,
  },
  {
    text: 'Tap Add',
    note: 'If you see Open as Web App, leave it on.',
    art: <AddSheet action="Add" />,
  },
  { text: 'Open Frosted from your home screen', art: <Home /> },
]

const ANDROID: { text: string; note?: string; art: ReactNode }[] = [
  {
    text: 'Tap the menu in Chrome',
    note: 'The three dots beside the address bar.',
    art: <Bar><Address /><Tap className="size-8 font-bold">⋮</Tap></Bar>,
  },
  {
    text: 'Tap Add to Home screen',
    note: 'Some phones call it Install app.',
    art: <Menu rows={['Downloads', 'Share', 'Add to Home screen', 'Settings']} pick="Add to Home screen" icon={<PlusBox />} />,
  },
  { text: 'Tap Install or Add', art: <AddSheet action="Install" /> },
  { text: 'Open Frosted from your home screen', art: <Home /> },
]

export default function InstallGuide({ wide, onClose }: { wide: boolean; onClose: () => void }) {
  const android = device() === 'android'
  const steps = android ? ANDROID : IPHONE(onIpad())
  return (
    <CardSheet label="Add to your home screen" wide={wide} onClose={onClose} head={<span className="font-display text-[22px] leading-tight text-brand">Add to your home screen</span>}>
      {canPrompt() ? (
        <button type="button" onClick={() => { installNow(); onClose() }} className="min-h-11 flex-none cursor-pointer rounded-full border-0 bg-action px-4 text-sm font-bold text-white hover:bg-action-deep">Install</button>
      ) : (
        <>
          <p className="m-0 rounded-xl bg-[#FEF3C7] px-3 py-2 text-[13px] font-semibold text-[#92400E]">
            Came here from Discord or another app? Open this page in {android ? 'Chrome' : 'Safari'} first.
          </p>
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {steps.map((s, i) => (
              <li key={s.text} className="flex flex-col gap-2">
                <span className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-bold text-ink">{s.text}</span>
                    {s.note && <span className="text-[13px] text-muted">{s.note}</span>}
                  </span>
                </span>
                <span aria-hidden="true" className="flex flex-col rounded-2xl bg-[#F6EEDC] p-2.5">{s.art}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </CardSheet>
  )
}
