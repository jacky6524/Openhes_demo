import { useDashboard } from '@/store/useDashboard'
import type { MetricKey } from '@/types'

const SEGMENTS: { key: MetricKey; label: string }[] = [
  { key: 'lp', label: 'LP' },
  { key: 'midnight', label: 'MN' },
  { key: 'alt', label: 'ALT' },
  { key: 'connect', label: '連線' },
]

/** segmented control — lets the shared card itself drive selectedKpi (§4.4). */
export function SegmentedControl() {
  const selected = useDashboard((s) => s.selectedKpi)
  const selectKpi = useDashboard((s) => s.selectKpi)
  return (
    <div className="inline-flex rounded-lg bg-inset p-0.5 border border-border">
      {SEGMENTS.map((s) => {
        const active = selected === s.key
        return (
          <button
            key={s.key}
            onClick={() => selectKpi(s.key)}
            className={[
              'px-3 py-1 text-[12px] font-medium rounded-md transition-colors',
              active ? 'bg-surface text-brand shadow-sm' : 'text-ink-sub hover:text-ink',
            ].join(' ')}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
