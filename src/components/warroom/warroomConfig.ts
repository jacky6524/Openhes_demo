/**
 * DCU 戰情室兩張地圖共用的視覺設定 —— 兩頁籤色彩／圖例／編碼一致。
 * 色弱友善原則：資訊拆成多通道（形狀＝裝置類型、紅色中心＝斷線、外框色＝群組、
 * 虛線＝跨區/最後已知），不只靠單一顏色。
 */

/** 行政區嚴重度色（故障地圖色塊）— 四級，色相拉開 */
export const SEVERITY_COLOR = {
  normal: '#DCE3DD', // 正常/低彩度灰綠
  warn: '#F5C518', // 注意 黃
  abnormal: '#E8862B', // 異常 橘
  critical: '#DB3B36', // 嚴重 紅
} as const
export const SEVERITY_LABEL = {
  normal: '正常',
  warn: '注意',
  abnormal: '異常',
  critical: '嚴重',
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

/** 故障地圖圖例 */
export const FAULT_LEGEND = {
  severity: (['normal', 'warn', 'abnormal', 'critical'] as const).map((k) => ({
    key: k,
    label: SEVERITY_LABEL[k],
    color: SEVERITY_COLOR[k],
  })),
}
