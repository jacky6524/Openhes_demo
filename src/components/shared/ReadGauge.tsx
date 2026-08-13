import { status } from '@/tokens'
import type { Health } from '@/types'

/** donut gauge — center % + caption. 環色與連線率指標連動：
 *  良好(≥98%)=綠、注意(95~98%)=黃、告警(<95%)=紅。中央數字固定黑色。 */
export function ReadGauge({
  value,
  caption,
  health,
  decimals = 0,
}: {
  value: number
  caption: string
  health: Health
  decimals?: number
}) {
  const size = 132
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * c
  // 著色邏輯與連線率指標一致：良好=綠、注意=黃、告警=紅
  const ring =
    health === 'alert' ? status.danger.fg : health === 'warning' ? status.warning.fg : status.normal.fg

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0E7E8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-tight">
          {/* 數字固定黑色 */}
          <div className="text-[24px] font-bold tabular-nums text-ink">{pct.toFixed(decimals)}%</div>
          <div className="text-[11px] text-ink-sub">{caption}</div>
        </div>
      </div>
    </div>
  )
}
