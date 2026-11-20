import { useEffect, useMemo, useState } from 'react'
import { X, Calendar, ArrowRight } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import { meterProfile, type ProfilePoint } from '@/data/meterProfile'
import {
  ALT_TABS,
  EVENT_COLUMNS,
  NETWORK_COLUMNS,
  ONLINE_COLUMNS,
  altColumns,
  altRows,
  eventRows,
  meterDetailFields,
  drrFields,
  midnightMerged,
  midnightDaily,
  networkRows,
  onlineRows,
  REGISTER_COLUMNS,
  REGISTER_HISTORY_COLUMNS,
  registerRows,
  registerHistoryRows,
  type Column,
  type InfoField,
  type MidnightDailyPoint,
  type Row,
} from '@/data/meterDetail'
import { Th, SortHead, FilterHead, MenuItem, StatusPill, type SortDir } from '@/components/table/tableBits'
import { SCROLL_BOX, STICKY_TH, UnderlineTabs } from '@/components/shared/Tabs'
import { neutral, text as textTok, brand, status as statusTok } from '@/tokens'

const BLUE = '#2F6BED' // 即時售電量
const GREEN = '#22C55E' // 累計售電量
/** 缺漏時段的灰帶 —— 比網格線深一點，但不搶折線 */
const MISS_FILL = 'rgba(106,114,130,.14)'
/**
 * 負載資料／午夜資料的圖表高度 —— 2026-09-29 業主意見：圖表窄一點（240→160），
 * 把高度讓給下方清單；清單改為撐滿剩餘高度（FILL_TABLE），自己捲動、表頭 sticky。
 */
const CHART_H = 'h-[160px]'
const FILL_TABLE = '!max-h-none flex-1'

/**
 * 資料時間 —— 2026-09-03 依業主意見只顯示日期（不含時分），
 * 並限制單次查詢區間，避免圖表時間跨度過大而讀不出東西。
 */
const RANGE_TO = '2025/01/07'
/**
 * 各分頁的查詢區間 —— 午夜資料一天只有一筆，7 天只畫得出 7 根柱子，
 * 因此這個分頁的區間與上限都放到 30 天（2026-09-07 業主意見）。
 */
const RANGE: Record<'default' | 'midnight', { from: string; days: number }> = {
  default: { from: '2025/01/01', days: 7 },
  midnight: { from: '2024/12/09', days: 30 },
}
const rangeFor = (tab: TabKey) => (tab === 'midnight' ? RANGE.midnight : RANGE.default)


/**
 * 資料類型 —— Figma 3569:26927 的七項，原本是下拉選單，改為頁籤。
 * 2026-11-04 依業主要求與正式版核對（openhes-front 的 METER_DATA_TYPES，features/meter-system/types/details.types.ts）：
 * 順序改成 ALT 在午夜之前、「需量復歸資料」改名「需量復歸報表」，七項名稱與順序現在與正式版一致。
 */
const TABS = [
  { key: 'load', label: '負載資料(Load profile)' },
  { key: 'alt', label: '定時供電品質資料(ALT)' },
  { key: 'midnight', label: '午夜資料(Midnight register)' },
  { key: 'event', label: '事件資料(Meter event)' },
  { key: 'online', label: '歷史連線資訊(Online history)' },
  { key: 'drr', label: '需量復歸報表(DRR)' },
  { key: 'info', label: '詳細資料(Meter info)' },
] as const
type TabKey = (typeof TABS)[number]['key']

type SortKey = 'rindex' | 'dataTime' | 'hesTime' | 'mdmsTime' | 'delay'
type LoadFilter = 'all' | '0' | '1'

/**
 * 電表詳細資料 modal (Figma 3569:19577 一系列) — opened from the 詳細資料 action
 * on a meter row. 七個資料類型以頁籤切換：負載資料是圖表＋表格，ALT／午夜資料／
 * 事件資料另有藥丸子頁籤，詳細資料是屬性卡＋網管資訊表。
 * Closes via X, backdrop click, or Esc.
 */
