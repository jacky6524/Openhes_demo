import { useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Th, FilterHead, MenuItem, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'
import { VENDORS, VENDOR_COLOR, type Vendor } from '@/data/channelPlan'

/**
 * 裝置模組（Figma 4253:31308；2026-10-22 業主新版設計稿「裝置模組-1／-2／-3」）。
 *
 * 2026-11-04 業主意見：
 *   · FAN（電表通訊模組）與 DCU 併成同一個子項「模組型號」，用頁籤切換（原本是兩個側欄項目；不叫「裝置列表」以免和裝置管理的裝置列表撞名）
 *   · 表格首欄加「廠商」（可篩選），新增廠商 DELTA；欄位順序：廠商／系列／顯示型號／上拋型號
 *   · 依通訊形式分表格（RF／PLC／NB-IoT／LTE 各一張），通訊技術欄因此拿掉
 *   · 頻道規劃移到 pages/ChannelPlan.tsx（2026-11-11 改用業主頻點資料，分類＝案別）
 * 廠商篩選在同一個頁籤內的各張表共用（在任一張表頭選，全部一起套用）。
 * 資料全為 mock。
 */
type Comm = 'RF' | 'PLC' | 'NB-IoT' | 'LTE'
const COMMS: Comm[] = ['RF', 'PLC', 'NB-IoT', 'LTE']

// 廠商清單與識別色與頻道規劃共用（data/channelPlan.ts）

interface ModuleRow {
  vendor: Vendor
  series: string
  displayModel: string // 顯示型號
  uploadModel: string // 上拋型號
  comm: Comm
}
type Seed = [Vendor, string, string, Comm]

const FAN_SEED: Seed[] = [
  ['SGCM', 'SGCM-W15-TFB', 'SGCM-W15-TFB', 'RF'],
  ['SGCM', 'SGCM-W61-TFB', 'SGCM-W61-TFB', 'RF'],
  ['SGCM', 'SGCM-N71-NBF', 'SGCM-N71-NBF', 'NB-IoT'],
  ['SGCM', 'SGCM-L51-LTF', 'SGCM-L51-LTF', 'LTE'],
  ['ELSTER', 'EL-R100', 'EL-R100-RF', 'RF'],
  ['ELSTER', 'EL-P200', 'EL-P200-PLC', 'PLC'],
  ['HEXING', 'HX-N300', 'HX-N300-NB', 'NB-IoT'],
  ['HEXING', 'HX-R110', 'HX-R110-RF', 'RF'],
  ['DELTA', 'DLT-R20', 'DLT-R20-RF', 'RF'],
  ['DELTA', 'DLT-P10', 'DLT-P10-PLC', 'PLC'],
  ['DELTA', 'DLT-L30', 'DLT-L30-LTE', 'LTE'],
]
const DCU_SEED: Seed[] = [
  ['SGCM', 'SGDC-A14TF', 'SGCM-DCU', 'RF'],
  ['SGCM', 'SGDC-B22NB', 'SGCM-DCU-NB', 'NB-IoT'],
  ['SGCM', 'SGDC-C31LT', 'SGCM-DCU-LT', 'LTE'],
  ['ELSTER', 'EL-D100', 'EL-DCU-100', 'RF'],
  ['HEXING', 'HX-D200', 'HX-DCU-200', 'PLC'],
  ['DELTA', 'DLT-D50', 'DLT-DCU-50', 'RF'],
  ['DELTA', 'DLT-D60', 'DLT-DCU-60', 'LTE'],
]

/** 每個型號再展開兩個修訂版（顯示型號帶 -1／-2），讓每張表有幾列可看 */
const build = (seed: Seed[]): ModuleRow[] =>
  seed.flatMap(([vendor, series, upload, comm]) =>
    [0, 1, 2].map((rev) => ({ vendor, series, comm, uploadModel: upload, displayModel: rev ? `${series}-${rev}` : series })),
  )
const ROWS = { fan: build(FAN_SEED), dcu: build(DCU_SEED) }

const ALL = 'ALL'

/* ───────────────────────── 頁面：裝置列表（FAN／DCU 頁籤） ───────────────────────── */

const TABS = [
  { key: 'fan', label: 'FAN' },
  { key: 'dcu', label: 'DCU' },
] as const
type TabKey = (typeof TABS)[number]['key']

/** 裝置模組 → 模組型號 */
export function DeviceModule() {
  const [tab, setTab] = useState<TabKey>('fan')
  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="模組型號" icon={<ClipboardList size={20} className="text-brand" />} />
      <PillTabs tabs={TABS} value={tab} onChange={setTab} />
      {/* key：換頁籤就重置廠商篩選 */}
      <CommTables key={tab} rows={ROWS[tab]} />
    </div>
  )
}

