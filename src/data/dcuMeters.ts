import type { DcuStatus } from '@/data/dcuList'

/* Deterministic mock meter list under a single DCU (DCU 詳細資料 screen). */

export interface DcuMeterRow {
  status: DcuStatus
  dcuSerial: string // DCU 編號
  meterNo: string // 表號
  elecNo: string // 電號
  address: string // 地址
  disabled: 'N' | 'Y' // 停用
  reportDevice: string // 回報裝置
  fanMac: string // FAN MAC
  signal: number // 訊號值
  lastLp: string // 最後 LP 時間
  lastMn: string // 最後 MN 時間
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
  return Array.from({ length: 100 }, (_, i) => buildRow(mulberry32(base + i * 2654435761)))
}

function buildRow(r: () => number): DcuMeterRow {
  const status: DcuStatus = r() < 0.05 ? 'offline' : 'online'
  const disabled: 'N' | 'Y' = r() < 0.04 ? 'Y' : 'N'
  const signal = status === 'offline' ? 0 : 90 + Math.floor(r() * 11)
  const lane = 100 + Math.floor(r() * 300)
  const no = 1 + Math.floor(r() * 20)
  const street = STREETS[Math.floor(r() * STREETS.length)]
  const min = 25 + Math.floor(r() * 10)
  return {
    status,
    dcuSerial: `B${6000 + Math.floor(r() * 3999)}AA${10 + Math.floor(r() * 89)}-${1 + Math.floor(r() * 9)}`,
    meterNo: `KT${19000000 + Math.floor(r() * 999999)}`,
    elecNo: `${pad(1 + Math.floor(r() * 9), 2)}-${62000000 + Math.floor(r() * 999999)}-${Math.floor(r() * 9)}`,
    address: `新北市新店區${street}${lane}巷${no}號`,
    disabled,
    reportDevice: `AE1092D${pad(30 + Math.floor(r() * 60), 5)}`,
    fanMac: `18BE92FFFF${hex(Math.floor(r() * 0xffffff), 6)}`,
    signal,
    lastLp: `2025-01-01 10:${pad(min, 2)}:00`,
    lastMn: `2025-01-01 00:${pad(min, 2)}:00`,
  }
}

/**
 * 由「已知的表號／收容 DCU／連線狀態」補齊其餘屬性（電號、地址、FAN MAC…）。
 * 供 DCU 總覽的電表列表接上「詳細資料／電表資料」抽屜；屬性一律由表號 hash 推導，
 * 同一表號永遠得到同一份資料。TODO: 上線改接 API 後直接以真實欄位取代。
 */
export function meterRowOf(meterNo: string, dcuSerial: string, online: boolean): DcuMeterRow {
  const row = buildRow(mulberry32(hash(meterNo)))
  return { ...row, meterNo, dcuSerial, status: online ? 'online' : 'offline', signal: online ? row.signal || 95 : 0 }
}
