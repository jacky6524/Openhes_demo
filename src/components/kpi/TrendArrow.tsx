import { status } from '@/tokens'
import { TrendTip } from './TrendTip'

/**
 * 趨勢箭頭 —— 圖形與前端 `DashboardTrendArrow.vue` 完全相同
 * （20×20 viewBox、stroke-width 1.7、round cap/join，預設 18px）。
 */
export function TrendGlyph({ direction, size = 18 }: { direction: 'up' | 'down'; size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ width: size, height: size, flex: `0 0 ${size}px`, overflow: 'visible' }}
    >
      <path
        d={
          direction === 'up'
            ? 'M2.5 13.5L7 9l3.5 3.5L17.5 5.5M13 5.5h4.5V10'
            : 'M2.5 6.5L7 11l3.5-3.5 7 7M13 14.5h4.5V10'
        }
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Trend indicator — 對齊前端 `.metric-delta`：16px / 700 / 一般為 #2d2b2d，
 * 惡化 (is-unfavorable) 才轉 --status-error-emphasis (#fb2c36)。
 * `higherIsBetter` = true for rates (a drop is bad → red);
 * false for counts like 事件數量 (a rise is bad → red).
 *
 * Hover 顯示統一趨勢說明框（見 TrendTip）。
 */
export function TrendArrow({
  delta,
  higherIsBetter = true,
  align = 'right',
  size = 18,
}: {
  delta: number // signed change, percentage points
  higherIsBetter?: boolean
  align?: 'left' | 'right' // 趨勢 popup 展開方向（傳給 TrendTip）
  size?: number
}) {
  const up = delta >= 0
  const isBad = higherIsBetter ? !up : up
  const color = isBad ? status.danger.fg : '#2D2B2D'
  return (
    <span
      className="trend-trigger group/trend relative inline-flex cursor-default items-center gap-0.5 whitespace-nowrap text-[16px] font-bold leading-none tabular-nums"
      style={{ color }}
    >
      <TrendGlyph direction={up ? 'up' : 'down'} size={size} />
      {Math.abs(delta).toFixed(1)}
      <TrendTip up={up} isBad={isBad} value={Math.abs(delta).toFixed(1)} align={align} />
    </span>
  )
}
