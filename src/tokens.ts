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
 * 2026-10-22 業主新色票「新告警色票.png」（系統總覽與 DCU 總覽地圖）：
 *   告警 #ED6063 / 良好 #9DD39F / 注意 #FFB800。
 *   （原本是前端 newDashboardRegions.ts 的 良好 #E5E7EB 中性灰／注意 #FFD230／告警 #FB2C36。）
 * 2026-11-04 業主再調：良好綠彩度調淡五成、注意改 #FDC700、告警改 #DE1A1A；
 *   同日再依「三色協調」在 OKLCH 對齊（色相照業主的三色不動）：
 *   · 良好：協調時一度用 #A6C9A6，業主隨後要求**改回原色 #9DD39F**（stroke 也回到 #79B87C）
 *   · 注意 #FDC700 不動（L 0.85，三色的亮度基準）
 *   · 告警 #DE1A1A → #E03930：原色 L 0.57 比另外兩色暗一大截、大面積填色很重，提到 L 0.60 並稍降彩度
 *   規則：嚴重度越高彩度越高（0.06 → 0.17 → 0.21）；三色的 stroke 一律比 fill 暗一階（OKLCH L −0.10）。
 * 2026-11-17 注意改為正式機截圖的 #F5D100（圖例／地圖／散點／環形取色一致；L 0.865，與原 #FDC700 幾乎同亮、
 *   色相偏檸檬黃），stroke #D4B000 照上面規則（OKLCH L −0.10）算出。
 * 2026-11-06 良好 fill 再改為 #D8EDD9（#9DD39F 以 40% 疊白底的預混色，同 10/30 的「更透明」版本）；
 *   stroke 與 accent 維持 #79B87C／#9DD39F。用預混色值而非改 opacity，各地圖才會一致。
 * stroke 只用在區塊外框；fill 與 accent 都是色票原色（良好 fill 例外，見上）。
 * `accent` 供填色太淡讀不出來的地方使用（legend dot、status pill、gauge arc）。
 */
export type HealthKey = 'good' | 'warning' | 'alert'
export const health: Record<HealthKey, { fill: string; stroke: string; accent: string; label: string }> = {
  good: { fill: '#D8EDD9', stroke: '#79B87C', accent: '#9DD39F', label: '良好' }, // 2026-11-06：改用淡綠（40%）
  warning: { fill: '#F5D100', stroke: '#D4B000', accent: '#F5D100', label: '注意' }, // 2026-11-17：照正式機截圖
  alert: { fill: '#E03930', stroke: '#B3241E', accent: '#E03930', label: '警告' },
}

/**
 * 「無智慧電表 / 尚未部署」區域 — 不是健康狀態，而是「沒有資料」。
 * 前端地圖 muted 與 good 同為 #E5E7EB，只在圖例用虛線條紋區隔；
 * prototype 保留斜線紋填色，辨識度較好也不違背前端色票。
 */
export const noMeter = { fill: '#E5E7EB', stroke: '#C9CDD4', label: '無電表' } as const

/** 地圖區塊外框 — ← 前端 regions-outline line-color */
export const mapOutline = '#A77752'

/**
 * region fill = health colour at ~96% opacity (前端 fill-opacity)。
 * 系統總覽與 DCU總覽（故障／關係地圖、離島捷徑）共用，兩頁告警色看起來才會一模一樣（業主 2026-10-30）。
 */
export const HEALTH_FILL_OPACITY = 0.96

/**
 * 讀表率進度條（系統總覽「當日累積讀表」、「讀表 × 連線概況」右欄）：淡藍 blue-300，
 * 與 status.info 同色相（2026-11-17 業主：避免與告警色混淆）。
 */
export const RATE_BAR = '#8EC5FF'

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
