/**
 * 裝置管理 · 裝置列表（OpenHES_裝置列表_UIUX欄位規格.md；正式前端 /devices）的 mock 資料。
 *
 * 三種主分頁共用一個型別：
 *   DCU     一台 DCU 一列（id＝DCU 序號）
 *   LTE     一個 Cell ID 一列（以基地台細胞為單位統計底下的 LTE 電表）
 *   NB-IoT  同上（NB-IoT 電表）
 * 每列都帶座標（地圖 Marker 用）；少數幾列故意沒有座標，用來呈現規格第 13 節的「無法定位」狀態。
 * 所屬電表（devMeters）沿用 DCU 電表的產生器（dcuMeters.metersForDcu），補上座標與訊號：
 *   DCU 底下＝RF 電表 → LQI（0–100）；LTE／NB-IoT 底下 → RSRP（dBm，負值）
 * TODO: 上線改接 API —— DCU：GET /dcus/summary、/dcus/{id}/meters/summary；LTE／NB-IoT：依 Cell ID 統計的 API（後端尚未提供）。
 */
import { DCU_ROWS, type DcuRow, type DcuStatus } from './dcuList'
import { metersForDcu, type DcuMeterRow } from './dcuMeters'

export type DeviceKind = 'DCU' | 'LTE' | 'NB-IoT'
export const DEVICE_KINDS: DeviceKind[] = ['DCU', 'LTE', 'NB-IoT']

export interface DeviceRow {
  kind: DeviceKind
  id: string // DCU 序號 或 Cell ID
  dcuNumber?: string // DCU 編號（只有 DCU）
  status?: DcuStatus // 只有 DCU 有裝置本身的連線狀態；Cell 沒有
  online: number // 上線電表數
  total: number // 電表總數
  read: number // 讀表數
  onlinePct: number // 上線率＝online / total
  readPct: number // 讀表率＝read / 應讀表數（demo 以 total 當分母）
  lng: number | null
  lat: number | null
  /** DCU 的原始列（DCU 資訊卡、裝置設定彈窗吃這個型別） */
  dcu?: DcuRow
}

export interface DeviceMeter extends DcuMeterRow {
  lng: number | null
  lat: number | null
  /** DCU 底下＝LQI；LTE／NB-IoT 底下＝RSRP (dBm)。斷線為 null */
  sig: number | null
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7)

/** 台北市中心一帶（大安／信義／中正）；DCU 佈得密一點，Cell 涵蓋範圍大、散得開一點 */
const AREA = { lng: [121.505, 121.585], lat: [25.010, 25.060] } as const
const NO_COORD = new Set([7, 41, 88]) // 這幾列故意沒座標

function coord(r: () => number, i: number): [number | null, number | null] {
  if (NO_COORD.has(i)) return [null, null]
  return [AREA.lng[0] + r() * (AREA.lng[1] - AREA.lng[0]), AREA.lat[0] + r() * (AREA.lat[1] - AREA.lat[0])]
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

/**
 * 讀表數：門檻改成燈號門檻 API（≥97／95–97／<95）後，DCU_ROWS 原本的讀表數（上線數的 72–100%）幾乎全落在警告。
 * 這裡照實際資料的分布重抽（/dcus/summary 實測約 94% 的 DCU ≥80%）：多數接近上線數，少數掉到注意、警告。
 */
function dcuRead(d: DcuRow) {
  const r = mulberry32(hash(d.model) + 99)
  const tier = r()
  const rate = tier < 0.07 ? 0.7 + r() * 0.24 : tier < 0.17 ? 0.955 + r() * 0.014 : 0.975 + r() * 0.025
  return Math.min(d.online, Math.round(d.total * rate))
}

const DCU_DEVICES: DeviceRow[] = DCU_ROWS.map((d, i) => {
  const [lng, lat] = coord(mulberry32(hash(d.model)), i)
  return {
    kind: 'DCU', id: d.model, dcuNumber: d.serial, status: d.status,
    online: d.online, total: d.total, read: dcuRead(d),
    // 讀表率＝讀表數 ÷ 總數（同 API /dcus/summary：receivedMeterCount ÷ meterCount）
    onlinePct: pct(d.online, d.total), readPct: pct(dcuRead(d), d.total),
    lng, lat, dcu: d,
  }
})

/** Cell ID：MCC-MNC（466-92）＋ 7 位十六進位 ECI／NCI */
function cells(kind: 'LTE' | 'NB-IoT', n: number, seed: number): DeviceRow[] {
  return Array.from({ length: n }, (_, i) => {
    const r = mulberry32(seed + i * 2654435761)
    const total = 40 + Math.floor(r() * 160)
    const tier = r()
    // 上線率／讀表率三段都要看得到（燈號門檻 API：≥97 良好、95–97 注意、<95 警告）
    const band = (t: number) => (t < 0.08 ? 0.7 + r() * 0.24 : t < 0.2 ? 0.955 + r() * 0.014 : 0.975 + r() * 0.025)
    const online = Math.round(total * band(tier))
    const read = Math.min(online, Math.round(total * band(r())))
    const id = `466-92-${(0x1000000 + Math.floor(r() * 0xefffff)).toString(16).toUpperCase()}`
    const [lng, lat] = coord(r, i + (kind === 'LTE' ? 1000 : 2000))
    return { kind, id, online, total, read, onlinePct: pct(online, total), readPct: pct(read, total), lng, lat }
  })
}

export const DEVICES: Record<DeviceKind, DeviceRow[]> = {
  DCU: DCU_DEVICES,
  LTE: cells('LTE', 36, 0x17e),
  'NB-IoT': cells('NB-IoT', 28, 0x2b1),
}

const meterCache = new Map<string, DeviceMeter[]>()
/** 選定裝置的所屬電表：散在裝置周圍（DCU 約 400 m 內、Cell 約 900 m 內）；裝置沒座標時電表也沒有 */
export function devMeters(dev: DeviceRow): DeviceMeter[] {
  const key = `${dev.kind}:${dev.id}`
  const hit = meterCache.get(key)
  if (hit) return hit
  const spread = dev.kind === 'DCU' ? 0.004 : 0.009
  const rows = metersForDcu(dev.id).slice(0, Math.min(100, dev.total))
  const out = rows.map((m, i) => {
    const r = mulberry32(hash(m.meterNo) + i)
    const ang = r() * Math.PI * 2
    const dist = Math.sqrt(r()) * spread
    const has = dev.lng !== null && dev.lat !== null
    const sig = m.status === 'offline'
      ? null
      : dev.kind === 'DCU' ? m.signal : -(70 + Math.floor(r() * 45)) // RSRP -70 ~ -115 dBm
    return {
      ...m,
      lng: has ? dev.lng! + Math.cos(ang) * dist : null,
      lat: has ? dev.lat! + Math.sin(ang) * dist * 0.9 : null,
      sig,
    }
  })
  meterCache.set(key, out)
  return out
}
