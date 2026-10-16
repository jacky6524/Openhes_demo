/**
 * Design tokens — single canonical source for runtime/JS usage
 * (recharts series, map fills, inline styles).
 * tailwind.config.js mirrors these as utility classes; keep both in sync.
 *
 * ⚠ 這份 token 已與前端正式包 `openhes-front/shared/assets/color.css` 對齊
 *   （業主要求 prototype 外觀需與前端一致）。修改前請先確認前端對應的
 *   semantic token，兩邊同步改，不要只改單邊。
 *   對照關係寫在每個常數上方。
 *
 * Colour-usage law:
 *   RED (status.danger) → alerts & out-of-bound values（地圖警告區、未連線缺口、
 *        比對圖異常象限）。前端品牌色同為紅系，兩者刻意共用同一色相家族。
 *   BRAND #c10007 → 品牌、主要動作、選取狀態、連結。
 *   PURPLE (mag scale) → magnitude / trend。
 *   BLUE / TEAL → normal healthy state。
 */

/** ← color.css: --surface-* / --border-* */
export const neutral = {
  bg: '#F9FAFB', // --surface-background (palette-gray-50)
  page: '#F5EDEE', // 設計稿整頁底色（AppShell／body）
  chrome: '#FAF6F6', // 設計稿頂欄、側欄底色
  surface: '#FFFFFF', // --surface-primary
  inset: '#F3F4F6', // --surface-secondary (palette-gray-100)
  border: '#E5E7EB', // --border-tertiary (palette-gray-200)
  divider: '#F3F4F6', // --border-quaternary (palette-gray-100)
  borderStrong: '#D1D5DB', // --border-primary (palette-gray-300)
  /** 卡片外框髮絲線 — 前端 .metric-card/.panel 用的是帶玫瑰味的 #e7dbdd，非灰階 */
  cardBorder: '#E7DBDD',
  /** 卡片告警外框 — 前端 .metric-card--alert */
  cardBorderAlert: '#C74365',
} as const

/** ← color.css: --text-* */
export const text = {
  primary: '#1E2939', // --text-primary (palette-gray-900)
  secondary: '#4A5565', // --text-secondary (palette-gray-600)
  tertiary: '#6A7282', // --text-tertiary (palette-gray-500)
  quaternary: '#99A1AF', // --text-quaternary (palette-gray-400)
} as const

/** ← color.css: --brand-* / --text-theme / --link-filled */
export const brand = {
  base: '#C10007', // --brand-700 = --text-theme / --border-theme
  solid: '#E7000B', // --brand-600 = --link-filled（實心按鈕底色）
  deep: '#9F0712', // --brand-800 = --link-filled-pressed
  soft: '#FEF2F2', // --brand-50 = --surface-theme
  softHover: '#FFE2E2', // --brand-100 = --link-tonal-hover
} as const

/**
 * status colour triplets: { fg, bg, bd }
 * ← color.css: --status-*-emphasis / --status-*-border
 * bg 取自前端 status-*-light 疊白後的等效不透明色（SVG fill 不吃 hex8）。
 */
export const status = {
  normal: { fg: '#00BC7D', bg: '#ECFDF5', bd: '#BBF7D0' },
  warning: { fg: '#FFB900', bg: '#FFFBEB', bd: '#FDE68A' },
  danger: { fg: '#FB2C36', bg: '#FEF2F2', bd: '#FECACA' },
  critical: { fg: '#C10007', bg: '#FFE2E2', bd: '#FFC9C9' },
  info: { fg: '#2B7FFF', bg: '#EFF6FF', bd: '#BAE6FD' },
  inactive: { fg: '#737373', bg: '#F3F4F6', bd: '#E5E7EB' },
} as const

/**
 * Read-rate chart series — LP indigo / MN cyan / ALT salmon。
 * 與前端 NewDashboard 的 .dot--lp / --mn / --alt 同色。
 * These are CATEGORY colours for line/area series only; they never encode
 * health.
 */
