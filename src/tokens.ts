/**
 * Design tokens — single canonical source for runtime/JS usage
 * (recharts series, map fills, inline styles).
 * tailwind.config.js mirrors these as utility classes; keep both in sync.
 *
 * Colour-usage law (see spec §2):
 *   RED  → alerts & out-of-bound values ONLY (map alert regions, offline gap,
 *          cross-compare anomaly quadrant).
 *   PURPLE (mag scale) → magnitude / trend.
 *   BLUE / TEAL → normal healthy state.
 *   BRAND rose → brand, primary action, selected state, links. NEVER for alerts.
 */

export const neutral = {
  bg: '#F5EDEE',
  surface: '#FFFFFF',
  inset: '#F0E7E8',
  border: '#E7DBDD',
  divider: '#EEE4E5',
} as const

export const text = {
  primary: '#2A2125',
  secondary: '#6B5E62',
  tertiary: '#A89BA0',
} as const

export const brand = {
  base: '#C23B52',
  deep: '#A22C40',
  soft: '#FAE6EB',
} as const

/** status colour triplets: { fg, bg, bd } */
export const status = {
  normal: { fg: '#12936A', bg: '#E0F4ED', bd: '#AEDFCE' },
  warning: { fg: '#E08A0B', bg: '#FCEFD6', bd: '#F2D69A' },
  danger: { fg: '#DB3B36', bg: '#FBE0DF', bd: '#F2B5B2' },
  critical: { fg: '#A82A30', bg: '#F6D6D6', bd: '#E5AEAE' },
  info: { fg: '#2F6BED', bg: '#E7F0FE', bd: '#BBD4F6' },
} as const

/**
 * Read-rate chart series (Figma 3031-12251) — LP indigo / MN cyan / ALT salmon.
 * These are CATEGORY colours for line/area series only; they never encode
 * health. Normal-state charts stay off-green per the colour law above.
 */
export const series = {
  lp: '#5E5CE6', // LP 讀表率
  midnight: '#64D2FF', // MN 午夜讀表率
  alt: '#FF9A9A', // ALT 讀表率
} as const

/**
 * Quiet chart neutrals — "empty container" bars & normal-state rings.
 * Normal data renders low-key; only threshold breaches use status colours.
 */
export const chartNeutral = {
  track: '#E5E7EB', // bar container / gauge track remainder
  fill: '#A1A1A1', // normal (≥95%) bar fill / gauge ring
} as const

/** magnitude / trend — single-hue purple ramp (light → dark) */
export const mag = [
  '#F1EFFC',
  '#D8D2F4',
  '#B7ADE9',
  '#8E80DC',
  '#6051BE',
  '#3F3490',
] as const

/**
 * Map health tri-colour (legend: 良好 / 注意 / 警告) — DEFINITIVE palette,
 * reused by every dashboard.
 * Since most regions are healthy, 良好 is a quiet grey-green that reads as
 * "nothing to see here" against the app background; 注意 / 警告 pop out.
 * `accent` is a saturated variant of the same hue for use where the fill would
 * be too faint to read (legend dots, status pills, gauge arcs).
 */
export type HealthKey = 'good' | 'warning' | 'alert'
export const health: Record<HealthKey, { fill: string; stroke: string; accent: string; label: string }> = {
  // 三態辨識度加大：良好=安靜灰綠、注意=醒目黃、警告=紅，彼此色相拉開
  good: { fill: '#DCE3DD', stroke: '#B9C6BB', accent: '#12936A', label: '良好' },
  warning: { fill: '#F5C518', stroke: '#C99A00', accent: '#A87A00', label: '注意' },
  alert: { fill: '#DB3B36', stroke: '#A82A30', accent: '#DB3B36', label: '警告' },
}

/**
 * 「無智慧電表 / 尚未部署」區域 — 不是健康狀態，而是「沒有資料」。
 * 用中性偏冷灰 + 斜線紋（hatch）呈現，與「良好」的灰綠 (#DCE3DD) 明確區隔，
 * 避免把未部署誤讀為讀表率良好。
 */
export const noMeter = { fill: '#ECE7E9', stroke: '#C9BEC1', label: '無智慧電表' } as const

/** region fill = health colour at ~80% opacity, border one step darker */
export const HEALTH_FILL_OPACITY = 0.8

export const shadow = {
  card: '0 1px 2px rgba(42,33,37,.05), 0 6px 18px rgba(42,33,37,.08)',
} as const
