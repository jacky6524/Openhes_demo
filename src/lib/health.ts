import type { Health, MetricKey, RegionMetrics } from '@/types'
import { THRESHOLDS, classify, METRIC_FIELD } from '@/config/thresholds'

/** health of a region for ONE metric (used by map colouring per selected KPI) */
export function metricHealth(metrics: RegionMetrics, key: MetricKey): Health {
  const value = metrics[METRIC_FIELD[key]]
  return classify(value, THRESHOLDS[key])
}

/** overall region health = worst across all gating metrics (computed live) */
export function overallHealth(metrics: RegionMetrics): Health {
  const order: Health[] = ['good', 'warning', 'alert']
  const keys: MetricKey[] = ['connect', 'lp', 'midnight', 'alt']
  let worst: Health = 'good'
  for (const k of keys) {
    const h = metricHealth(metrics, k)
    if (order.indexOf(h) > order.indexOf(worst)) worst = h
  }
  return worst
}

/** is a KPI value out-of-bound (→ render red)? true when not 'good' */
export function isOutOfBound(metrics: RegionMetrics, key: MetricKey): boolean {
  return metricHealth(metrics, key) !== 'good'
}
