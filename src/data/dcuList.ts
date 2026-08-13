/* Deterministic mock DCU fleet for the 裝置管理 · DCU 裝置列表 demo screen. */

export type DcuStatus = 'online' | 'offline' // 連線 / 斷線

export interface DcuRow {
  status: DcuStatus
  model: string // DCU 型號
  serial: string // DCU 編號
  online: number // 上線數
  total: number // 總數
  read: number // 讀表數
  percent: number // 讀表百分比
  alarms: number // 告警數(角標)
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

function pad(n: number, w: number) {
  return String(n).padStart(w, '0')
}

/** 100 rows → 10 pages at 10/頁, matching the reference pager (1…10) */
export const DCU_ROWS: DcuRow[] = Array.from({ length: 100 }, (_, i) => {
  const r = mulberry32(0x9e37 + i * 2654435761)
  const status: DcuStatus = r() < 0.06 ? 'offline' : 'online'
  const total = 90 + Math.floor(r() * 40) // 90–129
  const online = status === 'online' ? total - Math.floor(r() * 3) : Math.max(0, total - Math.floor(12 + r() * 40))

  const tier = r()
  let percent: number
  if (tier < 0.06) percent = 30 + Math.floor(r() * 19) // <50 → 紅
  else if (tier < 0.16) percent = 55 + Math.floor(r() * 25) // 50–80 → 橙
  else percent = 85 + Math.floor(r() * 16) // 良好
  percent = Math.min(100, percent)

  const read = Math.round(online * (0.72 + r() * 0.28))
  const modelHex = (0x1000 + Math.floor(r() * 0xefff)).toString(16).toUpperCase()
  const serial = `B${6000 + Math.floor(r() * 3999)}AA${10 + Math.floor(r() * 89)}-${1 + Math.floor(r() * 9)}`
  const alarms = status === 'offline' || percent < 50 ? 1 : 0

  return {
    status,
    model: `AE${modelHex}D${pad(i % 100, 4)}`,
    serial,
    online,
    total,
    read,
    percent,
    alarms,
  }
})

/** fleet summary shown in the list header */
export const DCU_SUMMARY = {
  online: DCU_ROWS.filter((d) => d.status === 'online').length,
  total: DCU_ROWS.length,
}
