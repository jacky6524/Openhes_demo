import { useMemo } from 'react'
import { useCurrentNode } from '@/store/useDashboard'
import { metricHealth } from '@/lib/health'
import { health, noMeter } from '@/tokens'
import { Swatch } from './Legend'
import type { RegionNode } from '@/types'

/**
 * 當前層級統計面板（地圖左上角）— 對齊前端 `.map-stat-card`：
 *   width 158 / padding 12 / radius 8 / bg rgba(255,255,255,.95) / border #eadfe1
 *   標題 13px + 「共 N」12px #9f9397；列 dt 12px #6f6267、dd font-weight 800
 *
 * 對「目前地圖所顯示的這一層區域」統計各狀態數量：良好 / 注意 / 警告 / 無電表。
 * 分類與地圖著色一致：meterTotal===0 → 無電表；否則依 LP 讀表率健康帶。
 * 層級：L1 全台→縣市；L2 縣市→行政區；L3 為葉節點，統計自身單一區域。
 */
type Cat = 'good' | 'warning' | 'alert' | 'muted'

function categorize(r: RegionNode): Cat {
  if (r.metrics.meterTotal === 0) return 'muted'
  return metricHealth(r.metrics, 'lp')
}

const ITEMS: { key: Cat; label: string }[] = [
  { key: 'good', label: health.good.label },
  { key: 'warning', label: health.warning.label },
  { key: 'alert', label: health.alert.label },
  { key: 'muted', label: noMeter.label },
]

export function LevelStats() {
  const node = useCurrentNode()

  const { counts, total, unitLabel } = useMemo(() => {
    const regions = node.children && node.children.length ? node.children : [node]
    const c: Record<Cat, number> = { good: 0, warning: 0, alert: 0, muted: 0 }
    regions.forEach((r) => (c[categorize(r)] += 1))
    // 統計單位：全台→台灣（縣市）；縣市→行政區；行政區→區
    const unit = node.id === 'TW' ? '台灣（縣市）' : node.level === 'L2' ? '行政區' : '區'
    return { counts: c, total: regions.length, unitLabel: unit }
  }, [node])

  return (
    <aside
      className="box-border w-[158px] rounded-lg border p-3"
      style={{
        borderColor: '#EADFE1',
        background: 'rgba(255,255,255,.95)',
        boxShadow: '0 8px 20px rgba(58,42,48,.12)',
      }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <strong className="text-[13px] text-ink">{unitLabel}</strong>
        <span className="text-[12px] tabular-nums" style={{ color: '#9F9397' }}>
          共 {total}
        </span>
      </div>
      <dl className="m-0 grid gap-2">
        {ITEMS.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: '#6F6267' }}>
              <Swatch kind={it.key} />
              {it.label}
            </dt>
            <dd className="m-0 font-extrabold tabular-nums text-ink">{counts[it.key]}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
