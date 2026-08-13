import type { MetricKey, RegionNode } from '@/types'

/* deterministic mock trend delta (percentage points) per region+metric.
   Sign is meaningful: negative = the rate dropped. */
function h(s: string) {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return (x >>> 0) / 4294967296
}

export function trendDelta(node: RegionNode, key: MetricKey): number {
  const r = h(node.id + ':' + key)
  // unhealthy regions skew toward declines so red arrows cluster on problems
  const bias = node.health === 'good' ? 0.35 : -0.35
  return Math.round((r * 1.8 - 0.9 + bias) * 100) / 100
}

/**
 * 事件/停電數量成長趨勢 (絕對件數, signed).
 * TODO: 比較基準尚未由 API 提供 — 此為前端 deterministic mock，
 *       正式版需改讀 API 的「與前一小時相比」欄位（趨勢一律比對前一小時）。
 */
export function countTrendDelta(node: RegionNode, kind: 'event' | 'outage', base: number): number {
  const r = h(node.id + ':' + kind)
  // unhealthy regions skew toward rising counts (rise = bad for counts)
  const bias = node.health === 'good' ? -0.2 : 0.3
  return Math.round(base * 0.02 * (r * 2 - 1 + bias))
}
