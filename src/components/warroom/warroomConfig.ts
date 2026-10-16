/**
 * DCU 戰情室兩張地圖共用的視覺設定 —— 兩頁籤色彩／圖例／編碼一致。
 * 色弱友善原則：資訊拆成多通道（形狀＝裝置類型、紅色中心＝斷線、外框色＝群組、
 * 虛線＝跨區/最後已知），不只靠單一顏色。
 */
import { health } from '@/tokens'

/**
 * 行政區嚴重度色（故障地圖色塊）—— 直接沿用系統總覽的 health token，
 * 兩頁的「良好／注意／警告」是同一組顏色與同一組字，不再各自定義。
 */
export const SEVERITY_COLOR = {
  normal: health.good.fill,
  warn: health.warning.fill,
  alert: health.alert.fill,
} as const
/** 對應的邊框色（系統總覽地圖用同一組 stroke） */
export const SEVERITY_STROKE = {
  normal: health.good.stroke,
  warn: health.warning.stroke,
  alert: health.alert.stroke,
} as const
/** 文字用的高彩度變體（色塊太淡時用，例如列表的狀態文字） */
export const SEVERITY_ACCENT = {
  normal: health.good.accent,
  warn: health.warning.accent,
  alert: health.alert.accent,
} as const
export const SEVERITY_LABEL = {
  normal: health.good.label, // 良好
  warn: health.warning.label, // 注意
  alert: health.alert.label, // 警告
} as const

/** 裝置狀態編碼（關係地圖） */
export const STATUS = {
  dcuOffline: '#DB3B36', // DCU 本身斷線（紅）
  dcuCarries: '#E8862B', // DCU 在線但收容斷線電表（橘）
  meterOffline: '#DB3B36', // 電表斷線（紅心）
  neutralRing: '#5B4E52', // 未聚焦裝置外框（中性）
  select: '#FFFFFF', // 選取白框
}

/** 頻點色盤 —— 目前設定 10 個頻點，每個頻點一種顏色（避開紅/灰狀態色，色相拉開）。
 *  啟用且正常的 DCU 以其頻點色呈現。index 0 對應頻點 1。 */
export const FREQ_COLORS = [
  '#2F6BED', // 1 藍
  '#0E9B9B', // 2 青
  '#7C3AED', // 3 紫
  '#EA8C00', // 4 橘
  '#1FA85B', // 5 綠
  '#C13BC1', // 6 洋紅
  '#00A3FF', // 7 天藍
  '#8A6D3B', // 8 棕
  '#E4B100', // 9 金
  '#EC4899', // 10 粉
] as const
/** 由頻點取色（1..10）；超出範圍取模 */
export const freqColor = (freq: number) => FREQ_COLORS[((freq - 1) % FREQ_COLORS.length + FREQ_COLORS.length) % FREQ_COLORS.length]

/** DCU 兩種狀態色（凌駕頻點色）：斷線 / 停用。啟用且正常 → 用頻點色 */
export const STATE_COLOR = {
  offline: '#DB3B36', // 斷線 紅
  disabled: '#9AA0A6', // 停用 灰
} as const
export const STATE_LABEL = { active: '啟用', disabled: '停用', offline: '斷線' } as const

/** DCU 群集球統一色（藍） */
export const CLUSTER_BLUE = '#2F6BED'

/** 群組／釘選色（高辨識、最多同時 3 組；藍/紫/青） */
export const GROUP_COLORS = ['#2F6BED', '#7C3AED', '#0E9B9B'] as const
/** 依釘選順序取色；未釘選回 null */
export function pinColor(pinnedIds: string[], id: string): string | null {
  const i = pinnedIds.indexOf(id)
  return i >= 0 ? GROUP_COLORS[i % GROUP_COLORS.length] : null
}

export const DIM_OPACITY = 0.22 // 非聚焦裝置降透明度

/** 選取行政區的填色高亮（取代黑色描邊）*/
export const SELECT_FILL = '#2F6BED'
export const SELECT_FILL_OPACITY = 0.28

/** 故障地圖圖例（三級，與系統總覽一致） */
export const FAULT_LEGEND = {
  severity: (['normal', 'warn', 'alert'] as const).map((k) => ({
    key: k,
    label: SEVERITY_LABEL[k],
    color: SEVERITY_COLOR[k],
  })),
}

/**
 * 歸屬錯誤電表的標記色 —— 依業主意見改為灰色（原為橘色）。
 * 形狀是「畫叉的圓圈」，與斷線 DCU 的「畫叉的方塊」以形狀區隔，不只靠顏色。
 */
export const MIS_COLOR = '#6B5E62'
/** 兩個方向共用同一個灰色標記，方向以 popup／列表文字區分 */
export const MIS_DIR_STROKE = { in: '#6B5E62', out: '#9AA0A6' } as const

/**
 * 斷線群集色 —— 2026-09-03 依業主意見改為**單一低飽和淺藍**：
 * 量級只看球上的數字（2026-09-23 起球一律同尺寸），顏色只負責「這是斷線群集」這一件事。淺藍與底下的
 * 健康帶色（灰／黃／紅）色相拉開，且不會像高飽和紅一樣整片刺眼。
 * 淺底上白字不夠，數字改用深藍字（見 CLUSTER_TEXT）。
 */
export const CLUSTER_COLOR = '#7EB6E3'
export const CLUSTER_TEXT = '#123E5E'

/**
 * 地圖底色與外框 —— 一律以系統總覽的地圖為準（`components/map/HealthMap.tsx` 的 .map-shell）。
 * 2026-09-17 業主意見：兩頁的地圖背景要同一個顏色；原本這裡還停在改版前的玫瑰底 #F7F1F2。
 */
export const MAP_BG = '#F7F4F4'
export const MAP_BORDER = '#E2D8DB'
/**
 * 選取行政區「以外」的區域 —— 2026-09-03 依業主意見塗灰：
 * L3 仍要看得到鄰區的電表與 DCU（跨區歸屬才看得出來），但視覺重心要留在選取那一區，
 * 因此鄰區蓋一層半透明灰，裝置點仍畫在灰層之上。
 */
export const OUTSIDE_FILL = '#8E8589'
export const OUTSIDE_OPACITY = 0.34

/**
 * 滑過區塊的提示（兩張地圖共用）—— 淡淡提亮＋灰色描邊，只暗示「這塊可以點」。
 * 2026-09-29 業主意見：原本的品牌紅描邊太搶眼，改成灰色；斷線地圖也比照加上。
 */
export const AREA_HOVER_LINE = '#6A7282'
export const AREA_HOVER_LINE_WIDTH = 1.8
export const AREA_HOVER_FILL_OPACITY = 0.3

/** 無資料 / 未部署區域（比照系統總覽的斜線紋底色） */
export const MAP_NO_DATA = '#ECE7E9'
