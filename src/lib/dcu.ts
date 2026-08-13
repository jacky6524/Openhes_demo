import type { RegionNode } from '@/types'
import { round2 } from '@/lib/aggregate'

/**
 * DCU-level figures are derived deterministically from a region's meter metrics
 * (real DCU inventory not yet wired — mock, § allows). A DCU concentrates many
 * meters, so the DCU count is a fraction of meterTotal and its connect rate sits
 * close to (slightly below) the meter connect rate.
 */
function h(s: string) {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return (x >>> 0) / 4294967296
}

const METERS_PER_DCU = 2500

export interface DcuStats {
  total: number // DCU 總數
  connected: number // 已連線
  offline: number // 未連線
  rate: number // 連線率 %
}

export function dcuStats(node: RegionNode): DcuStats {
  const m = node.metrics
  const total = Math.max(1, Math.round(m.meterTotal / METERS_PER_DCU))
  const rate = Math.min(99.9, Math.max(0, round2(m.connectRate + (h(node.id + ':dcu') * 2 - 1.2))))
  const connected = Math.round((rate / 100) * total)
  return { total, connected, offline: total - connected, rate: round2((connected / total) * 100) }
}

/** deterministic DCU 連線率 trend delta (percentage points, signed) */
export function dcuTrendDelta(node: RegionNode): number {
  const r = h(node.id + ':dcutrend')
  const bias = node.health === 'good' ? 0.3 : -0.3
  return Math.round((r * 1.6 - 0.8 + bias) * 100) / 100
}
