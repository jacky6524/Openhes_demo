/**
 * 頻道規劃資料 —— 2026-11-11 業主提供「頻點資料.png」（1111調整內容/），照抄。
 *
 * 一列＝一組 HES 設定：CCM1／頻點1 為主頻道，CCM2／頻點2 為副頻道（s 開頭的單頻設定沒有副頻道）。
 * 業主表上另有案別（FET-2／FET-4／FET-5），FET-4 與 FET-5 的 O～S、sO～sS 頻點完全相同。
 *
 * 分類＝**廠商**（2026-11-11 業主：維持原本的廠商分類，不要以案別分）。
 * 業主的頻點表沒有廠商欄，HES 設定 → 廠商 的對照是 **mock**（vendorOf），待業主提供後改這裡即可。
 *
 * 頻道與頻率的換算（由表推得，不是業主給的）：
 *   FET-2：頻點 = 839.92 + 0.2 × CCM（CCM 0 = 839.92）
 *   FET-4／5：頻點 = 840.1 + 0.1 × CCM（CCM 12 = 841.3）
 * 原始表中 **FET-4、FET-5 的 sR：CCM1 = 24、頻點1 = 841.5**，但同表 R 的 CCM1 24 是 842.5，換算也應是 842.5，
 * 判斷原始表筆誤；這裡保留原值、以 `suspect` 標記，畫面上提示待確認，不擅自更正。
 */
export const CASES = ['FET-2', 'FET-4', 'FET-5'] as const
export type CaseId = (typeof CASES)[number]

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

/** HES 設定 → 廠商（**mock**，業主頻點表沒有廠商欄；待業主提供對照後改這裡） */
function vendorOf(caseId: CaseId, hes: string): Vendor {
  if (caseId === 'FET-2') return 'ABCD'.includes(hes) ? 'SGCM' : 'ELSTER'
  return caseId === 'FET-4' ? 'HEXING' : 'DELTA'
}

export interface ChannelRow {
  vendor: Vendor
  caseId: CaseId
  hes: string // HES設定
  ccm1: number
  f1: number // 頻點1（MHz）
  ccm2: number | null
  f2: number | null
  /** 頻點與 CCM 換算對不上的欄位（原始資料疑似筆誤） */
  suspect?: { field: 'f1' | 'f2'; expected: number }
}

type Seed = [string, number, number, number | null, number | null]

const FET2: Seed[] = [
  ['A', 7, 841.32, 3, 840.52],
  ['B', 6, 841.12, 2, 840.32],
  ['C', 5, 840.92, 1, 840.12],
  ['D', 4, 840.72, 0, 839.92],
  ['E', 8, 841.52, 12, 842.32],
  ['F', 9, 841.72, 13, 842.52],
  ['G', 10, 841.92, 14, 842.72],
  ['H', 11, 842.12, 15, 842.92],
]
const FET45: Seed[] = [
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
]

const expected = (c: CaseId, ccm: number) => Math.round((c === 'FET-2' ? 839.92 + 0.2 * ccm : 840.1 + 0.1 * ccm) * 100) / 100

const toRows = (caseId: CaseId, seeds: Seed[]): ChannelRow[] =>
  seeds.map(([hes, ccm1, f1, ccm2, f2]) => {
    const row: ChannelRow = { vendor: vendorOf(caseId, hes), caseId, hes, ccm1, f1, ccm2, f2 }
    if (expected(caseId, ccm1) !== f1) row.suspect = { field: 'f1', expected: expected(caseId, ccm1) }
    else if (ccm2 !== null && f2 !== null && expected(caseId, ccm2) !== f2) row.suspect = { field: 'f2', expected: expected(caseId, ccm2) }
    return row
  })

/** 依廠商順序排（表格預設順序＝頻譜圖由上而下的順序） */
export const CHANNEL_ROWS: ChannelRow[] = [
  ...toRows('FET-2', FET2),
  ...toRows('FET-4', FET45),
  ...toRows('FET-5', FET45),
].sort((a, b) => VENDORS.indexOf(a.vendor) - VENDORS.indexOf(b.vendor))

/** 頻譜圖整體範圍（縮到最小時看到的範圍） */
export const SPECTRUM_MIN = 839
export const SPECTRUM_MAX = 847
/** 頻譜圖色塊寬度（MHz）：兩案別的相鄰頻點皆相距 0.2 MHz，色塊畫 0.2 寬剛好相接 */
export const BLOCK_MHZ = 0.2

/** 表格列／頻譜圖互相對應用的鍵 */
export const rowKey = (r: ChannelRow) => `${r.caseId}:${r.hes}`
