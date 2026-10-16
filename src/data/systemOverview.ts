import { TAIWAN } from '@/data/mockData'
import { round2 } from '@/lib/aggregate'

/**
 * 系統總覽資料層 —— 對齊《系統設計規格書_2_系統總覽_V0.9》。
 *
 * 這個檔案是「換成真 API 的唯一接縫」：底下每個 export 都對應規格書 §x.5 列的
 * 一支 API，欄位名稱刻意貼著 API 語意命名。要接後端時只換這裡，畫面元件不動。
 *
 *   meterTotal   ← GET /meters/statistics/enabled-count
 *   connection   ← GET /meters/statistics/connection
 *   lp           ← GET /meters/statistics/reading-success-lp
 *   mn           ← GET /meters/statistics/reading-success-mn
 *   alt          ← GET /meters/statistics/reading-success-alt
 *   events       ← GET /meters/statistics/{power-outage,disconnected,event}
 *   trends       ← GET /meters/statistics/{meter-count,connection-ratio,reading-success-ratio}
 *
 * 全部數值都是 deterministic mock（無亂數，重整結果相同），並以既有的
 * `TAIWAN` 全台 rollup 為基準推導，讓本頁數字與其他頁面對得起來。
 */

/* ---------- deterministic PRNG（與 mockData 同一套，避免跨檔耦合） ---------- */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
/**
 * 由字串取 0–1 的 deterministic 亂數。
 * 必須把 FNV 雜湊再過一次 mulberry32 混合 —— 直接拿 FNV 的值除以 2^32，
 * 只差最後一個字元的 key（trend:1o / trend:2o …）高位元幾乎相同，
 * 會讓七天的趨勢值全部擠在一起。與 mockData.ts 的做法一致。
 */
