import { health, status, text } from '@/tokens'
import type { Health } from '@/types'

/** KPI 大字顏色：良好＝黑、注意＝黃（告警色票的注意色）、警告＝紅（2026-11-17 同步正式機截圖） */
export const VALUE_COLOR: Record<Health, string> = {
  good: text.primary,
  warning: health.warning.accent,
  alert: status.danger.fg,
}
