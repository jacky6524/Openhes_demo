import type { Health, MetricKey } from '@/types'

/**
 * Health thresholds — PLACEHOLDER values (§5). Confirm with ops team.
 * Authored as editable constants so they are trivial to tune.
 *
 * Rule: value >= good  → 良好(good)
 *       value >= warn  → 注意(warning)
 *       else           → 警告(alert)
 */
export interface Threshold {
  good: number // >= → good
  warn: number // >= → warning, else alert
}

export const THRESHOLDS: Record<MetricKey, Threshold> = {
  connect: { good: 98, warn: 95 }, // 連線率
  // 讀表率: ≥97% 良好 / 95–97% 注意 / <95% 告警 (map is coloured by LP; the
  // <95% 告警 cut matches the KPI-card red rule, see RATE_ALERT_BELOW).
  lp: { good: 97, warn: 95 }, // LP 讀表率
  midnight: { good: 97, warn: 95 }, // 午夜讀表率
  alt: { good: 97, warn: 95 }, // ALT 讀表率
}

/**
 * KPI value colour rule (§ review feedback): connect / read rates render in
 * black (ink) by default and only turn red as a warning when they drop BELOW
 * this cutoff. This is deliberately independent of the map health thresholds
 * above — the 注意 band (95–98% connect) stays black, not red.
 */
export const RATE_ALERT_BELOW = 95

/** does a rate value warrant the red warning colour? (< 95%) */
export function isRateAlert(value: number): boolean {
  return value < RATE_ALERT_BELOW
}

/** classify a single metric value against its threshold */
export function classify(value: number, t: Threshold): Health {
  if (value >= t.good) return 'good'
  if (value >= t.warn) return 'warning'
  return 'alert'
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  connect: '連線率',
  lp: 'LP 讀表率',
  midnight: 'MN 午夜讀表率', // 「午夜」統一標示英文縮寫 MN
  alt: 'ALT 讀表率',
}

/** which raw metric field on RegionMetrics each KPI reads */
export const METRIC_FIELD: Record<MetricKey, 'connectRate' | 'lpRate' | 'midnightRate' | 'altRate'> = {
  connect: 'connectRate',
  lp: 'lpRate',
  midnight: 'midnightRate',
  alt: 'altRate',
}
