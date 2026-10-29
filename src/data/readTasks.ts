import { METER_LIST_ROWS } from './dcuListPage'

/**
 * 讀表管理 · 即時讀表的 mock 資料（設計稿「即時讀表-1／-2」）。
 * 一筆＝一次 on-demand 讀表任務；點開看該任務涵蓋的每顆電表有沒有回報。
 * TODO: 上線改讀 OpenHES 的 on-demand task API，這個檔案整個換掉即可。
 */
export interface ReadTask {
  no: number
  instanceId: string
  note: string // 讀表備註
  dataType: '午夜資料' | '負載資料'
  typeKey: 'midnight' | 'load_profile' // 彈窗標題列顯示的原始值
  readStart: string
  readEnd: string
  dataStart: string
  dataEnd: string
  overdue: number // 設定逾期時間（分鐘）
  doneAt: string // 讀取完成時間
  replied: number // 已回報電表數
  total: number // 讀表數
  group: string
}

export interface TaskMeter {
  elecNo: string
  meterNo: string
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

export const READ_TASKS: ReadTask[] = Array.from({ length: 349 }, (_, i) => {
  const n = i + 1
  const h = hashStr(`task${n}`)
  const day = pad(1 + (i % 14))
  const dataType = i % 3 === 2 ? '負載資料' : '午夜資料'
  const total = TOTALS[h % TOTALS.length]
  const complete = h % 4 === 0
  const start = `2025-01-${day} ${pad(8 + ((i * 3) % 12))}:${pad((i % 4) * 15)}:00`
  const end = `2025-01-${day} ${pad(10 + ((i * 3) % 12))}:${pad((i % 4) * 15)}:00`
  const midnight = dataType === '午夜資料'
  return {
    no: n,
    instanceId: `${hex(h, 8)}-${hex(h + 1, 4)}-4${hex(h + 2, 3)}-${hex(h + 3, 4)}-${hex(h + 4, 12)}`,
    note: NOTES[i % 2],
    dataType,
    typeKey: midnight ? 'midnight' : 'load_profile',
    readStart: start,
    readEnd: end,
    dataStart: midnight ? `2025-01-${day} 00:00:00` : start,
    dataEnd: midnight ? `2025-01-${day} 00:00:00` : end,
    overdue: [10, 20, 30][h % 3],
    doneAt: end,
    replied: complete ? total : (h >> 3) % total,
    total,
    group: `G${1 + (h % 5)}`,
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
    return { elecNo: m.elecNo, meterNo: m.meterNo, replied: (idx * 7 + t.no) % t.total < t.replied }
  })
  meterCache.set(t.no, out)
  return out
}

/** 已回報電表的讀值（右側面板）：午夜資料一筆，負載資料四筆（每 15 分鐘） */
export function meterReadings(t: ReadTask, m: TaskMeter): Array<[string, string]> {
  const base = 1000 + (hashStr(m.meterNo) % 9000)
  const [date, time] = t.dataStart.split(' ')
  if (t.typeKey === 'midnight') return [[`${date} ${time}`, `${base}.${pad(hashStr(m.meterNo) % 100)}`]]
  const [hh, mm] = time.split(':').map(Number)
  return Array.from({ length: 4 }, (_, k) => {
    const total = hh * 60 + mm + k * 15
    return [`${date} ${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}:00`, `${(base + k * 0.37).toFixed(2)}`]
  })
}
