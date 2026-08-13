import { TrendingDown, TrendingUp } from 'lucide-react'
import { status, text } from '@/tokens'
import { TrendTip } from './TrendTip'

/**
 * Trend indicator — colour rule per 2026-07 dashboard review:
 *   normal / improving change → BLACK (一般文字色), never green;
 *   deteriorating change      → RED (下降 / 異常才醒目).
 * `higherIsBetter` = true for rates (a drop is bad → red);
 * false for counts like 事件數量 (a rise is bad → red).
 *
 * Hover 顯示統一趨勢說明框（見 TrendTip）。
 */
export function TrendArrow({
  delta,
  higherIsBetter = true,
  align = 'right',
}: {
  delta: number // signed change, percentage points
  higherIsBetter?: boolean
  align?: 'left' | 'right' // 趨勢 popup 展開方向（傳給 TrendTip）
}) {
  const up = delta >= 0
  const isBad = higherIsBetter ? !up : up
  const color = isBad ? status.danger.fg : text.primary
  const Icon = up ? TrendingUp : TrendingDown // 曲線版趨勢圖示
  return (
    <span
      className="trend-trigger group/trend relative inline-flex items-center gap-1 text-[16px] font-medium leading-none cursor-default"
      style={{ color }}
    >
      <Icon size={16} strokeWidth={2} />
      {Math.abs(delta).toFixed(2)}
      <TrendTip up={up} isBad={isBad} value={Math.abs(delta).toFixed(2)} align={align} />
    </span>
  )
}
