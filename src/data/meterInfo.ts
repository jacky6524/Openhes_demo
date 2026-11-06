/* Deterministic mock attribute data for the 電表資料 side drawer. */

export interface MeterInfoExtra {
  ip: string
  imsi: string
  cellId: string
  touId: string
  ptCt: string // PT／CT／功率
  onlineStatusTime: string // 上線狀態更新時間
  onlineLastTime: string // 上線最後更新時間
  keyDate: string // 金鑰日期
  latlng: string // 經緯度
  moduleModel: string // 模組型號
  moduleFw: string // 模組韌體版本
  note: string // 備註
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

const MODULES = ['SGCM-W61-TFB', 'SGCM-W62-TFB', 'SGCM-N71-NBF', 'SGCM-L51-LTF']

export function meterInfo(meterNo: string): MeterInfoExtra {
  const r = mulberry32(hash(meterNo))
  const lat = (24.97 + r() * 0.03).toFixed(6)
  const lng = (121.53 + r() * 0.03).toFixed(6)
  return {
    ip: `172.17.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`,
    imsi: `4668901${pad(Math.floor(r() * 99999999), 8)}`,
    cellId: hex(Math.floor(r() * 0xfffffff), 7),
    touId: pad(1 + Math.floor(r() * 20), 6),
    ptCt: '1／1／1',
    onlineStatusTime: '2026/03/18 10:30',
    onlineLastTime: '2026/03/18 10:30',
    keyDate: '2026/01/01 16:00',
    latlng: `${lat}, ${lng}`,
    moduleModel: MODULES[Math.floor(r() * MODULES.length)],
    moduleFw: pad(Math.floor(r() * 30), 4),
    note: `10${8 + Math.floor(r() * 2)}P${1 + Math.floor(r() * 3)}`,
  }
}
