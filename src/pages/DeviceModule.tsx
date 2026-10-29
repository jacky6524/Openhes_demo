import { useMemo, useRef, useState } from 'react'
import { Th, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'

/**
 * 裝置模組（Figma 4253:31308；2026-10-22 業主新版設計稿「裝置模組-1／-2／-3」）。
 *
 * 側欄「裝置模組」展開成三頁，版型相同：左上「廠商」下拉＋一張表（表頭釘住、無限捲動、不分頁）。
 *   DCU裝置列表   系列／模組上拋型號／顯示型號／通訊技術
 *   模組裝置列表   同上四欄（電表通訊模組）
 *   頻道規劃       組別／Channel / Frequency 1／Channel / Frequency 2
 * 設計稿 -2、-3 的頁面標題誤植成「MDMS上拋」（複製貼上），這裡照頁面實際內容命名。
 * 資料全為 mock。
 */
type Comm = 'RF' | 'PLC' | 'NB-IoT' | 'LTE'
interface ModuleRow {
  vendor: string
  series: string
  uploadModel: string // 模組上拋型號
  displayModel: string // 顯示型號
  comm: Comm
}

const VENDORS = ['SGCM', 'ELSTER', 'HEXING'] as const
type Seed = [string, string, string, Comm]

const DCU_SEED: Seed[] = [
  ['SGCM', 'SGDC-A14TF', 'SGCM-DCU', 'RF'],
  ['SGCM', 'SGDC-B22NB', 'SGCM-DCU-NB', 'NB-IoT'],
  ['SGCM', 'SGDC-C31LT', 'SGCM-DCU-LT', 'LTE'],
  ['ELSTER', 'EL-D100', 'EL-DCU-100', 'RF'],
  ['HEXING', 'HX-D200', 'HX-DCU-200', 'PLC'],
]
const MODULE_SEED: Seed[] = [
  ['SGCM', 'SGCM-W15-TFB', 'SGCM-W15-TFB', 'RF'],
  ['SGCM', 'SGCM-W61-TFB', 'SGCM-W61-TFB', 'RF'],
  ['SGCM', 'SGCM-N71-NBF', 'SGCM-N71-NBF', 'NB-IoT'],
  ['SGCM', 'SGCM-L51-LTF', 'SGCM-L51-LTF', 'LTE'],
  ['ELSTER', 'EL-R100', 'EL-R100-RF', 'RF'],
  ['ELSTER', 'EL-P200', 'EL-P200-PLC', 'PLC'],
  ['HEXING', 'HX-N300', 'HX-N300-NB', 'NB-IoT'],
  ['HEXING', 'HX-R110', 'HX-R110-RF', 'RF'],
]

/** 湊滿 36 列（設計稿頁尾「共 36 筆」），超出種子數的以修訂號區分 */
const build = (seed: Seed[]): ModuleRow[] =>
  Array.from({ length: 36 }, (_, i) => {
    const [vendor, series, upload, comm] = seed[i % seed.length]
    const rev = Math.floor(i / seed.length)
    return { vendor, series, comm, uploadModel: upload, displayModel: rev ? `${series}-${rev}` : series }
  })
const DCU_ROWS = build(DCU_SEED)
const MODULE_ROWS = build(MODULE_SEED)

interface ChannelRow { vendor: string; group: string; ch1: string; ch2: string }
const CHANNEL_ROWS: ChannelRow[] = Array.from({ length: 36 }, (_, i) => {
  const g = i % 12
  return {
    vendor: VENDORS[i % VENDORS.length],
    group: String.fromCharCode(65 + g), // A…L
    ch1: `${12 + g} / ${(841.3 + g * 1.4).toFixed(1)}`,
    ch2: `${26 + g} / ${(842.7 + g * 1.4).toFixed(1)}`,
  }
})

const ALL = 'ALL'
const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand'

/** 三頁共用：廠商下拉＋表格。columns 是表頭，cells 把一列轉成各欄文字 */
function ModuleTable<T extends { vendor: string }>({
  title, rows, columns, cells,
}: { title: string; rows: T[]; columns: string[]; cells: (r: T) => string[] }) {
  const [vendor, setVendor] = useState<string>(ALL)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shown = useMemo(() => rows.filter((r) => vendor === ALL || r.vendor === vendor), [rows, vendor])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(shown.length, [vendor], 10)

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title={title} />
      <label className="flex w-[144px] flex-col gap-1">
        <span className="px-2 text-[12px] text-ink-sub">廠商</span>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={BOX}>
          <option value={ALL}>ALL</option>
          {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div ref={scrollRef} className="max-h-[calc(100vh-290px)] min-h-[300px] overflow-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                {columns.map((c) => <Th key={c} className="sticky top-0 z-10 bg-inset">{c}</Th>)}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, visible).map((r, i) => (
                <tr key={i} className="border-b border-divider hover:bg-inset/40">
                  {cells(r).map((v, j) => <td key={j} className="px-3 py-3 text-ink tabular-nums">{v}</td>)}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-ink-mut">查無資料</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={visible} total={shown.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
    </div>
  )
}

const MODULE_COLS = ['系列', '模組上拋型號', '顯示型號', '通訊技術']
const moduleCells = (r: ModuleRow) => [r.series, r.uploadModel, r.displayModel, r.comm]

/** 裝置模組 → DCU裝置列表 */
export function DeviceModule() {
  return <ModuleTable title="DCU裝置列表" rows={DCU_ROWS} columns={MODULE_COLS} cells={moduleCells} />
}

/** 裝置模組 → 模組裝置列表 */
export function ModuleDeviceList() {
  return <ModuleTable title="模組裝置列表" rows={MODULE_ROWS} columns={MODULE_COLS} cells={moduleCells} />
}

/** 裝置模組 → 頻道規劃 */
export function ChannelPlan() {
  return (
    <ModuleTable
      title="頻道規劃"
      rows={CHANNEL_ROWS}
      columns={['組別', 'Channel / Frequency 1', 'Channel / Frequency 2']}
      cells={(r) => [r.group, r.ch1, r.ch2]}
    />
  )
}