export function MeterDetailModal({ meterNo, onClose }: { meterNo: string; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('load')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(1440px,96vw)] h-[90vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        {/* header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
          <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
            <X size={18} />
          </button>
          <h2 className="text-[16px] font-semibold text-ink">電表詳細資料</h2>
        </div>

        {/* 資料類型頁籤 */}
        <div className="px-5 shrink-0">
          <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />
        </div>

        {/* 裝置與資料時間固定在頂部，不隨分頁內容捲動（切換頁籤時不會上下跳） */}
        <div className="flex items-end gap-8 flex-wrap shrink-0 px-5 pt-4 pb-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-ink-mut">裝置</span>
            <span className="text-[20px] font-bold text-ink font-mono">{meterNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-mut">資料時間</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink">
                <span className="tabular-nums">{rangeFor(tab).from}</span>
                <ArrowRight size={14} className="text-ink-mut" />
                <span className="tabular-nums">{RANGE_TO}</span>
                <Calendar size={15} className="text-ink-mut ml-1" />
              </div>
              {/* 區間拉太長圖表會擠成一團，限制單次查詢天數 */}
              <span className="text-[12px] text-ink-mut whitespace-nowrap">單次查詢上限 {rangeFor(tab).days} 天</span>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 flex flex-col gap-4">
          {tab === 'load' && <LoadProfileTab meterNo={meterNo} />}
          {tab === 'alt' && <AltTabPanel meterNo={meterNo} />}
          {tab === 'midnight' && <MidnightTabPanel meterNo={meterNo} />}
          {tab === 'event' && <EventTabPanel meterNo={meterNo} />}
          {tab === 'online' && <OnlineTabPanel meterNo={meterNo} />}
          {tab === 'drr' && <DrrPanel meterNo={meterNo} />}
          {tab === 'info' && <InfoTabPanel meterNo={meterNo} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 負載資料 */

function LoadProfileTab({ meterNo }: { meterNo: string }) {
  const { chart, rows } = useMemo(() => meterProfile(meterNo), [meterNo])
  // 2026-09-03 依業主意見：固定 rindex 由大到小，不提供排序與篩選
  const tableRows = useMemo(() => [...rows].sort((a, b) => b.rindex - a.rindex), [rows])

  /** 連續的缺漏時段合併成一段，畫成一條灰帶而不是一格一格 */
  const missRanges = useMemo(() => {
    const out: [string, string][] = []
    let from: string | null = null
    chart.forEach((p, i) => {
      if (p.status === 'missing') {
        if (from == null) from = p.t
        if (i === chart.length - 1) out.push([from, p.t])
      } else if (from != null) {
        out.push([from, chart[i - 1].t])
        from = null
      }
    })
    return out
  }, [chart])

  const missCount = chart.filter((p) => p.status === 'missing').length

  return (
    <>
      {/* 讀表健康摘要 —— 維運人員先看這一行就知道要不要細看圖 */}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-ink-sub">本區間 {chart.length} 個時段</span>
        <Chip tone={missCount ? 'bad' : 'ok'}>缺漏 {missCount}</Chip>
      </div>

      {/* dual-axis chart */}
      <div className="relative shrink-0 rounded-xl border border-border bg-inset/30 p-3">
        <span className="absolute left-4 top-2 text-[11px] text-ink-mut">kWh</span>
        <span className="absolute right-4 top-2 text-[11px] text-ink-mut">kWh</span>
        <div className="flex items-center justify-center gap-5 mb-1">
          <LegendDot color={BLUE} label="即時售電量" />
          <LegendDot color={GREEN} label="累計售電量" />
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-border" style={{ background: MISS_FILL }} />
            <span className="text-[12px] text-ink-sub">缺漏</span>
          </span>
        </div>
        <div className={CHART_H}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 14, right: 6, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={neutral.divider} vertical={false} />
              {/* 缺漏時段畫成灰帶 —— 折線在此斷開，帶子說明「不是沒用電，是沒收到讀值」 */}
              {missRanges.map(([from, to]) => (
                <ReferenceArea key={from} yAxisId="left" x1={from} x2={to} fill={MISS_FILL} stroke="none" ifOverflow="extendDomain" />
              ))}
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: textTok.tertiary }} tickLine={false} axisLine={{ stroke: neutral.border }} interval={0} />
              <YAxis
                yAxisId="left"
                domain={[0, 2500]}
                ticks={[0, 500, 1000, 1500, 2000, 2500]}
                tick={{ fontSize: 10, fill: textTok.tertiary }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={['dataMin - 5', 'dataMax + 5']}
                tick={{ fontSize: 10, fill: textTok.tertiary }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => v.toLocaleString('en-US')}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0]?.payload as ProfilePoint | undefined
                  const inst = payload.find((p) => p.dataKey === 'instant')?.value
                  const cum = payload.find((p) => p.dataKey === 'cumulative')?.value
                  return (
                    <div className="rounded-lg bg-surface border border-border shadow-card px-3 py-2 text-[12px]">
                      <div className="text-ink mb-1">2025/01/01 {label}</div>
                      {point?.status === 'missing' ? (
                        <div className="text-ink-mut">此時段未收到讀值</div>
                      ) : (
                        <>
                          <TipRow color={BLUE} label="即時售電量" value={inst as number} />
                          <TipRow color={GREEN} label="累計售電量" value={cum as number} />
                        </>
                      )}
                    </div>
                  )
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="instant"
                stroke={BLUE}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 2.5, fill: '#fff', stroke: BLUE, strokeWidth: 1.5 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={GREEN} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* reading table —— 撐滿圖表下方剩餘高度，自己捲動 */}
      <div className={`${SCROLL_BOX} ${FILL_TABLE}`}>
        {/* 12 欄要塞進彈窗寬度內，不讓使用者左右拖：表頭與時間欄允許換行、左右內距收窄 */}
        <table className="w-full table-fixed text-[12px] border-collapse [&_th]:whitespace-normal [&_th]:px-2 [&_th]:align-bottom [&_td]:px-2">
          {/* 欄寬固定成比例：時間欄寬一點，rindex／延遲窄一點，總和剛好填滿不外溢 */}
          <colgroup>
            {['5%', '10%', '10%', '10%', '5%', '9%', '9%', '8.5%', '8.5%', '9%', '8%', '8%'].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-ink-sub">
              <Th className={STICKY_TH}>rindex</Th>
              <Th className={STICKY_TH}>資料時間</Th>
              <Th className={STICKY_TH}>HES接收時間</Th>
              <Th className={STICKY_TH}>傳送至MDMS時間</Th>
              <Th className={STICKY_TH}>延遲</Th>
              <Th className={STICKY_TH}>負載資料狀態</Th>
              <Th className={STICKY_TH}>售電總仟瓦小時</Th>
              <Th className={STICKY_TH}>總購電kVArh(Q1)</Th>
              <Th className={STICKY_TH}>總購電kVArh(Q2)</Th>
              <Th className={STICKY_TH}>購電總仟瓦小時</Th>
              <Th className={STICKY_TH}>總購電kVArh(Q3)</Th>
              <Th className={STICKY_TH}>總購電kVArh(Q4)</Th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.rindex} className="border-b border-divider hover:bg-inset/40">
                <td className="py-2 tabular-nums text-ink">{r.rindex}</td>
                <td className="py-2 tabular-nums text-ink-sub">{r.dataTime}</td>
                <td className="py-2 tabular-nums text-ink-sub">{r.hesTime}</td>
                <td className="py-2 tabular-nums text-ink-sub">{r.mdmsTime}</td>
                <td className="py-2 tabular-nums text-ink">{r.delay}</td>
                <td className="py-2 tabular-nums text-ink">{r.loadStatus}</td>
                <td className="py-2 tabular-nums text-ink">{r.kwhTotal}</td>
                <td className="py-2 tabular-nums text-ink">{r.q1}</td>
                <td className="py-2 tabular-nums text-ink">{r.q2}</td>
                <td className="py-2 tabular-nums text-ink">{r.buyKwhTotal}</td>
                <td className="py-2 tabular-nums text-ink">{r.q3}</td>
                <td className="py-2 tabular-nums text-ink">{r.q4}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </>
  )
}

/* ------------------------------------------------- ALT / 午夜 / 事件 */

/**
 * ALT —— 2026-09-03 依業主意見先不分「功率與需量／電壓參數／電流參數」子頁籤，
 * 三組欄位合併成一張表（rindex／資料時間 只留一份）。
 */
function AltTabPanel({ meterNo }: { meterNo: string }) {
  const { columns, rows } = useMemo(() => {
    const tabs = ALT_TABS.map((t) => t.key)
    const cols: Column[] = []
    tabs.forEach((k) => altColumns(k).forEach((c) => { if (!cols.some((x) => x.key === c.key)) cols.push(c) }))
    const merged = altRows(meterNo, 'power').map((base, i) => {
      const row: Row = { ...base }
      tabs.slice(1).forEach((k) => Object.assign(row, altRows(meterNo, k)[i]))
      return row
    })
    return { columns: cols, rows: merged }
  }, [meterNo])
  return <SimpleTable columns={columns} rows={rows} minWidth={1900} />
}

/** 午夜資料的日期標籤（MM/DD）→ 完整日期；區間跨年（12 月屬前一年） */
const midnightFullDate = (mmdd: string) => `${mmdd.startsWith('12') ? 2024 : 2025}/${mmdd}`

/**
 * 午夜資料圖表 —— 2026-09-23 依業主意見改成與**負載資料同一個外觀**：
 * 雙軸折線（左軸＝每日售電量、藍線帶點；右軸＝累計讀值、綠線）、同樣的圖例列、
 * 摘要列、高度與 tooltip 版式。原本是單軸柱狀圖。
 *
 * 左軸畫日差值（當日讀值 − 前一日讀值）才看得出用電節奏；累計讀值放右軸對照。
 * 缺漏日以灰帶標出、折線在此斷開，且**缺漏之後第一天的日差值也不畫** ——
 * 那一天的差值涵蓋了整段空窗，畫出來會是一個假的高點（詳見 midnightDaily）。
 */
function MidnightChart({ meterNo }: { meterNo: string }) {
  const data = useMemo(() => midnightDaily(meterNo), [meterNo])

  /** 連續缺漏合併成一段灰帶；缺漏後第一天一併納入（該日同樣無法計算） */
  const missRanges = useMemo(() => {
    const out: [string, string][] = []
    let from: string | null = null
    data.forEach((p, i) => {
      const blank = p.missing || p.gapAfter
      if (blank) {
        if (from == null) from = p.date
        if (i === data.length - 1) out.push([from, p.date])
      } else if (from != null) {
        out.push([from, data[i - 1].date])
        from = null
      }
    })
    return out
  }, [data])

  const missCount = data.filter((p) => p.missing).length

  return (
    <>
      {/* 摘要列 —— 與負載資料同一個寫法 */}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-ink-sub">本區間 {data.length} 天</span>
        <Chip tone={missCount ? 'bad' : 'ok'}>缺漏 {missCount}</Chip>
      </div>

      {/* dual-axis chart —— 版式與負載資料一致 */}
      <div className="relative shrink-0 rounded-xl border border-border bg-inset/30 p-3">
        <span className="absolute left-4 top-2 text-[11px] text-ink-mut">kWh</span>
        <span className="absolute right-4 top-2 text-[11px] text-ink-mut">kWh</span>
        <div className="flex items-center justify-center gap-5 mb-1">
          <LegendDot color={BLUE} label="每日售電量" />
          <LegendDot color={GREEN} label="累計讀值" />
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-border" style={{ background: MISS_FILL }} />
            <span className="text-[12px] text-ink-sub">缺漏</span>
          </span>
        </div>
        <div className={CHART_H}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 14, right: 6, bottom: 0, left: -6 }}>
              <CartesianGrid stroke={neutral.divider} vertical={false} />
              {missRanges.map(([from, to]) => (
                <ReferenceArea key={from} yAxisId="left" x1={from} x2={to} fill={MISS_FILL} stroke="none" ifOverflow="extendDomain" />
              ))}
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: textTok.tertiary }} tickLine={false} axisLine={{ stroke: neutral.border }} interval={0} />
              <YAxis
                yAxisId="left"
                domain={[0, 'auto']}
                tick={{ fontSize: 10, fill: textTok.tertiary }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={['dataMin - 5', 'dataMax + 5']}
                tick={{ fontSize: 10, fill: textTok.tertiary }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => Math.round(v).toLocaleString('en-US')}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0]?.payload as MidnightDailyPoint | undefined
                  return (
                    <div className="rounded-lg bg-surface border border-border shadow-card px-3 py-2 text-[12px]">
                      <div className="text-ink mb-1">{midnightFullDate(String(label))}</div>
                      {p?.missing ? (
                        <div className="text-ink-mut">此日未收到午夜讀值</div>
                      ) : (
                        <>
                          {p?.gapAfter ? (
                            <div className="text-ink-mut">前一日缺漏，無法計算當日售電量</div>
                          ) : (
                            <TipRow color={BLUE} label="每日售電量" value={p?.sell ?? 0} />
                          )}
                          <TipRow color={GREEN} label="累計讀值" value={p?.reading ?? 0} />
                        </>
                      )}
                    </div>
                  )
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sell"
                stroke={BLUE}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 2.5, fill: '#fff', stroke: BLUE, strokeWidth: 1.5 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line yAxisId="right" type="monotone" dataKey="reading" stroke={GREEN} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

