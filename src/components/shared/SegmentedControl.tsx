import { useDashboard } from '@/store/useDashboard'
import { status } from '@/tokens'
import type { MetricKey } from '@/types'

const SEGMENTS: { key: MetricKey; label: string }[] = [
  { key: 'lp', label: 'LP' },
  { key: 'midnight', label: 'MN' },
  { key: 'alt', label: 'ALT' },
  { key: 'connect', label: '連線' },
]

/**
 * segmented control — 對齊前端 `.segmented`：
 *   容器 pill、bg #f0edef、inset shadow；按鈕 min-width 50、14px/700、#62585c
 *   選取態白底 + 陰影 + --status-error-emphasis 文字
 */
export function SegmentedControl() {
  const selected = useDashboard((s) => s.selectedKpi)
  const selectKpi = useDashboard((s) => s.selectKpi)
  return (
    <div
      className="inline-flex shrink-0 rounded-full p-1"
      style={{ background: '#F0EDEF', boxShadow: 'inset 0 1px 4px rgba(58,42,48,.08)' }}
    >
      {SEGMENTS.map((s) => {
        const active = selected === s.key
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={active}
            onClick={() => selectKpi(s.key)}
            className="min-w-[50px] rounded-full px-3 py-2 text-[14px] font-bold leading-[1.2] transition-colors"
            style={
              active
                ? { background: '#FFF', boxShadow: '0 2px 8px rgba(58,42,48,.12)', color: status.danger.fg }
                : { color: '#62585C' }
            }
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