function CommTables({ rows }: { rows: ModuleRow[] }) {
  const [vendor, setVendor] = useState<string>(ALL)
  const shown = rows.filter((r) => vendor === ALL || r.vendor === vendor)
  return (
    <div className="flex flex-col gap-4">
      {COMMS.map((comm) => {
        const list = shown.filter((r) => r.comm === comm)
        const total = rows.filter((r) => r.comm === comm).length
        if (total === 0) return null // 這個頁籤根本沒有此通訊形式的型號，整張表不出現
        return (
          <section key={comm} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="h-4 w-[3px] self-center rounded-full bg-danger" />
              <h2 className="text-[15px] font-semibold text-ink">{comm}</h2>
              <span className="text-[12px] tabular-nums text-ink-mut">{list.length} 筆</span>
            </div>
            <DataTable
              rows={list}
              vendor={vendor}
              onVendor={setVendor}
              columns={['系列', '顯示型號', '上拋型號']}
              cells={(r) => [r.series, r.displayModel, r.uploadModel]}
              maxH="max-h-[320px]"
            />
          </section>
        )
      })}
    </div>
  )
}

/* ───────────────────────── 共用表格：首欄廠商（可篩選） ───────────────────────── */

function DataTable<T extends { vendor: Vendor }>({
  rows, vendor, onVendor, columns, cells, maxH = '', fill = false,
}: {
  rows: T[]
  vendor: string
  onVendor: (v: string) => void
  columns: string[]
  cells: (r: T) => string[]
  /** 固定最大高度（裝置列表的分表用） */
  maxH?: string
  /** 撐滿父層剩餘高度（父層要是 flex column） */
  fill?: boolean
}) {
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [vendor, rows.length], 20)

  return (
    <div className={'overflow-hidden rounded-card border border-border bg-surface shadow-card' + (fill ? ' flex min-h-0 flex-1 flex-col' : '')}>
      {/* min-h：篩選選單是表頭往下展開的，表太短會被捲動框裁掉 */}
      <div ref={scrollRef} className={`${fill ? 'min-h-[220px] flex-1' : `${maxH} min-h-[220px]`} overflow-auto`}>
        <table className="w-full table-fixed text-[13px] border-collapse">
          <colgroup>
            <col style={{ width: '160px' }} />
            {columns.map((c) => <col key={c} />)}
          </colgroup>
          <thead>
            <tr className="text-ink-sub">
              <Th className="sticky top-0 z-20 bg-inset">
                <FilterHead label={vendor === ALL ? '廠商' : `廠商：${vendor}`} open={open} onToggle={() => setOpen((o) => !o)}>
                  {[ALL, ...VENDORS].map((v) => (
                    <MenuItem key={v} active={vendor === v} onClick={() => { onVendor(v); setOpen(false) }}>{v}</MenuItem>
                  ))}
                </FilterHead>
              </Th>
              {columns.map((c) => <Th key={c} className="sticky top-0 z-10 bg-inset">{c}</Th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visible).map((r, i) => (
              <tr key={i} className="border-b border-divider hover:bg-inset/40">
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold text-ink">
                    <span className="size-2.5 rounded-sm" style={{ background: VENDOR_COLOR[r.vendor] }} />{r.vendor}
                  </span>
                </td>
                {cells(r).map((v, j) => <td key={j} className="px-3 py-3 text-ink tabular-nums">{v}</td>)}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-10 text-center text-ink-mut">此廠商沒有這類型號</td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  )
}