function rand01(key: string): number {
  let seed = hashStr(key) | 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ---------- 通訊模組 ---------- */
export type ModuleKey = 'RF' | 'LTE' | 'NB-IoT'
export const MODULES: ModuleKey[] = ['RF', 'LTE', 'NB-IoT']

/**
 * 模組佔比 —— 取自規格書參考畫面的示意值 (474,136 / 54,877 / 92,055 = 621,068)。
 * TODO: 正式版由 API 的 rf_count / lte_count / nb_count 提供。
 */
const MODULE_SHARE: Record<ModuleKey, number> = {
  RF: 474136 / 621068,
  LTE: 54877 / 621068,
  'NB-IoT': 92055 / 621068,
}

export interface ModuleStat {
  module: ModuleKey
  /** 該模組「啟用」電表數 */
  total: number
  /** 該模組成功數（連線數 / 讀表成功數） */
  success: number
  /** success / total (%) */
  rate: number
}

export interface RateBlock {
  /** 「啟用」電表總數 */
  total: number
  /** 成功數 */
  success: number
  /** success / total (%) */
  rate: number
  modules: ModuleStat[]
}

/** 各模組相對總體的落差 (百分點) —— RF 最佳、LTE 最差，比照規格書示意值的分佈 */
type Bias = Record<ModuleKey, number>

/**
 * 由「總體成功率」拆出三個模組的成功數。
 * 先加上模組落差，再整體平移使加權平均回到 targetRate，最後把整數化的餘數補回
 * RF —— 保證 `Σ modules.success === block.success`，畫面上加總對得起來。
 */
function makeRateBlock(counts: Record<ModuleKey, number>, targetRate: number, bias: Bias): RateBlock {
  const total = MODULES.reduce((s, m) => s + counts[m], 0)
  const weighted = MODULES.reduce((s, m) => s + (targetRate + bias[m]) * counts[m], 0) / (total || 1)
  const shift = targetRate - weighted

  const success: Record<ModuleKey, number> = { RF: 0, LTE: 0, 'NB-IoT': 0 }
  for (const m of MODULES) {
    const r = Math.min(99.99, Math.max(0, targetRate + bias[m] + shift))
    success[m] = Math.round((r / 100) * counts[m])
  }
  const targetSuccess = Math.round((targetRate / 100) * total)
  success.RF += targetSuccess - MODULES.reduce((s, m) => s + success[m], 0)

  return {
    total,
    success: targetSuccess,
    rate: round2((targetSuccess / (total || 1)) * 100),
    modules: MODULES.map((m) => ({
      module: m,
      total: counts[m],
      success: success[m],
      rate: round2((success[m] / (counts[m] || 1)) * 100),
    })),
  }
}

/* ---------- 時間基準 ---------- */
const NOW = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDateTime = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const fmtMMDD = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`

/** 連線判定視窗：台達每 60 分鐘彙整一次連線資料送 Kafka，故最小可用區間為 60 分鐘 */
export const CONNECT_WINDOW_MINUTES = 60

/** MN 判定時點：當日 00:00（當天第一筆電表讀值） */
export const MN_AT = (() => {
  const d = new Date(NOW)
  d.setHours(0, 0, 0, 0)
  return fmtDateTime(d)
})()

/**
 * ALT 判定時點：前一小時整點。
 * 不取當前整點是為了避開時間差 —— 例如 10:05 還沒收到 10:00 的 ALT，
 * 但其實再等一下就到了，直接看 09:00 才不會讓百分比失真。
 */
export const ALT_AT = (() => {
  const d = new Date(NOW)
  d.setHours(d.getHours() - 1, 0, 0, 0)
  return fmtDateTime(d)
})()

export const UPDATED_AT = fmtDateTime(NOW)

/* ---------- 區塊 1〜3：電表總數 / 連線 / 三大讀值 ---------- */
const M = TAIWAN.metrics

/** 狀態為「啟用」的電表總數 */
export const meterTotal = M.meterTotal

const MODULE_COUNTS: Record<ModuleKey, number> = (() => {
  const rf = Math.round(meterTotal * MODULE_SHARE.RF)
  const lte = Math.round(meterTotal * MODULE_SHARE.LTE)
  return { RF: rf, LTE: lte, 'NB-IoT': meterTotal - rf - lte }
})()

/** 60 分鐘連線數：時間內 online_info.online=1 的電表數 */
export const connection = makeRateBlock(MODULE_COUNTS, M.connectRate, { RF: 0.6, LTE: -3.2, 'NB-IoT': -1.1 })

/** 60 分鐘 LP 讀表成功數：時間內有收到 load_profile 的電表數 */
export const lp = makeRateBlock(MODULE_COUNTS, M.lpRate, { RF: 0.7, LTE: -3.8, 'NB-IoT': -1.2 })

/** 午夜讀表數 (MN)：有收到當日 00:00 mn_register 的電表數 */
export const mn = makeRateBlock(MODULE_COUNTS, M.midnightRate, { RF: 1.0, LTE: -5.0, 'NB-IoT': -2.0 })

/** 定時供電品質 (ALT)：有收到前一小時 alt_data 的電表數 */
export const alt = makeRateBlock(MODULE_COUNTS, M.altRate, { RF: 0, LTE: -4.0, 'NB-IoT': -1.0 })

/* ---------- 區塊 4：停電數 / 斷線數 / 事件數 ---------- */
export interface CountStat {
  /** 目前數量 */
  value: number
  /** 與前一天的差額 (signed) */
  deltaDay: number
}

/**
 * 停電數：由 device_last_event 的事件碼 14 (Primary Power Down) /
 * 15 (Primary Power Up) 判定 —— 只有 14 沒有 15，或 15 的時間早於 14。
 * TODO: 目前為 mock，正式版改讀 GET /meters/statistics/power-outage。
 */
const outageNow = Math.round(meterTotal * 0.0004 * (0.4 + rand01('outage') * 1.6))
/** 斷線數：online_info.online=0，即連線區塊的未連線數 */
const disconnectedNow = connection.total - connection.success
/** 事件數：截至目前為止今天收到的事件數量 */
const eventNow = M.eventCount

function withDayDelta(kind: string, value: number, scale: number): CountStat {
  return { value, deltaDay: Math.round(value * scale * (rand01(kind) * 2 - 1)) }
}

export const events = {
  outage: withDayDelta('outage-d', outageNow, 0.9),
  disconnected: withDayDelta('disc-d', disconnectedNow, 0.12),
  event: withDayDelta('event-d', eventNow, 0.25),
}

/* ---------- 區塊 5：過去 7 天趨勢 ---------- */
export interface TrendPoint {
  /** MM/DD */
  date: string
  /** 電表總數（當天 07:00 批次撈到的啟用數） */
  meterCount: number
  /** 連線率 % */
  connectRatio: number
  /** 讀表率 %（LP，一小時內收到即算成功） */
  readRatio: number
  /** 停電數 */
  outage: number
  /** 事件數 */
  event: number
}

/**
 * 過去 7 天（含今日）。歷史值無法回推，正式版由每日 07:00 批次寫入
 * daily_statistics，這裡以今日值加上 deterministic 擾動模擬。
 */
export const trends: TrendPoint[] = Array.from({ length: 7 }, (_, i) => {
  const back = 6 - i // 6 天前 → 今天
  const d = new Date(NOW)
  d.setDate(d.getDate() - back)
  const key = `trend:${back}`
  const j = (tag: string, amp: number) => (rand01(key + tag) * 2 - 1) * amp

  // 今天那一格直接用目前值，讓上方區塊與圖表最後一根對得起來
  if (back === 0) {
    return {
      date: fmtMMDD(d),
      meterCount: meterTotal,
      connectRatio: connection.rate,
      readRatio: lp.rate,
      outage: events.outage.value,
      event: events.event.value,
    }
  }
  return {
    date: fmtMMDD(d),
    meterCount: Math.round(meterTotal * (1 + j('m', 0.004))),
    connectRatio: round2(Math.min(99.9, connection.rate + j('c', 1.2))),
    readRatio: round2(Math.min(99.9, lp.rate + j('r', 1.4))),
    outage: Math.max(0, Math.round(events.outage.value * (1 + j('o', 1.5)))),
    event: Math.max(0, Math.round(eventNow * (1 + j('e', 0.12)))),
  }
})
