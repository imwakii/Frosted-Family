import type { ClanWar, WarRecap as Recap } from '../leaders'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { RowChevron } from './ui'

// When a war ends: who was best, any big upset, and an image of it to post in Discord. The score is on the board above.

const starText = (stars: number[]) => stars.map((n) => '★'.repeat(n) + '☆'.repeat(3 - n)).join(' ')
const why = (r: Recap) => (r.mvp.tied > 1 ? `Fastest of ${r.mvp.tied} with this score` : `${Math.round(r.mvp.destruction)}% average`)
const upsetText = (u: Recap['upsets'][number]) => `TH${u.attacker.th} on TH${u.defender.th} ${u.defender.name}`

function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  let s = text
  while (s && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1)
  return `${s}…`
}

async function saveImage(clan: ClanName, war: ClanWar, result: string, r: Recap) {
  const t = CLAN[clan]
  const W = 1080, PAD = 64, ROW = 150, HEAD = 340
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = HEAD + ROW * (1 + r.upsets.length) + PAD
  const ctx = canvas.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily
  const text = (s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left', width = W - 2 * PAD, family = font) => {
    ctx.font = `${weight} ${size}px ${family}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(fit(ctx, s, width), x, y)
  }
  ctx.fillStyle = '#FFFBF1'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = t.tint
  ctx.fillRect(0, 0, W, HEAD)
  text(result, W / 2, 90, 40, 700, t.label, 'center')
  text(`${war.stars} – ${war.opponent_stars}`, W / 2, 200, 104, 400, t.deep, 'center', W, '"Lilita One", sans-serif')
  text(`Frosted ${clan} v ${war.opponent}`, W / 2, 272, 36, 600, '#5E5240', 'center')
  const row = (i: number, label: string, name: string, stars: string, note: string) => {
    const y = HEAD + i * ROW
    if (i) { ctx.fillStyle = '#E3D8BF'; ctx.fillRect(PAD, y, W - 2 * PAD, 2) }
    text(label, PAD, y + 56, 28, 600, '#7A6C55', 'left', 400)
    text(name, PAD, y + 108, 42, 700, '#2B2114', 'left', 520)
    text(stars, W - PAD, y + 56, 34, 700, '#D97706', 'right', 400)
    text(note, W - PAD, y + 108, 30, 600, '#7A6C55', 'right', 400)
  }
  row(0, 'MVP', r.mvp.name, starText(r.mvp.stars), why(r))
  r.upsets.forEach((u, i) => row(i + 1, 'Upset', u.attacker.name, '★★★', upsetText(u)))
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
  if (!blob) return
  const name = `frosted-${clan.toLowerCase()}-war-recap.png`
  const file = new File([blob], name, { type: 'image/png' })
  // Phones share straight into Discord; everything else downloads.
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {})
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function WarRecap({ clan, war, result, recap }: { clan: ClanName; war: ClanWar; result: string; recap: Recap }) {
  const row = 'flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline'
  const stars = (s: string) => <span aria-hidden="true" className="whitespace-nowrap text-[13px] leading-none text-gold">{s}</span>
  return (
    <div aria-label="War recap">
      <a href={playerHref(recap.mvp.tag)} className={`${row} hover:bg-hover`}>
        <span className="flex min-w-0 flex-auto flex-col">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">MVP</span>
          <span className="truncate text-[15px] font-bold">{recap.mvp.name}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          {stars(starText(recap.mvp.stars))}
          <span className="text-xs font-semibold text-muted">{why(recap)}</span>
        </span>
        <RowChevron />
      </a>
      {recap.upsets.map((u) => (
        <div key={`${u.attacker.tag}-${u.defender.tag}`} className="border-t border-hair">
        <a href={playerHref(u.attacker.tag)} className={`${row} hover:bg-hover`}>
          <span className="flex min-w-0 flex-auto flex-col">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Upset</span>
            <span className="truncate text-[15px] font-bold">{u.attacker.name}</span>
          </span>
          <span className="flex min-w-0 flex-col items-end gap-1">
            {stars('★★★')}
            <span className="max-w-full truncate text-xs font-semibold text-muted">{upsetText(u)}</span>
          </span>
          <RowChevron />
        </a>
        </div>
      ))}
      <div className="flex justify-end border-y border-hair px-3 py-2">
        <button type="button" onClick={() => { void saveImage(clan, war, result, recap) }} className="min-h-9 cursor-pointer rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink-2 hover:bg-page">Save image</button>
      </div>
    </div>
  )
}
