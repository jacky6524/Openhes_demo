import { health as healthTok } from '@/tokens'
import type { Health } from '@/types'

/**
 * 環形指標 — 對齊前端 `.trend-ring`：
 *   background: conic-gradient(<健康色> <rate*3.6>deg, #eee9e7 0deg)
 *   內圈 80% 白色實心，上下兩行（數值 24px / 說明 12px #40373b）
 *
 * 環色與地圖健康色同一組（tokens.health）：
 *   良好(≥98%)=中性灰 #E5E7EB、注意(95~98%)=#FFD230、告警(<95%)=#FB2C36。
 * 中央數字固定黑色。
 */
export function ReadGauge({
  value,
  caption,
  health,
  decimals = 0,
  size = 188,
}: {
  value: number
  caption: string
  health: Health
  decimals?: number
  /** 前端桌機為 min(188px,100%)，矮螢幕壓到 150px */
  size?: number
}) {
  const pct = Math.max(0, Math.min(100, value))
  const ring = healthTok[health].accent

  return (
    <div
      className="grid aspect-square max-h-full place-items-center self-center justify-self-center rounded-full"
      style={{
        width: `min(${size}px, 100%)`,
        background: `conic-gradient(${ring} ${pct * 3.6}deg, #EEE9E7 0deg)`,
      }}
    >
      <span className="grid h-4/5 w-4/5 content-center justify-items-center gap-1.5 rounded-full bg-surface text-center">
        <strong className="text-[24px] font-extrabold leading-none tabular-nums text-ink">
          {pct.toFixed(decimals)}%
        </strong>
        <small className="px-1 text-[12px] leading-[1.2] text-[#40373B]">{caption}</small>
      </span>
    </div>
  )
}
