/*
 * DCU詳細資料的「連線資料」與「事件資料」兩個分頁的 mock 資料
 * （Figma 3639:25566 連線資料、3639:24343 事件資料）。
 *
 * 欄位一律照 Figma：
 *   連線資料 —— 資料時間 / 連線狀態 / Cell ID / 連線回報數
 *   事件資料 —— rindex / 資料時間 / HES接收時間 / 事件碼 / 說明
 *
 * 全部依 DCU 序號決定亂數種子，同一台 DCU 每次開啟數值一致。
 * TODO: 上線改接 API；事件碼→說明的對照表也應由後端提供。
 */

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

/** 查詢區間迄日 —— 與電表詳細資料的資料時間同一組（2025-01-01 ～ 2025-01-07） */
export const LOG_RANGE = { from: '2025-01-01', to: '2025-01-07', days: 7 }

/** 第 i 筆的時間戳（由新到舊，每筆間隔 minutes 分鐘），格式 YYYY-MM-DD HH:mm:ss */
function stamp(i: number, minutes: number) {
  const end = Date.UTC(2025, 0, 7, 10, 30)
  const d = new Date(end - i * minutes * 60_000)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`
  )
}

const ROWS = 120

/* ------------------------------------------------------------ 連線資料 */

export interface DcuConnRow {
  dataTime: string
  /** 連線狀態：連線 / 斷線 */
  online: boolean
  cellId: string
  /** 連線回報數 */
  reportCount: number
}

/** 一台 DCU 的連線紀錄（每 30 分鐘一筆，由新到舊） */
export function dcuConnRows(dcuId: string): DcuConnRow[] {
  const r = mulberry32(hash(dcuId) ^ 0x43_4f_4e_4e)
  // Cell ID 一段時間才換一次，不是每筆都不同
  let cell = 20010000 + Math.floor(r() * 9999)
  return Array.from({ length: ROWS }, (_, i) => {
    if (r() < 0.08) cell = 20010000 + Math.floor(r() * 9999)
    const online = r() > 0.12
    return {
      dataTime: stamp(i, 30),
      online,
      cellId: String(cell),
      // 斷線那筆沒有回報；連線時多數為 0，偶爾有重送
      reportCount: online ? (r() < 0.18 ? 1 + Math.floor(r() * 3) : 0) : 0,
    }
  })
}

/* ------------------------------------------------------------ 事件資料 */

export interface DcuEventRow {
  rindex: number
  dataTime: string
  hesTime: string
  code: string
  desc: string
}

/**
 * 事件碼 → 說明（mock）。Figma 上多數列的說明是「----」，
 * 代表該事件碼查不到對應說明文字，這裡保留同樣的呈現。
 */
const EVENT_CODES: { code: string; desc: string }[] = [
  { code: '20010420', desc: '----' },
  { code: '20010421', desc: 'DCU 斷線' },
  { code: '20010422', desc: 'DCU 復線' },
  { code: '20010430', desc: 'DCU 重新啟動' },
  { code: '20010431', desc: '韌體更新完成' },
  { code: '20010440', desc: 'FAN 模組異常' },
  { code: '20010441', desc: 'FAN 模組恢復' },
  { code: '20010450', desc: '電表註冊' },
  { code: '20010451', desc: '電表離線' },
  { code: '20010460', desc: '----' },
]

/** 一台 DCU 的事件紀錄（由新到舊） */
export function dcuEventRows(dcuId: string): DcuEventRow[] {
  const r = mulberry32(hash(dcuId) ^ 0x45_56_4e_54)
  return Array.from({ length: ROWS }, (_, i) => {
    const time = stamp(i, 15)
    const e = EVENT_CODES[Math.floor(r() * EVENT_CODES.length)]
    return {
      // rindex 由新到舊遞減，與電表事件資料的呈現一致
      rindex: ROWS - i,
      dataTime: time,
      // HES 接收時間比資料時間晚幾秒
      hesTime: stamp(i, 15).replace(/:\d\d$/, ':' + pad(Math.floor(r() * 50) + 5, 2)),
      code: e.code,
      desc: e.desc,
    }
  })
}
