/* Deterministic mock load-profile data for the 電表詳細資料 modal. */

export interface ProfilePoint {
  t: string // 時間 (hour)
  instant: number // 即時售電量 kWh
  cumulative: number // 累計售電量 kWh
}

export interface ProfileRow {
  rindex: number
  dataTime: string // 資料時間
  hesTime: string // HES 接收時間
  mdmsTime: string // 傳送至 MDMS 時間
  delay: number // 延遲
  loadStatus: number // 負載資料狀態
  kwhTotal: string // 售電總仟瓦小時
  kvahTotal: string // 總購電 kVAh
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

  // 24-hour dual-series chart: 即時售電量 wobbles, 累計售電量 rises monotonically
  let cum = 21320
  const chart: ProfilePoint[] = Array.from({ length: 24 }, (_, i) => {
    const wobble = (rc() - 0.5) * 260
    const wave = Math.sin((i / 23) * Math.PI * 2) * 120
    const instant = Math.max(300, Math.round(560 + wobble + wave))
    cum += 2 + Math.round(rc() * 5) + (i > 14 ? Math.round(rc() * 5) : 0)
    return { t: `${pad(i + 1, 2)}:00`, instant, cumulative: cum }
  })

  const rr = mulberry32(seed ^ 0x5bd1e995)
  const rows: ProfileRow[] = Array.from({ length: 48 }, (_, i) => {
    const hh = 10 - Math.floor(i / 6)
    const mm = 30 - ((i * 5) % 60)
    const time = `2025-01-01 ${pad((hh + 24) % 24, 2)}:${pad((mm + 60) % 60, 2)}:00`
    const kwh = (4437.6 + Math.round(rr() * 40) / 10000).toFixed(4)
    return {
      rindex: 570 - i,
      dataTime: time,
      hesTime: time,
      mdmsTime: time,
      delay: 3200 + Math.round(rr() * 40),
      loadStatus: rr() < 0.35 ? 1 : 0,
      kwhTotal: kwh,
      kvahTotal: kwh,
    }
  })

  return { chart, rows }
}
