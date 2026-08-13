import type { RegionMetrics } from '@/types'

/**
 * Roll-up: a parent's metrics = sum/weighted-avg of its children.
 * Counts (meterTotal, connected, eventCount, dhcDisconnect) sum directly.
 * Rates are recomputed from aggregated counts so parent figures always
 * reconcile with the drilled-down children (§6 "下鑽數字要對得起來").
 *
 * For read rates (lp/midnight/alt) we carry implied read-counts derived from
 * each leaf's rate × meterTotal, then divide by total — keeping the weighted
 * average correct without storing extra fields.
 */
export function rollup(children: RegionMetrics[]): RegionMetrics {
  const acc: RegionMetrics = {
    meterTotal: 0,
    connected: 0,
    connectRate: 0,
    lpRate: 0,
    midnightRate: 0,
    altRate: 0,
    eventCount: 0,
    dhcDisconnect: 0,
  }

  let lpReads = 0
  let midReads = 0
  let altReads = 0

  for (const c of children) {
    acc.meterTotal += c.meterTotal
    acc.connected += c.connected
    acc.eventCount += c.eventCount
    acc.dhcDisconnect += c.dhcDisconnect
    lpReads += (c.lpRate / 100) * c.meterTotal
    midReads += (c.midnightRate / 100) * c.meterTotal
    altReads += (c.altRate / 100) * c.meterTotal
  }

  const t = acc.meterTotal || 1
  acc.connectRate = round2((acc.connected / t) * 100)
  acc.lpRate = round2((lpReads / t) * 100)
  acc.midnightRate = round2((midReads / t) * 100)
  acc.altRate = round2((altReads / t) * 100)
  return acc
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** offline gap = total − connected (待處理) */
export function offlineGap(m: RegionMetrics): number {
  return m.meterTotal - m.connected
}
