/**
 * 頻道規劃資料。
 *
 * 一列＝一組 HES 設定：Channel1／頻點1 為主頻道，Channel2／頻點2 為副頻道（s 開頭的單頻設定沒有副頻道）。
 *
 * 2026-11-11 業主提供「頻點資料.png」（1111調整內容/）—— 照抄，2026-11-19 確認那張表是 **DELTA（台達）** 的：
 *   · FET-2 → DELTA(二案)；FET-4、FET-5 頻點完全相同 → 合成一列 DELTA(四五案)
 *   · 頻點與 Channel 的換算（由表推得，不是業主給的）：
 *       FET-2：頻點 = 839.92 + 0.2 × Channel（Channel 0 = 839.92）
 *       FET-4／5：頻點 = 840.1 + 0.1 × Channel（Channel 12 = 841.3）
 *   · 原始表中 FET-4、FET-5 的 sR：Channel1 = 24、頻點1 = 841.5，但同表 R 的 Channel1 24 是 842.5，
 *     換算也應是 842.5，判斷原始表筆誤；保留原值、以 `suspect` 標記，畫面上提示待確認，不擅自更正。
 * SGCM／ELSTER／HEXING 業主沒給頻點，**整段是 mock**（2026-11-19 業主：其他廠也要有案別，用假資料即可）。
 *
 * 頻譜圖一列＝一個 Lane：台達依案別分兩列，其他廠商一列。
 */

/** 廠商（模組型號頁與頻道規劃共用） */
export const VENDORS = ['SGCM', 'ELSTER', 'HEXING', 'DELTA'] as const
export type Vendor = (typeof VENDORS)[number]

/** 廠商識別色（頻譜圖色塊、表格廠商色點）。刻意避開告警紅／黃／綠，不跟健康狀態混淆 */
export const VENDOR_COLOR: Record<Vendor, string> = {
  SGCM: '#2F6BED',
  ELSTER: '#0E9B9B',
  HEXING: '#8B5CF6',
  DELTA: '#EA8C00',
}

/** 頻譜圖的列（也是表格篩選的選項），由上而下的順序 */
export const LANES = ['SGCM', 'ELSTER', 'HEXING', 'DELTA(二案)', 'DELTA(四五案)'] as const
export type Lane = (typeof LANES)[number]
export const LANE_VENDOR: Record<Lane, Vendor> = {
  SGCM: 'SGCM',
  ELSTER: 'ELSTER',
  HEXING: 'HEXING',
  'DELTA(二案)': 'DELTA',
  'DELTA(四五案)': 'DELTA',
}
export const laneColor = (l: Lane) => VENDOR_COLOR[LANE_VENDOR[l]]

export interface ChannelRow {
  lane: Lane
  vendor: Vendor
  /** 案別（DELTA 四五案是兩案共用同一組設定） */
  cases: string[]
  hes: string // HES設定
  ch1: number
  f1: number // 頻點1（MHz）
  ch2: number | null
  f2: number | null
  /** 頻點與 Channel 換算對不上的欄位（原始資料疑似筆誤） */
  suspect?: { field: 'f1' | 'f2'; expected: number }
}

type Seed = [hes: string, ch1: number, f1: number | null, ch2: number | null, f2: number | null]
interface Group { lane: Lane; cases: string[]; base: number; step: number; seeds: Seed[] }

const GROUPS: Group[] = [
  // ── mock ──（f 給 null＝依換算公式產生）
  {
    lane: 'SGCM', cases: ['FET-1'], base: 842.9, step: 0.2,
    seeds: [['A', 1, null, 5, null], ['B', 2, null, 6, null], ['C', 3, null, 7, null], ['D', 4, null, 8, null]],
  },
  {
    lane: 'ELSTER', cases: ['FET-3'], base: 843.6, step: 0.1,
    seeds: [['J', 6, null, 12, null], ['K', 8, null, 14, null], ['L', 10, null, 16, null], ['sJ', 6, null, null, null], ['sK', 8, null, null, null]],
  },
  {
    lane: 'HEXING', cases: ['FET-5'], base: 844.9, step: 0.2,
    seeds: [['X', 2, null, 6, null], ['Y', 3, null, 7, null], ['sX', 2, null, null, null]],
  },
  // ── 業主頻點表（照抄） ──
  {
    lane: 'DELTA(二案)', cases: ['FET-2'], base: 839.92, step: 0.2,
    seeds: [
      ['A', 7, 841.32, 3, 840.52],
      ['B', 6, 841.12, 2, 840.32],
      ['C', 5, 840.92, 1, 840.12],
      ['D', 4, 840.72, 0, 839.92],
      ['E', 8, 841.52, 12, 842.32],
      ['F', 9, 841.72, 13, 842.52],
      ['G', 10, 841.92, 14, 842.72],
      ['H', 11, 842.12, 15, 842.92],
    ],
  },
  {
    lane: 'DELTA(四五案)', cases: ['FET-4', 'FET-5'], base: 840.1, step: 0.1,
    seeds: [
      ['O', 12, 841.3, 26, 842.7],
      ['P', 16, 841.7, 22, 842.3],
      ['Q', 20, 842.1, 18, 841.9],
      ['R', 24, 842.5, 14, 841.5],
      ['S', 28, 842.9, 10, 841.1],
      ['sO', 12, 841.3, null, null],
      ['sP', 16, 841.7, null, null],
      ['sQ', 20, 842.1, null, null],
      ['sR', 24, 841.5, null, null], // ← 原始表如此，換算應為 842.5
      ['sS', 28, 842.9, null, null],
    ],
  },
]

const r2 = (v: number) => Math.round(v * 100) / 100

/** 依廠商順序排（表格預設順序＝頻譜圖由上而下的順序） */
export const CHANNEL_ROWS: ChannelRow[] = GROUPS.flatMap(({ lane, cases, base, step, seeds }) =>
  seeds.map(([hes, ch1, f1in, ch2, f2in]) => {
    const exp = (ch: number) => r2(base + step * ch)
    const f1 = f1in ?? exp(ch1)
    const f2 = ch2 === null ? null : (f2in ?? exp(ch2))
    const row: ChannelRow = { lane, vendor: LANE_VENDOR[lane], cases, hes, ch1, f1, ch2, f2 }
    if (exp(ch1) !== f1) row.suspect = { field: 'f1', expected: exp(ch1) }
    else if (ch2 !== null && f2 !== null && exp(ch2) !== f2) row.suspect = { field: 'f2', expected: exp(ch2) }
    return row
  }),
)

/** 頻譜圖整體範圍（縮到最小時看到的範圍） */
export const SPECTRUM_MIN = 839
export const SPECTRUM_MAX = 847
/** 頻譜圖色塊寬度（MHz）：兩案別的相鄰頻點皆相距 0.2 MHz，色塊畫 0.2 寬剛好相接 */
export const BLOCK_MHZ = 0.2

/** 表格列／頻譜圖互相對應用的鍵（＝一組 HES 設定；點選時框出的「組別」） */
export const rowKey = (r: Pick<ChannelRow, 'lane' | 'hes'>) => `${r.lane}|${r.hes}`