export const series = {
  lp: '#5E5CE6', // LP 讀表率
  midnight: '#64D2FF', // MN 午夜讀表率
  alt: '#FF9A9A', // ALT 讀表率
} as const

/**
 * Quiet chart neutrals — "empty container" bars & normal-state rings.
 * ← 前端 .summary-bars / .device-progress 的 track 色。
 */
export const chartNeutral = {
  track: '#E5E7EB', // bar container / gauge track remainder
  fill: '#A1A1A1', // 前端 --status-inactive
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
 * Map health tri-colour (legend: 良好 / 注意 / 警告) — DEFINITIVE palette。
 * ← 前端 features/DashBoard/constants/new/newDashboardRegions.ts
 *   colorForDashboardHealth(): good #E5E7EB / warning #FFD230 / alert #FB2C36。
 * 良好＝中性灰，讀作「沒事」；注意／警告才跳出來。
 * `accent` 供填色太淡讀不出來的地方使用（legend dot、status pill、gauge arc）。
 */
export type HealthKey = 'good' | 'warning' | 'alert'
export const health: Record<HealthKey, { fill: string; stroke: string; accent: string; label: string }> = {
  good: { fill: '#E5E7EB', stroke: '#D1D5DB', accent: '#9CA3AF', label: '良好' },
  warning: { fill: '#FFD230', stroke: '#E0A800', accent: '#FFD230', label: '注意' },
  alert: { fill: '#FB2C36', stroke: '#C10007', accent: '#FB2C36', label: '警告' },
}

/**
 * 「無智慧電表 / 尚未部署」區域 — 不是健康狀態，而是「沒有資料」。
 * 前端地圖 muted 與 good 同為 #E5E7EB，只在圖例用虛線條紋區隔；
 * prototype 保留斜線紋填色，辨識度較好也不違背前端色票。
 */
export const noMeter = { fill: '#E5E7EB', stroke: '#C9CDD4', label: '無電表' } as const

/** 地圖區塊外框 — ← 前端 regions-outline line-color */
export const mapOutline = '#A77752'

/** region fill = health colour at ~96% opacity (前端 fill-opacity) */
export const HEALTH_FILL_OPACITY = 0.96

/**
 * ← color.css: --boxshadow-cardS / --boxshadow-cardM
 * 前端卡片一律用 cardS，抽屜類用較重的一階。
 */
export const shadow = {
  card: '0px 2px 4px -1px #9F071212, 0px 0px 1px 0px #82181A06',
  cardHover: '0px 10px 12px -2px #9F071212, 0px 4px 6px -1px #00000002, 0px 0px 1px 0px #82181A06',
  drawer: '-8px 20px 24px -2px #9F071212, 0px 4px 8px -1px #00000004, 0px 0px 1px 0px #82181A06',
} as const

/** 系統總覽頁底 — ← 前端 .new-dashboard background */
export const pageBackground =
  'radial-gradient(circle at 8% 8%, rgba(173, 49, 85, 0.08), transparent 28%), linear-gradient(180deg, #F8F0F2 0%, #F6EEEE 100%)'

/**
 * 系統總覽區塊色 —— 版面比照《系統設計規格書_2_系統總覽_V0.9》的參考畫面，
 * 但色值一律取自上面既有的 status / brand token。
 */
export const overview = {
  connect: status.info.fg, // 60分鐘連線數 — 藍
  lp: status.normal.fg, // 60分鐘讀表成功數 — 綠
  mn: '#B45309', // 午夜讀表數 (MN) — 琥珀（status.warning.fg 當文字太淡）
  alt: '#0E8FA8', // 定時供電品質 (ALT) — 藍綠
  meterCount: '#3D5A6C', // 圖表：電表總數 — 深板岩藍
  outage: status.danger.fg, // 圖表/區塊：停電數 — 紅（告警語意）
  event: '#B45309', // 圖表：事件數 — 琥珀
} as const
