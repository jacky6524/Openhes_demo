import { useMemo, useState } from 'react'
import { Th, Pagination } from '@/components/table/tableBits'

/**
 * 裝置模組 (Figma 4253:31308，3 張主畫面欄寬不同、版型相同)。
 *
 * 目前只依第一張做：廠商下拉＋四欄表（系列／模組上拋型號／顯示型號／通訊技術）＋分頁。
 * 另外兩張（4253:31316 四欄、4255:32771 三欄）還沒讀，欄位名稱待確認。
 * 資料全為 mock。
 */
interface ModuleRow {
  vendor: string
  series: string
  uploadModel: string // 模組上拋型號
  displayModel: string // 顯示型號
  comm: 'RF' | 'PLC' | 'NB-IoT' | 'LTE'
}

const VENDORS = ['SGCM', 'ELSTER', 'HEXING'] as const

const SEED: Array<[ModuleRow['vendor'], string, string, ModuleRow['comm']]> = [
  ['SGCM', 'SGDC-A14TF', 'SGCM-DCU', 'RF'],
  ['SGCM', 'SGDC-A14TF', 'SGCM-W15-TFB', 'RF'],
  ['SGCM', 'SGDC-A14TF', 'SGCM-W61-TFB', 'RF'],
  ['SGCM', 'SGDC-B22NB', 'SGCM-N71-NBF', 'NB-IoT'],
  ['SGCM', 'SGDC-C31LT', 'SGCM-L51-LTF', 'LTE'],
  ['ELSTER', 'EL-R100', 'EL-R100-RF', 'RF'],
  ['ELSTER', 'EL-P200', 'EL-P200-PLC', 'PLC'],
  ['HEXING', 'HX-N300', 'HX-N300-NB', 'NB-IoT'],
  ['HEXING', 'HX-R110', 'HX-R110-RF', 'RF'],
]

/** 湊滿 42 列，讓分頁看得到（設計稿為 10 頁 × 10 條） */
const ROWS: ModuleRow[] = Array.from({ length: 42 }, (_, i) => {
  const [vendor, series, uploadModel, comm] = SEED[i % SEED.length]
  const rev = Math.floor(i / SEED.length)
  return {
    vendor, series, comm,
    uploadModel: rev ? `${uploadModel}-${rev}` : uploadModel,
    displayModel: rev ? `${series}-${rev}` : series,
  }
})

const ALL = 'ALL'
const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand'
/** 表頭釘住、表格自己捲（業主 2026-08-27 定調的表格標準） */
const SCROLL_BOX = 'max-h-[calc(100vh-290px)] overflow-auto'
const STICKY_TH = 'sticky top-0 z-10 bg-inset'

export function DeviceModule() {
  const [vendor, setVendor] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const rows = useMemo(() => ROWS.filter((r) => vendor === ALL || r.vendor === vendor), [vendor])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <label className="flex flex-col gap-1 w-[144px]">
        <span className="px-2 text-[12px] text-ink-sub">廠商</span>
        <select value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1) }} className={BOX}>
          <option value={ALL}>ALL</option>
          {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>

      <div className="rounded-card bg-surface border border-border shadow-card pb-3">
        <div className={SCROLL_BOX}>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                <Th className={STICKY_TH}>系列</Th>
                <Th className={STICKY_TH}>模組上拋型號</Th>
                <Th className={STICKY_TH}>顯示型號</Th>
                <Th className={STICKY_TH}>通訊技術</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={`${r.uploadModel}-${i}`} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-3 text-ink">{r.series}</td>
                  <td className="px-3 py-3 text-ink">{r.uploadModel}</td>
                  <td className="px-3 py-3 text-ink">{r.displayModel}</td>
                  <td className="px-3 py-3 text-ink">{r.comm}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">查無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      </div>
    </div>
  )
}
