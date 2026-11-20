import { hashStr } from './readTasks'
import { MDMS_DATA_TYPES, type MdmsTypeKey } from './readDataTypes'

/**
 * 讀表管理 · MDMS上拋的 mock 資料（設計稿「MDMS上拋-1／-2」）。
 * 每種資料類型依自己的更新週期切成時段（LP 15 分鐘、ALT 等 1 小時、MN／DRR 每天），
 * 每個時段有「已上拋／總數」。TODO: 上線改讀 MDMS 上拋統計 API。
 *
 * 2026-11-04 業主意見：資料類型改成單選下拉，並「以後端資料為準」——後端上拋紀錄
 * （GET /api/p6xml/upload/status）只有 MeterReadings 的 lp／alt／mn 與 EndDeviceEvents（事件），
 * 所以只列這 4 種（定義在 data/readDataTypes.ts）。原本的 PQ、DRR 拿掉；原本把 ALT 標成「事件資料」也已改正。
 */
export type MdmsKey = MdmsTypeKey
/**
 * MDMS上拋頁的顯示順序（卡片、下拉、趨勢頁籤）：2026-11-17 業主要求負載(LP)排在午夜(MN)前面。
 * 只動這一頁；共用清單 READ_DATA_TYPES 維持業主原清單順序（即時讀表仍是 午夜→負載）。
 */
const MDMS_ORDER: MdmsKey[] = ['LP', 'MN', 'ALT', 'event']
export const MDMS_TYPES = [...MDMS_DATA_TYPES].sort((a, b) => MDMS_ORDER.indexOf(a.key) - MDMS_ORDER.indexOf(b.key))
export type MdmsType = (typeof MDMS_DATA_TYPES)[number]

/** 預設勾選：負載／定時供電品質／午夜（同改版前的預設） */
export const DEFAULT_MDMS_KEYS: MdmsKey[] = ['LP', 'MN', 'ALT']

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
export function fmtStamp(ts: number, withTime = true, sep = '/') {
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

/* ───────────── 2026-11-19 Dashboard（LP／MN／ALT 三色、整點查詢） ───────────── */

/** Dashboard 只看 MeterReadings 三種；事件（EndDeviceEvents）只在右側「上拋操作」可選 */
export type DashKey = 'LP' | 'MN' | 'ALT'
export const DASH_KEYS: DashKey[] = ['LP', 'MN', 'ALT']

/**
 * 三種資料的識別色 —— 2026-11-19 業主：**與告警無關**，純粹區分類型（不再因達成率低轉紅）。
 * 參考圖：LP 藍紫、MN 青、ALT 粉；刻意避開告警紅／黃／綠。tint＝卡片底色。
 */
export const DASH_COLOR: Record<DashKey, { line: string; tint: string; bar: string }> = {
  LP: { line: '#5B5BD6', tint: '#F2F2FD', bar: '#C9C9F2' },
  MN: { line: '#1A9FC4', tint: '#EAF6FA', bar: '#B5DFEC' },
  ALT: { line: '#D9588F', tint: '#FCEFF5', bar: '#F1C3D7' },
}
/** 各類型在 dashboard 上的點距與說明（MN 為「當天午夜資料的累積上拋率」，每小時一點） */
export const DASH_CADENCE: Record<DashKey, { stepMin: number; text: string }> = {
  LP: { stepMin: 15, text: '每15分鐘更新' },
  MN: { stepMin: 60, text: '每1小時更新（當日午夜資料累積上拋率）' },
  ALT: { stepMin: 60, text: '每1小時更新' },
}

export interface DashPoint extends MdmsBucket {
  missing: number // 缺值＝總數－已上拋
}

/**
 * 區間內該類型的點，舊→新。LP／ALT 沿用 buckets()；
 * MN 一天只有一批（午夜資料），dashboard 改畫「當天午夜資料到每個整點為止的累積上拋率」：
 * 凌晨開始上拋、上午爬到 97～99%。mock。
 */
export function dashPoints(key: DashKey, from: number, to: number, scale: string): DashPoint[] {
  const type = MDMS_TYPES.find((t) => t.key === key)!
  let rows: MdmsBucket[]
  if (key !== 'MN') {
    rows = buckets(type, from, to, scale).reverse()
  } else {
    rows = []
    const H = 3_600_000
    for (let ts = Math.ceil(from / H) * H; ts <= to; ts += H) {
      const day = Math.floor(ts / DAY) * DAY
      const hd = hashStr(`MN|${day}|${scale}`)
      const total = scale ? 10 + (hd % 90) : type.total + (hd % 3000)
      const hours = (ts - day) / H
      const noise = ((hashStr(`MN|${ts}|${scale}`) % 1000) / 1000 - 0.5) * 1.2
      const pct = hours === 0 ? 0 : Math.min(99.6, 99.2 - 55 * Math.exp(-hours / 2.2) + noise)
      const p = Math.max(0, Math.round(pct * 100) / 100)
      rows.push({ ts, uploaded: Math.round((total * p) / 100), total, pct: p, inProgress: false })
    }
  }
  return rows.map((r) => ({ ...r, missing: r.total - r.uploaded }))
}
