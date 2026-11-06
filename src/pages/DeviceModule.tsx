import { useRef, useState } from 'react'
import { Th, FilterHead, MenuItem, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'

/**
 * 裝置模組（Figma 4253:31308；2026-10-22 業主新版設計稿「裝置模組-1／-2／-3」）。
 *
 * 2026-11-04 業主意見：
 *   · FAN（電表通訊模組）與 DCU 併成同一個子項「模組型號」，用頁籤切換（原本是兩個側欄項目；不叫「裝置列表」以免和裝置管理的裝置列表撞名）
 *   · 表格首欄加「廠商」（可篩選），新增廠商 DELTA；欄位順序：廠商／系列／顯示型號／上拋型號
 *   · 依通訊形式分表格（RF／PLC／NB-IoT／LTE 各一張），通訊技術欄因此拿掉
 *   · 頻道規劃：表格首欄加廠商；新增「頻譜使用圖」（839～847 MHz，一個廠商一列、顏色區分廠商）
 * 廠商篩選在同一個頁籤內的各張表共用（在任一張表頭選，全部一起套用）。
 * 資料全為 mock。
 */
type Comm = 'RF' | 'PLC' | 'NB-IoT' | 'LTE'
const COMMS: Comm[] = ['RF', 'PLC', 'NB-IoT', 'LTE']

const VENDORS = ['SGCM', 'ELSTER', 'HEXING', 'DELTA'] as const
type Vendor = (typeof VENDORS)[number]

/** 廠商識別色（頻譜圖色塊、表格廠商色點）。刻意避開告警紅／黃／綠，不跟健康狀態混淆 */
const VENDOR_COLOR: Record<Vendor, string> = {
  SGCM: '#2F6BED',
  ELSTER: '#0E9B9B',
  HEXING: '#8B5CF6',
  DELTA: '#EA8C00',
}

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

/* ───────────────────────── 頻道規劃資料 ───────────────────────── */

/**
 * 839～847 MHz，頻道間隔 0.2 MHz：Channel n 的中心頻率 = 839.1 + 0.2n（n = 0…39，839.1～846.9）。
 * 每個組別兩個頻道：Frequency 1 在下半段（n = k）、Frequency 2 在上半段（n = k + 20），
 * 各廠商分到連續的組別，頻譜圖上一眼看出誰用哪一段、有沒有重疊。
 */
export const SPECTRUM_MIN = 839
export const SPECTRUM_MAX = 847
const CH_STEP = 0.2
const chFreq = (n: number) => 839.1 + n * CH_STEP

interface ChannelRow { vendor: Vendor; group: string; ch1: number; ch2: number }
const GROUPS_PER_VENDOR: Record<Vendor, number> = { SGCM: 6, ELSTER: 4, HEXING: 4, DELTA: 4 }
const CHANNEL_ROWS: ChannelRow[] = (() => {
  const out: ChannelRow[] = []
  let k = 0
  for (const v of VENDORS) {
    for (let g = 0; g < GROUPS_PER_VENDOR[v]; g++, k++) {
      out.push({ vendor: v, group: String.fromCharCode(65 + g), ch1: k, ch2: k + 20 })
    }
  }
  return out
})()
const chLabel = (n: number) => `${n} / ${chFreq(n).toFixed(1)}`

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
      <PageTitle title="模組型號" />
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

/* ───────────────────────── 頁面：頻道規劃 ───────────────────────── */

/** 裝置模組 → 頻道規劃 */
export function ChannelPlan() {
  const [vendor, setVendor] = useState<string>(ALL)
  const rows = CHANNEL_ROWS.filter((r) => vendor === ALL || r.vendor === vendor)
  return (
    // 2026-11-04 業主意見：頻譜圖放在表格下方、版面撐滿視窗 —— 表格吃剩下的高度並自己捲動，頻譜圖固定在底部
    <div className="flex h-full min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="頻道規劃" />
      <DataTable
        rows={rows}
        vendor={vendor}
        onVendor={setVendor}
        columns={['組別', 'Channel / Frequency 1', 'Channel / Frequency 2']}
        cells={(r) => [r.group, chLabel(r.ch1), chLabel(r.ch2)]}
        fill
      />
      <SpectrumChart rows={CHANNEL_ROWS} focus={vendor === ALL ? null : (vendor as Vendor)} />
    </div>
  )
}

/**
 * 頻譜使用圖：橫軸 839～847 MHz，一個廠商一列（首欄廠商），每個頻道畫成 0.2 MHz 寬的色塊、色塊上標組別。
 * 表格有篩選廠商時，其他廠商的列淡化（不隱藏，才看得出相對位置）。
 */
function SpectrumChart({ rows, focus }: { rows: ChannelRow[]; focus: Vendor | null }) {
  const [hover, setHover] = useState<{ row: ChannelRow; n: number; x: number; y: number } | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const span = SPECTRUM_MAX - SPECTRUM_MIN
  const pos = (mhz: number) => ((mhz - SPECTRUM_MIN) / span) * 100
  const ticks = Array.from({ length: span + 1 }, (_, i) => SPECTRUM_MIN + i)
  const used = new Set(rows.flatMap((r) => [r.ch1, r.ch2])).size

  return (
    <div className="shrink-0 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-ink">頻譜使用圖</h2>
          <span className="text-[12px] text-ink-mut">{SPECTRUM_MIN}～{SPECTRUM_MAX} MHz · 頻道間隔 {CH_STEP} MHz</span>
        </div>
        <span className="text-[12px] tabular-nums text-ink-sub">已使用 <b className="text-ink">{used}</b> / 共 {Math.round(span / CH_STEP)} 個頻道</span>
      </div>

      <div ref={plotRef} className="relative mt-3" onMouseLeave={() => setHover(null)}>
        {VENDORS.map((v) => {
          const mine = rows.filter((r) => r.vendor === v)
          const dim = focus !== null && focus !== v
          return (
            <div key={v} className="flex items-center gap-3 py-1.5" style={{ opacity: dim ? 0.3 : 1 }}>
              <span className="flex w-[88px] shrink-0 items-center gap-2 text-[13px] font-semibold text-ink">
                <span className="size-2.5 rounded-sm" style={{ background: VENDOR_COLOR[v] }} />{v}
              </span>
              <div className="relative h-9 flex-1 rounded bg-inset">
                {/* 1 MHz 格線 */}
                {ticks.slice(1, -1).map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pos(t)}%` }} />
                ))}
                {mine.flatMap((r) => [r.ch1, r.ch2].map((n) => (
                  <span
                    key={`${r.group}-${n}`}
                    onMouseEnter={(e) => {
                      const box = plotRef.current?.getBoundingClientRect()
                      if (!box) return
                      const me = e.currentTarget.getBoundingClientRect()
                      setHover({ row: r, n, x: me.left - box.left + me.width / 2, y: me.top - box.top })
                    }}
                    className="absolute inset-y-0.5 grid cursor-default place-items-center rounded-[3px] text-[11px] font-bold text-white"
                    style={{ left: `${pos(chFreq(n) - CH_STEP / 2)}%`, width: `calc(${(CH_STEP / span) * 100}% - 1px)`, background: VENDOR_COLOR[v] }}
                  >
                    {r.group}
                  </span>
                )))}
              </div>
            </div>
          )
        })}

        {/* 頻率刻度 */}
        <div className="flex gap-3">
          <span className="w-[88px] shrink-0" />
          <div className="relative h-5 flex-1 text-[11px] tabular-nums text-ink-mut">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="absolute top-1"
                style={{ left: `${pos(t)}%`, transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <span className="size-2 rounded-sm" style={{ background: VENDOR_COLOR[hover.row.vendor] }} />
              {hover.row.vendor} · 組別 {hover.row.group}
            </div>
            <div className="mt-0.5 tabular-nums text-ink-sub">
              Channel {hover.n} · {chFreq(hover.n).toFixed(1)} MHz（Frequency {hover.n === hover.row.ch1 ? 1 : 2}）
            </div>
          </div>
        )}
      </div>
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
  /** 撐滿父層剩餘高度（頻道規劃用；父層要是 flex column） */
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