/**
 * 午夜資料 —— 2026-09-17 依業主意見移除「基本資料／尖峰／離峰／平日半尖峰／
 * 週六半尖峰／E峰／F峰／統計資訊」八個子頁籤，八組欄位合併成一張表
 * （與 ALT 同一個作法，欄位很寬，表格自己橫向捲動、表頭 sticky）。
 */
function MidnightTabPanel({ meterNo }: { meterNo: string }) {
  const { columns, rows } = useMemo(() => midnightMerged(meterNo), [meterNo])
  return (
    <>
      <MidnightChart meterNo={meterNo} />
      <SimpleTable columns={columns} rows={rows} minWidth={9600} fill />
    </>
  )
}

/**
 * 事件資料 —— 2026-09-07 依業主意見移除子頁籤。
 * 設計稿（Figma 3569:32987）上帶了「功率與需量／電壓參數／電流參數」那排，但事件表格
 * 只有 5 欄、三個頁籤共用同一組欄位，分頁沒有意義，判斷是從 ALT 畫面複製時留下的。
 */
function EventTabPanel({ meterNo }: { meterNo: string }) {
  return <SimpleTable columns={EVENT_COLUMNS} rows={eventRows(meterNo)} minWidth={780} />
}

/* ------------------------------------------------------ 歷史連線資訊 */

