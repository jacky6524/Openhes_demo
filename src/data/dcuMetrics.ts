/**
 * DCU 衍生指標的單一入口。
 *
 * 目前這些值全部由 mock 的電表逐筆算出來；正式上線後它們應該是 **API 直接給的欄位**
 * （讀表率是伺服器彙總、歸屬圈半徑與離群旗標由後端算好），屆時只要改這個檔案的
 * 三個函式改成讀 API 欄位即可，呼叫端（地圖、列表、KPI）都不用動。
 *
 * 百萬級電表時前端不可能再逐表彙總：一次掃描 100 萬筆約 270ms，會直接卡在互動路徑上。
 */
import { dcuById, dcuMeterStat, metersOfDcu, metersExpectedOf, type Meter } from './dcuFleet'
import { meterRange } from '@/lib/geoRange'

/** 一台 DCU 的讀表彙總（API 欄位候選：total / online / read / read_rate） */
export interface DcuStat { total: number; online: number; read: number; readRate: number }

const statCache = new Map<string, DcuStat>()
export function dcuStat(dcuId: string): DcuStat {
  let s = statCache.get(dcuId)
  if (!s) { s = dcuMeterStat(dcuId); statCache.set(dcuId, s) }
  return s
}

/**
 * 一台 DCU 的歸屬範圍（API 欄位候選：range_radius_m + 電表上的 is_outlier 旗標）。
 * 注意這只是 **圓心 + 半徑三個數字**，本來就不需要前端持有全部電表才能畫。
 */
export interface DcuRange {
  dcuId: string
  lng: number
  lat: number
  radiusM: number
  outliers: { id: string; lng: number; lat: number }[]
}

const rangeCache = new Map<string, DcuRange | null>()
/** 與可視範圍無關（一律用該 DCU 的全部收容電表），故可永久快取 */
export function dcuRange(dcuId: string): DcuRange | null {
  if (rangeCache.has(dcuId)) return rangeCache.get(dcuId)!
  const d = dcuById.get(dcuId)
  let out: DcuRange | null = null
  if (d) {
    const ms = metersOfDcu(dcuId)
    const { radiusM, outliers } = meterRange([d.lng, d.lat], ms.map((m) => [m.lng, m.lat]))
    out = { dcuId, lng: d.lng, lat: d.lat, radiusM, outliers: outliers.map((i) => ({ id: ms[i].id, lng: ms[i].lng, lat: ms[i].lat })) }
  }
  rangeCache.set(dcuId, out)
  return out
}

/**
 * 歸屬錯誤分兩個方向（依業主 2026-08 意見）：
 *   in  他台連入 —— 實際收容於本台、白名單卻應屬別台（別人的表跑進來）
 *   out 連入他台 —— 白名單應屬本台、實際卻收容於別台（自己的表跑出去）
 * 同一顆電表對甲是 out、對乙就是 in。
 * TODO: 上線後改由後端白名單比對（一句 join），前端只拿計數與分頁列表。
 */
export type MisDir = 'in' | 'out'
export const MIS_DIR_LABEL: Record<MisDir, string> = { in: '他台連入', out: '連入他台' }
export interface MisMeter { meter: Meter; dir: MisDir }

/** 他台連入：實際收容於本台、但白名單應屬別台 */
export function misassignedIn(dcuId: string): Meter[] {
  return metersOfDcu(dcuId).filter((m) => m.expectedDcuId !== dcuId)
}
/** 連入他台：白名單應屬本台、但實際收容於別台 */
export function misassignedOut(dcuId: string): Meter[] {
  return metersExpectedOf(dcuId)
}
/** 兩個方向合併，帶方向標記（供列表與地圖圖層共用） */
export function misassignedDetail(dcuId: string): MisMeter[] {
  return [
    ...misassignedIn(dcuId).map((meter) => ({ meter, dir: 'in' as MisDir })),
    ...misassignedOut(dcuId).map((meter) => ({ meter, dir: 'out' as MisDir })),
  ]
}
/** 與本台有關的所有歸屬錯誤電表（兩個方向）—— 供徽章計數 */
export function misassignedOfDcu(dcuId: string): Meter[] {
  return [...misassignedIn(dcuId), ...misassignedOut(dcuId)]
}

/** 資料來源更新（改接 API 後的輪詢／重新整理）時呼叫 */
export function clearMetricsCache() {
  statCache.clear()
  rangeCache.clear()
}
