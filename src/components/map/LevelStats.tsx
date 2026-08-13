import { useMemo } from 'react'
import { useCurrentNode } from '@/store/useDashboard'
import { metricHealth } from '@/lib/health'
import { health, noMeter } from '@/tokens'
import type { RegionNode } from '@/types'

/**
 * 當前層級統計面板 (地圖左上角) — 對「目前地圖所顯示的這一層區域」統計各狀態
 * 數量：良好 / 注意 / 警告 / 無智慧電表。
 * 分類與地圖著色一致：meterTotal===0 → 無智慧電表；否則依 LP 讀表率健康帶。
 * 層級：L1 全台→縣市；L2 縣市→行政區；L3 為葉節點，統計自身單一區域。
 */
type Cat = 'good' | 'warning' | 'alert' | 'noMeter'

function categorize(r: RegionNode): Cat {
  if (r.metrics.meterTotal === 0) return 'noMeter'
  return metricHealth(r.metrics, 'lp')
}

const ITEMS: { key: Cat; label: string; fill: string; stroke: string; hatch?: boolean }[] = [
  { key: 'good', label: '良好', fill: health.good.fill, stroke: health.good.stroke },
  { key: 'warning', label: '注意', fill: health.warning.fill, stroke: health.warning.stroke },
  { key: 'alert', label: '警告', fill: health.alert.fill, stroke: health.alert.stroke },
  { key: 'noMeter', label: '無智慧電表', fill: noMeter.fill, stroke: noMeter.stroke, hatch: true },
]

export function LevelStats() {
  const node = useCurrentNode()

  const { counts, total, unitLabel } = useMemo(() => {
    const regions = node.children && node.children.length ? node.children : [node]
    const c: Record<Cat, number> = { good: 0, warning: 0, alert: 0, noMeter: 0 }
    regions.forEach((r) => (c[categorize(r)] += 1))
    // 統計單位：全台→台灣（縣市）；縣市→行政區；行政區→區
    const unit = node.id === 'TW' ? '台灣（縣市）' : node.level === 'L2' ? '行政區' : '區'
    return { counts: c, total: regions.length, unitLabel: unit }
  }, [node])

  return (
    <div className="rounded-lg bg-surface/95 backdrop-blur border border-border shadow-card px-2.5 py-2 w-[152px]">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-ink">{unitLabel}</span>
        <span className="text-[11px] text-ink-mut tabular-nums">共 {total}</span>
      </div>
      <div className="flex flex-col gap-1">
        {ITEMS.map((it) => (
          <div key={it.key} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[3px] border shrink-0"
              style={{
                background: it.fill,
                borderColor: it.stroke,
                backgroundImage: it.hatch
                  ? `repeating-linear-gradient(45deg, ${it.stroke} 0 1.5px, transparent 1.5px 5px)`
                  : undefined,
              }}
            />
            <span className="text-[12px] text-ink-sub flex-1">{it.label}</span>
            <span className="text-[13px] font-bold text-ink tabular-nums">{counts[it.key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