function OnlineTabPanel({ meterNo }: { meterNo: string }) {
  const rows = useMemo(() => onlineRows(meterNo), [meterNo])
  return (
    <div className={SCROLL_BOX}>
      <table className="w-full min-w-[900px] text-[12.5px] border-collapse">
        <thead>
          <tr className="text-ink-sub">
            {ONLINE_COLUMNS.map((c) => (
              <Th key={c.key} className={STICKY_TH}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-divider hover:bg-inset/40">
              <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{r.dataTime}</td>
              <td className="px-3 py-2">
                <StatusPill status={r.online} />
              </td>
              <td className="px-3 py-2 text-ink">{r.parent}</td>
              <td className="px-3 py-2 tabular-nums text-ink">{r.cellId}</td>
              <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{r.lpTime}</td>
              <td className="px-3 py-2 tabular-nums text-ink">{r.reportCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------ 詳細資料 */

/**
 * 三欄式屬性格 —— 詳細資料與需量復歸資料共用同一套版式（藍點＋標籤＋值、逐列斑馬紋）。
 *
 * `shrink-0` 不能拿掉：外層 body 是可捲動的 flex column，這個框又有 overflow-hidden
 * （min-height 因此變成 0），沒有 shrink-0 就會被下方的網管資訊表擠扁，後面幾列被切掉
 * （2026-09-23 業主回報）。值允許換行，長地址不再被截成「…」。
 */
function FieldGrid({ fields, labelWidth = 104 }: { fields: InfoField[]; labelWidth?: number }) {
  return (
    <div className="shrink-0 rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {fields.map((f, i) => (
          <div
            key={f.label}
            className="flex items-start gap-2 px-3 py-2 text-[12.5px]"
            style={{ background: Math.floor(i / 3) % 2 === 0 ? neutral.inset : 'transparent' }}
          >
            <span className="mt-[6px] h-1.5 w-1.5 rounded-full shrink-0" style={{ background: BLUE }} />
            <span className="shrink-0 text-ink-mut" style={{ width: labelWidth }}>{f.label}</span>
            {f.pill ? (
              <StatusPill status="online" />
            ) : (
              <span
                className="min-w-0 break-words text-ink"
                style={f.value === '暫不實作' ? { color: statusTok.danger.fg } : undefined}
                title={f.value}
              >
                {f.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 需量復歸資料（Figma 3639:32240）—— 三欄屬性清單，約 84 個欄位。
 * 標籤比詳細資料長（例如「售電平日半尖峰需量(連續累計)」），因此標籤欄加寬。
 * 2026-11-19 業主意見：時間要特別突顯／置頂 —— 資料時間、最近一次需量復歸日期、HES接收時間、
 * 傳送至MDMS時間 四項抽出來放在最上方一排大字卡，下方清單不再重複列出。
 */
const DRR_PINNED = ['資料時間', '最近一次需量復歸日期', 'HES接收時間', '傳送至MDMS時間']

function DrrPanel({ meterNo }: { meterNo: string }) {
  const fields = useMemo(() => drrFields(meterNo), [meterNo])
  const pinned = DRR_PINNED.map((l) => fields.find((f) => f.label === l)).filter((f): f is InfoField => !!f)
  const rest = fields.filter((f) => !DRR_PINNED.includes(f.label))
  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
        {pinned.map((f) => (
          <div key={f.label} className="rounded-xl border px-4 py-3" style={{ borderColor: BLUE, background: '#EEF4FF' }}>
            <div className="text-[12px] font-semibold" style={{ color: BLUE }}>{f.label}</div>
            <div className="mt-1 text-[17px] font-bold tabular-nums text-ink">{f.value}</div>
          </div>
        ))}
      </div>
      <FieldGrid fields={rest} labelWidth={168} />
    </>
  )
}

/**
 * 詳細資料 —— 屬性格下方依業主參考截圖（截圖/電表詳細資料參考.png，2026-09-29）
 * 排成 註冊紀錄 → 網管資訊 → 歷史紀錄 三段。註冊／歷史紀錄筆數少，表格不撐最小高度。
 */
function InfoTabPanel({ meterNo }: { meterNo: string }) {
  const fields = useMemo(() => meterDetailFields(meterNo), [meterNo])
  const netRows = useMemo(() => networkRows(meterNo), [meterNo])
  const regRows = useMemo(() => registerRows(meterNo), [meterNo])
  const histRows = useMemo(() => registerHistoryRows(meterNo), [meterNo])

  return (
    <>
      <FieldGrid fields={fields} />

      <SectionTitle title="註冊紀錄" />
      <SimpleTable columns={REGISTER_COLUMNS} rows={regRows} minWidth={1180} compact />

      <SectionTitle title="網管資訊" />
      <SimpleTable columns={NETWORK_COLUMNS} rows={netRows} minWidth={860} />

      <SectionTitle title="歷史紀錄" />
      <SimpleTable columns={REGISTER_HISTORY_COLUMNS} rows={histRows} minWidth={1080} compact />
    </>
  )
}

/** 分段標題：紅色小豎線＋標題（與裝置設定彈窗同一個寫法） */
function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="h-4 w-1 rounded-sm" style={{ background: brand.base }} />
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
    </div>
  )
}

/* ---------------------------------------------------------------- 共用 */

function EmptyPanel() {
  // Figma 3569:34823 標註「沒資料」——DRR 分頁在原型裡沒有可展示的資料
  return (
    <div className="grid place-items-center py-24 text-[13px] text-ink-fai">目前沒有資料</div>
  )
}

function SimpleTable({ columns, rows, minWidth = 1180, fill, compact }: {
  columns: Column[]; rows: Row[]; minWidth?: number
  /** 撐滿剩餘高度（圖表下方的清單） */
  fill?: boolean
  /** 筆數很少的表：不撐最小高度、不壓縮 */
  compact?: boolean
}) {
  const cls = fill ? `${SCROLL_BOX} ${FILL_TABLE}` : compact ? `${SCROLL_BOX} !min-h-0 shrink-0` : SCROLL_BOX
  return (
    <div className={cls}>
      <table className="w-full text-[12.5px] border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="text-ink-sub">
            {columns.map((c) => (
              <Th key={c.key} className={STICKY_TH}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-divider hover:bg-inset/40">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 tabular-nums text-ink whitespace-nowrap">
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 摘要用的小徽章：有問題紅、沒問題綠 */
function Chip({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  const t = tone === 'bad' ? statusTok.danger : statusTok.normal
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium tabular-nums"
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />
      {children}
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-[12px] text-ink-sub">{label}</span>
    </div>
  )
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-sub">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <b className="text-ink tabular-nums">{value?.toLocaleString('en-US')}</b>
    </div>
  )
}
