/* Deterministic mock load-profile data for the 電表詳細資料 modal. */

/**
 * 每個時段的讀表狀態 —— 維運人員看圖時要先看得出「資料到齊了沒」：
 *   ok      正常
 *   bad     有值但負載資料狀態異常（圖上標紅點）
 *   missing 該時段沒收到讀值（圖上折線斷開、畫灰帶）
 */
export type PointStatus = 'ok' | 'bad' | 'missing'

export interface ProfilePoint {
  t: string // 時間 (hour)
  instant: number | null // 即時售電量 kWh；缺漏為 null，折線在此斷開
  cumulative: number | null // 累計售電量 kWh
  status: PointStatus
}

export interface ProfileRow {
  rindex: number
  dataTime: string // 資料時間
  hesTime: string // HES 接收時間
  mdmsTime: string // 傳送至 MDMS 時間
  delay: number // 延遲
  loadStatus: number // 負載資料狀態
  kwhTotal: string // 售電總仟瓦小時
  q1: string // 總購電 kVArh(Q1)
  q2: string // 總購電 kVArh(Q2)
  buyKwhTotal: string // 購電總仟瓦小時
  q3: string // 總購電 kVArh(Q3)
  q4: string // 總購電 kVArh(Q4)
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

export function meterProfile(meterNo: string): { chart: ProfilePoint[]; rows: ProfileRow[] } {
  const seed = hash(meterNo)
  const rc = mulberry32(seed)

  // 讀表狀態先決定：一段連續缺漏（模擬通訊中斷）＋兩個狀態異常時段
  const rs = mulberry32(seed ^ 0x9e3779b9)
  const missStart = 9 + Math.floor(rs() * 6) // 09–14 時之間開始斷
  const missLen = 1 + Math.floor(rs() * 3)
  const badHours = new Set<number>()
  while (badHours.size < 2) badHours.add(Math.floor(rs() * 24))

  // 24-hour dual-series chart: 即時售電量 wobbles, 累計售電量 rises monotonically
  let cum = 21320
  const chart: ProfilePoint[] = Array.from({ length: 24 }, (_, i) => {
    const wobble = (rc() - 0.5) * 260
    const wave = Math.sin((i / 23) * Math.PI * 2) * 120
    const instant = Math.max(300, Math.round(560 + wobble + wave))
    cum += 2 + Math.round(rc() * 5) + (i > 14 ? Math.round(rc() * 5) : 0)
    const missing = i >= missStart && i < missStart + missLen
    const status: PointStatus = missing ? 'missing' : badHours.has(i) ? 'bad' : 'ok'
    return {
      t: `${pad(i + 1, 2)}:00`,
      // 缺漏時段兩條線都沒有讀值 —— 累計值也是電表回報的暫存器，不會單獨到齊
      instant: missing ? null : instant,
      cumulative: missing ? null : cum,
      status,
    }
  })

  const rr = mulberry32(seed ^ 0x5bd1e995)
  const rows: ProfileRow[] = Array.from({ length: 48 }, (_, i) => {
    const hh = 10 - Math.floor(i / 6)
    const mm = 30 - ((i * 5) % 60)
    const time = `2025-01-01 ${pad((hh + 24) % 24, 2)}:${pad((mm + 60) % 60, 2)}:00`
    const kwh = () => (4437.6 + Math.round(rr() * 40) / 10000).toFixed(4)
    return {
      rindex: 570 - i,
      dataTime: time,
      hesTime: time,
      mdmsTime: time,
      delay: 3200 + Math.round(rr() * 40),
      loadStatus: rr() < 0.35 ? 1 : 0,
      kwhTotal: kwh(),
      q1: kwh(),
      q2: kwh(),
      buyKwhTotal: kwh(),
      q3: kwh(),
      q4: kwh(),
    }
  })

  return { chart, rows }
}
