/**
 * 讀表管理的「資料類型」下拉 —— 2026-11-04 業主給了 7 項清單，同日要求「以後端資料為準」，
 * 實打兩支 API 後發現兩頁的類型本來就不同，各自照後端：
 *
 *   即時讀表  GET /api/odr/demand-types（6 種）：midnight、load_profile、alt_power_quality、
 *            demand_reset_report、common、del_total_kwh。**沒有事件資料**。
 *            common／del_total_kwh 是即時暫存器（dataType=register、needTimePeriod=false）→ 不需資料時間；
 *            common 一次讀回 7 個資料項目（dataItems）。
 *   MDMS上拋  GET /api/p6xml/upload/status 的實際紀錄：MeterReadings（type＝lp／alt／mn）與
 *            EndDeviceEvents（事件）。**沒有 DRR、common、del_total_kwh**。
 *
 * 顯示順序沿用業主清單：午夜→負載→ALT→DRR→common→del_total_kwh→事件。
 * apiName：即時讀表＝demand-types 的 name；MDMS＝上拋任務的 type（事件為 noun EndDeviceEvents）。
 * valueLabel：ondemand 讀取結果右表讀值欄的欄名；perRead：每顆電表回幾筆（mock 用）。
 * MDMS 欄位（cadence／stepMin／total）：上拋統計的時段長度與總量（mock 用）。
 */
export const READ_DATA_TYPES = [
  { key: 'MN', label: '午夜資料(MN)', odr: 'midnight', mdms: 'mn', needTimePeriod: true, valueLabel: '累積電量 (kWh)', perRead: 1, cadence: '每天更新', stepMin: 1440, total: 433_004 },
  { key: 'LP', label: '負載資料(LP)', odr: 'load_profile', mdms: 'lp', needTimePeriod: true, valueLabel: '累積電量 (kWh)', perRead: 4, cadence: '每15分鐘更新', stepMin: 15, total: 806_000 },
  { key: 'ALT', label: '定時供電品質資料(ALT)', odr: 'alt_power_quality', mdms: 'alt', needTimePeriod: true, valueLabel: '電壓 (V)', perRead: 4, cadence: '每1小時更新', stepMin: 60, total: 802_000 },
  { key: 'DRR', label: '需量復歸報表(DRR)', odr: 'demand_reset_report', mdms: null, needTimePeriod: true, valueLabel: '最大需量 (kW)', perRead: 1, cadence: '每天更新', stepMin: 1440, total: 38_000 },
  { key: 'common', label: 'common', odr: 'common', mdms: null, needTimePeriod: false, valueLabel: '讀值', perRead: 7, cadence: '', stepMin: 60, total: 0 },
  { key: 'del_total_kwh', label: 'del_total_kwh', odr: 'del_total_kwh', mdms: null, needTimePeriod: false, valueLabel: '累積電量 (kWh)', perRead: 1, cadence: '', stepMin: 60, total: 0 },
  { key: 'event', label: '事件資料(event)', odr: null, mdms: 'EndDeviceEvents', needTimePeriod: true, valueLabel: '事件碼', perRead: 2, cadence: '每1小時更新', stepMin: 60, total: 120_000 },
] as const

export type ReadDataType = (typeof READ_DATA_TYPES)[number]
export type ReadDataKey = ReadDataType['key']
export const dataTypeOf = (k: ReadDataKey): ReadDataType => READ_DATA_TYPES.find((t) => t.key === k)!

/** 即時讀表可選的類型（後端 demand-types 有的） */
export type OdrKey = Exclude<ReadDataKey, 'event'>
export const ODR_TYPES = READ_DATA_TYPES.filter((t): t is Extract<ReadDataType, { odr: string }> => t.odr !== null)
/** MDMS上拋可選的類型（後端上拋紀錄有的） */
export type MdmsTypeKey = 'MN' | 'LP' | 'ALT' | 'event'
export const MDMS_DATA_TYPES = READ_DATA_TYPES.filter((t): t is Extract<ReadDataType, { mdms: string }> => t.mdms !== null)

/**
 * common 一次讀回的 7 個資料項目（後端 demand-types 的 dataItems，括號內為項目名）。
 * 右表每顆電表 7 列，讀值欄顯示「項目名 值 單位」。
 */
export const COMMON_ITEMS: Array<{ name: string; unit: string }> = [
  { name: 'hz', unit: 'Hz' },
  { name: 'inst_kva', unit: 'kVA' },
  { name: 'del_rate_a_cum_demand_kw', unit: 'kW' },
  { name: 'del_total_kwh', unit: 'kWh' },
  { name: 'del_rate_c_total_kwh', unit: 'kWh' },
  { name: 'del_total_kvarh', unit: 'kvarh' },
  { name: 'del_total_lagging_kvarh', unit: 'kvarh' },
]
