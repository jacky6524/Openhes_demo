import type { DcuStatus } from '@/data/dcuList'
import { stampOf, MINUTES_SINCE_MIDNIGHT } from '@/data/dcuFleet'

/* Deterministic mock meter list under a single DCU (DCU 詳細資料 screen). */

/** 白名單歸屬：in＝白名單應屬本台、out＝名單外（白名單沒有卻連進來） */
export type Whitelist = 'in' | 'out'

export interface DcuMeterRow {
  status: DcuStatus
  dcuSerial: string // DCU 編號
  meterNo: string // 表號
  elecNo: string // 電號
  address: string // 地址
  disabled: 'N' | 'Y' // 停用
  whitelist: Whitelist // 白名單歸屬
  connectedDcu: string // 連線 DCU（實際收容；與白名單應屬不同＝歸屬錯誤）
  reportDevice: string // 回報裝置
  fanMac: string // FAN MAC
  signal: number // 訊號值
  lastLp: string // 最後 LP 時間
  lastLpMins: number // 最後 LP 距今分鐘（判斷是否當日）
  lastMn: string // 最後 MN 時間
  lastMnMins: number // 最後 MN 距今分鐘（判斷是否當日）
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
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const pad = (n: number, w: number) => String(n).padStart(w, '0')
const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, '0')

const STREETS = ['北新路三段', '中正路二段', '文化路一段', '寶橋路', '民權路', '中興路四段']

/** 100 meters under the given DCU model (deterministic per model) */
export function metersForDcu(model: string): DcuMeterRow[] {
  const base = hash(model)
  return Array.from({ length: 100 }, (_, i) => {
    const r = mulberry32(base + i * 2654435761)
    const row = buildRow(r)
    return { ...row, connectedDcu: connectedDcuOf(model, row, r) }
  })
}

function buildRow(r: () => number): DcuMeterRow {
  const status: DcuStatus = r() < 0.05 ? 'offline' : 'online'
  const disabled: 'N' | 'Y' = r() < 0.04 ? 'Y' : 'N'
  const signal = status === 'offline' ? 0 : 90 + Math.floor(r() * 11)
  const lane = 100 + Math.floor(r() * 300)
  const no = 1 + Math.floor(r() * 20)
  const street = STREETS[Math.floor(r() * STREETS.length)]
  // 讀表時間：連線的表當日內就有讀值，斷線的表落到前幾天 → 畫面上以紅字標「非當日」
  const lastLpMins =
    status === 'online'
      ? Math.floor(r() * MINUTES_SINCE_MIDNIGHT)
      : MINUTES_SINCE_MIDNIGHT + 1440 * (1 + Math.floor(r() * 3))
  const lastMnMins =
    status === 'online'
      ? MINUTES_SINCE_MIDNIGHT - Math.floor(r() * 55)
      : MINUTES_SINCE_MIDNIGHT + 1440 * (1 + Math.floor(r() * 3))
  return {
    status,
    dcuSerial: `B${6000 + Math.floor(r() * 3999)}AA${10 + Math.floor(r() * 89)}-${1 + Math.floor(r() * 9)}`,
    meterNo: `KT${19000000 + Math.floor(r() * 999999)}`,
    // 電號一律 11 碼、不帶 -（2026-09-29 業主意見）：區處 2 碼＋8 碼＋檢查碼 1 碼
    elecNo: `${pad(1 + Math.floor(r() * 9), 2)}${62000000 + Math.floor(r() * 999999)}${Math.floor(r() * 9)}`,
    address: `新北市新店區${street}${lane}巷${no}號`,
    disabled,
    whitelist: r() < 0.08 ? 'out' : 'in',
    connectedDcu: '',
    reportDevice: `AE1092D${pad(30 + Math.floor(r() * 60), 5)}`,
    fanMac: `18BE92FFFF${hex(Math.floor(r() * 0xffffff), 6)}`,
    signal,
    lastLp: stampOf(lastLpMins),
    lastLpMins,
    lastMn: stampOf(lastMnMins),
    lastMnMins,
  }
}

/**
 * 連線 DCU —— 名單外的表一定是實際連進本台；白名單內的表多數也在本台，
 * 少數跑到鄰台（歸屬錯誤），這時畫面上就看得出 連線DCU ≠ 本台。
 */
function connectedDcuOf(model: string, row: DcuMeterRow, r: () => number): string {
  if (row.whitelist === 'out') return model
  return r() < 0.06 ? `AE1092D${pad(1 + Math.floor(r() * 200), 4)}` : model
}

/**
 * 由「已知的表號／收容 DCU／連線狀態」補齊其餘屬性（電號、地址、FAN MAC…）。
 * 供 DCU 總覽的電表列表接上「詳細資料／電表資料」抽屜；屬性一律由表號 hash 推導，
 * 同一表號永遠得到同一份資料。TODO: 上線改接 API 後直接以真實欄位取代。
 */
export function meterRowOf(meterNo: string, dcuSerial: string, online: boolean, elecPrefix?: string): DcuMeterRow {
  const row = buildRow(mulberry32(hash(meterNo)))
  // 電號前兩碼＝台電區處，需與該電表所屬 DCU 的區處一致
  const elecNo = elecPrefix ? `${elecPrefix}${row.elecNo.slice(2)}` : row.elecNo
  return {
    ...row,
    meterNo,
    dcuSerial,
    elecNo,
    connectedDcu: row.connectedDcu || dcuSerial,
    status: online ? 'online' : 'offline',
    signal: online ? row.signal || 95 : 0,
  }
}
