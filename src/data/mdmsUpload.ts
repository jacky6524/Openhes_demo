import { hashStr } from './readTasks'

/**
 * 讀表管理 · MDMS上拋的 mock 資料（設計稿「MDMS上拋-1／-2」）。
 * 每種資料類型依自己的更新週期切成時段（LP 15 分鐘、ALT／PQ 1 小時、MN／DRR 每天），
 * 每個時段有「已上拋／總數」。TODO: 上線改讀 MDMS 上拋統計 API。
 */
export const MDMS_TYPES = [
  { key: 'LP', label: '負載資料', title: 'LP負載資料', cadence: '每15分鐘更新', stepMin: 15, total: 806_000 },
  { key: 'ALT', label: '事件資料', title: 'ALT事件資料', cadence: '每1小時更新', stepMin: 60, total: 802_000 },
  { key: 'MN', label: '午夜資料', title: 'MN午夜資料', cadence: '每天更新', stepMin: 1440, total: 433_004 },
  { key: 'PQ', label: '定時供電品質資料', title: 'PQ定時供電品質資料', cadence: '每1小時更新', stepMin: 60, total: 120_000 },
  { key: 'DRR', label: '需量復歸報表', title: 'DRR需量復歸報表', cadence: '每天更新', stepMin: 1440, total: 38_000 },
] as const
export type MdmsKey = (typeof MDMS_TYPES)[number]['key']
export type MdmsType = (typeof MDMS_TYPES)[number]

/** 預設勾選：負載／事件／午夜 */
export const DEFAULT_MDMS_KEYS: MdmsKey[] = ['LP', 'ALT', 'MN']

/** 達成率低於此值算「注意」（紅字、趨勢圖紅帶） */
export const MDMS_ALERT = 90

/** Demo 的「現在」：最新那個時段還在上拋中，達成率偏低 */
const NOW = Date.UTC(2026, 0, 2, 15, 0)

export interface MdmsBucket {
  ts: number // UTC 分鐘數換成 ms，只拿來排序與格式化，不代表真實時區
  uploaded: number
  total: number
  pct: number
  inProgress: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DDTHH:mm'（datetime-local 的值）→ ms；空字串回 null */
export function parseLocal(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
}
export function fmtStamp(ts: number, withTime = true, sep = '-') {
  const d = new Date(ts)
  const date = `${d.getUTCFullYear()}${sep}${pad(d.getUTCMonth() + 1)}${sep}${pad(d.getUTCDate())}`
  return withTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date
}

const DAY = 86_400_000

/** 範圍內該類型所有時段，新→舊。每日類型只要當天與範圍重疊就算 */
export function buckets(type: MdmsType, from: number, to: number, scale: string): MdmsBucket[] {
  const step = type.stepMin * 60_000
  const first = type.stepMin >= 1440 ? Math.floor(from / DAY) * DAY : Math.ceil(from / step) * step
  const out: MdmsBucket[] = []
  for (let ts = first; ts <= to; ts += step) {
    const h = hashStr(`${type.key}|${ts}|${scale}`)
    const r = (h % 1000) / 1000
    const inProgress = (type.key === 'LP' || type.key === 'MN') && ts <= NOW && ts > NOW - step
    // 約每 11 個時段有一個掉到注意線下；進行中的時段才剛開始上拋
    const pct = inProgress ? 18 + r * 30 : h % 11 === 0 ? 84 + r * 5.9 : 90.5 + r * 9.4
    // 指定表號／電號／群組時，總數縮成那一小撮電表
    const total = scale ? 10 + (h % 90) : type.total + (h % 3000)
    out.push({ ts, uploaded: Math.round((total * pct) / 100), total, pct: Math.round(pct * 100) / 100, inProgress })
  }
  return out.reverse()
}
