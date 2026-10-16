import type { ReactNode } from 'react'
import { chartNeutral } from '@/tokens'

/**
 * 環圈進度計 —— 系統總覽「讀表成功數區塊」用（規格書 §1 參考畫面）。
 * 純 SVG，無動畫相依。內容由 children 決定，環圈只負責畫弧。
 *
 * 弧從 12 點鐘方向順時針起算；未達成的部分留在中性 track 色，
 * 符合整包「空容器裝填比率」的表現法。
 */
export function RingGauge({
  size,
  stroke,
  rate,
  color,
  children,
}: {
  size: number
  stroke: number
  /** 0–100 */
  rate: number
  color: string
  children: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, rate))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={chartNeutral.track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {children}
      </div>
    </div>
  )
}
