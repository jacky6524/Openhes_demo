import { METER_LIST_ROWS } from './dcuListPage'
import { dataTypeOf, COMMON_ITEMS, type OdrKey } from './readDataTypes'

/**
 * 讀表管理 · 即時讀表的 mock 資料（設計稿「即時讀表-1／-2」）。
 * 一筆＝一次 on-demand 讀表任務；點開看該任務涵蓋的每顆電表有沒有回報。
 * TODO: 上線改讀 OpenHES 的 on-demand task API，這個檔案整個換掉即可。
 * 2026-11-04：資料類型擴成 7 種（data/readDataTypes.ts），任務依序號分配，MN／LP 最多。
 */
export interface ReadTask {
  no: number
  instanceId: string
  note: string // 讀表備註
  dataType: OdrKey // 只會是後端 demand-types 有的 6 種；顯示名稱用 dataTypeOf(key).label，彈窗標題列顯示 .odr
  readStart: string
  readEnd: string
  dataStart: string
  dataEnd: string
  overdue: number // 設定逾期時間（分鐘）
  doneAt: string // 讀取完成時間
  replied: number // 已回報電表數
  total: number // 讀表數
}

export interface TaskMeter {
  elecNo: string
  meterNo: string
  dcuSerial: string // 所屬 DCU 序號（群組篩選用；沒有 DCU 為 ''）
  replied: boolean
}

export const hashStr = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const hex = (seed: number, len: number) => {
  let out = ''
  let h = seed
  while (out.length < len) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}

const TOTALS = [10, 10, 20, 10, 30]
const NOTES = ['自動補值MN', '平台補值LP']

/** 每 10 筆任務：MN×4、LP×3、ALT、DRR 各 1，第 10 筆輪流 common／del_total_kwh（後端 demand-types 沒有事件資料） */
function typeOfTask(i: number): OdrKey {
  const k = i % 10
  if (k < 4) return 'MN'
  if (k < 7) return 'LP'
  if (k === 7) return 'ALT'
  if (k === 8) return 'DRR'
  return (['common', 'del_total_kwh'] as const)[Math.floor(i / 10) % 2]
}
/** 時間點型的資料（午夜、需量復歸、即時暫存器）資料開始＝結束；區間型（LP、ALT、事件）跟讀取時間一樣 */
const POINT_TYPES: OdrKey[] = ['MN', 'DRR', 'common', 'del_total_kwh']

export const READ_TASKS: ReadTask[] = Array.from({ length: 349 }, (_, i) => {
  const n = i + 1
  const h = hashStr(`task${n}`)
  const day = pad(1 + (i % 14))
  const dataType = typeOfTask(i)
  const total = TOTALS[h % TOTALS.length]
  const complete = h % 4 === 0
  const start = `2025-01-${day} ${pad(8 + ((i * 3) % 12))}:${pad((i % 4) * 15)}:00`
  const end = `2025-01-${day} ${pad(10 + ((i * 3) % 12))}:${pad((i % 4) * 15)}:00`
  const point = POINT_TYPES.includes(dataType)
  const pointAt = dataType === 'MN' || dataType === 'DRR' ? `2025-01-${day} 00:00:00` : start
  return {
    no: n,
    instanceId: `${hex(h, 8)}-${hex(h + 1, 4)}-4${hex(h + 2, 3)}-${hex(h + 3, 4)}-${hex(h + 4, 12)}`,
    note: NOTES[i % 2],
    dataType,
    readStart: start,
    readEnd: end,
    dataStart: point ? pointAt : start,
    dataEnd: point ? pointAt : end,
    overdue: [10, 20, 30][h % 3],
    doneAt: end,
    replied: complete ? total : (h >> 3) % total,
    total,
  }
})

const meterCache = new Map<number, TaskMeter[]>()
/** 任務涵蓋的電表（取自電表清單，依任務序號錯開起點）；回報與否讓已回報數剛好等於 task.replied */
export function taskMeters(t: ReadTask): TaskMeter[] {
  const hit = meterCache.get(t.no)
  if (hit) return hit
  // 7 與 10／20／30 互質，(idx*7+no)%total 會走遍 0..total-1，< replied 的剛好 replied 個
  const out = Array.from({ length: t.total }, (_, idx) => {
    const m = METER_LIST_ROWS[(t.no * 7 + idx) % METER_LIST_ROWS.length]
    return { elecNo: m.elecNo, meterNo: m.meterNo, dcuSerial: m.dcuSerial, replied: (idx * 7 + t.no) % t.total < t.replied }
  })
  meterCache.set(t.no, out)
  return out
}

/**
 * 已回報電表的讀值（ondemand 讀取結果右表）：筆數依類型（READ_DATA_TYPES.perRead），值的意義也依類型：
 *   MN／LP／del_total_kwh＝累積電量 kWh，ALT＝電壓 V，DRR＝最大需量 kW，
 *   common＝後端 dataItems 的 7 個項目各一筆（值欄寫「項目名 值 單位」）。
 * 時間為 'YYYY-MM-DD HH:mm:ss'（與任務時間同格式；畫面上用 fmtDate 轉成斜線）。
 */
export function meterReadings(t: ReadTask, m: TaskMeter): Array<[string, string]> {
  const h = hashStr(m.meterNo)
  const base = 1000 + (h % 9000)
  const [date, time] = t.dataStart.split(' ')
  const [hh, mm] = time.split(':').map(Number)
  const n = dataTypeOf(t.dataType).perRead
  const step = t.dataType === 'ALT' ? 60 : t.dataType === 'LP' ? 15 : 0 // ALT 每小時一筆、LP 每 15 分；其餘同一時間點
  return Array.from({ length: n }, (_, k) => {
    const total = hh * 60 + mm + k * step
    const at = `${date} ${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}:00`
    switch (t.dataType) {
      case 'ALT': return [at, (218 + ((h >> k) % 50) / 10).toFixed(1)]
      case 'DRR': return [at, (3 + (h % 400) / 100).toFixed(2)]
      case 'common': {
        const it = COMMON_ITEMS[k]
        const v = it.name === 'hz' ? (59.9 + (h % 20) / 100).toFixed(2) : it.name === 'inst_kva' ? (1 + (h % 500) / 100).toFixed(2)
          : it.name.includes('demand') ? (3 + (h % 400) / 100).toFixed(2) : `${base + k * 13}.${pad(h % 100)}`
        return [at, `${it.name} ${v} ${it.unit}`]
      }
      case 'LP': return [at, (base + k * 0.37).toFixed(2)]
      default: return [at, `${base}.${pad(h % 100)}`]
    }
  })
}
