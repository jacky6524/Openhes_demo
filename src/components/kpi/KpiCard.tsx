import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TrendArrow } from './TrendArrow'
import { InfoPopover, Note } from './InfoPopover'
import { useCurrentNode, useDashboard } from '@/store/useDashboard'
import { fmtInt } from '@/lib/format'
import { isRateAlert, METRIC_FIELD } from '@/config/thresholds'
import { trendDelta } from '@/lib/trends'
import { text } from '@/tokens'
import type { MetricKey } from '@/types'

/** 讀表率更新：每小時（整點） */
const READ_UPDATE_NOTE = '資料更新時間：每小時（整點）'

/** 停用電表不列入計算 — 統一以備註呈現，不再寫在計算式括號內 */
const EXCLUDE_NOTE = '備註：排除停用'

/** 各讀表率計算方式：分子 / 分母（LP 每日 96 筆、ALT 每日 24 筆、MN 每日 1 筆） */
const READ_CALC: Partial<Record<MetricKey, string>> = {
  lp: 'LP讀表數 / (電表總數 × 96)',
  midnight: 'MN讀表數 / 電表總數',
  alt: 'ALT讀表數 / (電表總數 × 24)',
}

/** 僅 MN 午夜讀表率顯示更新時間；ALT / LP 依會議決議移除 */
const SHOW_UPDATE: Partial<Record<MetricKey, boolean>> = { midnight: true }

/** clickable rate KPI (LP / MN午夜 / ALT) — drives shared card + map colour.
    Value renders black by default; only turns red as a warning below 95%.
    Hover 顯示計算方式與「排除停用」備註（MN 另附更新時間）。 */
export function RateKpiCard({ metric, label }: { metric: MetricKey; label: string }) {
  const node = useCurrentNode()
  const selected = useDashboard((s) => s.selectedKpi)
  const selectKpi = useDashboard((s) => s.selectKpi)
  const value = node.metrics[METRIC_FIELD[metric]]
  const alert = isRateAlert(value)

  return (
    <Card
      active={selected === metric}
      onClick={() => selectKpi(metric)}
      className="px-3 py-3 min-w-0 flex flex-col justify-center gap-3 relative group"
    >
      <div className="flex items-center justify-between px-2">
        <span className="text-[17px] font-semibold text-ink-sub tracking-[0.2px] whitespace-nowrap">{label}</span>
        <TrendArrow delta={trendDelta(node, metric)} higherIsBetter />
      </div>
      <div className="px-2">
        <div
          className="text-[32px] leading-none font-bold tabular-nums tracking-[0.2px]"
          style={{ color: alert ? '#DB3B36' : text.primary }}
        >
          {value.toFixed(2)}
        </div>
      </div>

      <InfoPopover title={label.replace('(%)', '')}>
        <Note>計算方式：{READ_CALC[metric]}</Note>
        {SHOW_UPDATE[metric] && <Note>{READ_UPDATE_NOTE}</Note>}
        <Note>{EXCLUDE_NOTE}</Note>
      </InfoPopover>
    </Card>
  )
}

/**
 * 事件數量 / 停電數量 — COMPACT。
 *   事件數量：僅計算電表事件 event code 1~27、100、1001。
 *   停電數量：僅計算 event code 14（Primary Power Down）。
 *   趨勢區顯示「前一日」數量；每日資料統計時間固定為隔日 01:00。
 */
export function EventCountCard() {
  const node = useCurrentNode()
  const total = node.metrics.eventCount
  // 停電數量 = 事件中以停電相關 event code(14) 篩選出的子集 (deterministic mock)
  const outage = Math.round(total * 0.12)
  // 前一日結算值（隔日 01:00 統計）— 事件固定示範為 200，停電依比例 mock
  const eventPrevDay = 200
  const outagePrevDay = Math.max(1, Math.round(outage * 0.85))

  return (
    <Card className="px-3 py-3 min-w-0 flex items-stretch gap-2 relative group">
      <CountBlock label="事件數量" value={total} prevDay={eventPrevDay} prevAlign="left" />
      <div className="w-px bg-divider" />
      <CountBlock label="停電數量" value={outage} prevDay={outagePrevDay} prevAlign="right" />

      <InfoPopover title="事件 / 停電數量" align="right">
        <Note>事件數量：僅計算電表事件 event code 1~27、100、1001。</Note>
        <Note>停電數量：僅計算 event code 14（Primary Power Down）。</Note>
        <Note>{READ_UPDATE_NOTE}</Note>
        <Note>{EXCLUDE_NOTE}</Note>
      </InfoPopover>
    </Card>
  )
}

/** compact count figure — 即時值 + 前一日結算值（隔日 01:00 統計） */
function CountBlock({
  label,
  value,
  prevDay,
  prevAlign = 'left',
}: {
  label: string
  value: number
  prevDay: number
  prevAlign?: 'left' | 'right'
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 px-1">
      <span className="text-[13px] font-medium text-ink-sub tracking-[0.2px] whitespace-nowrap">{label}</span>
      <span className="text-[22px] leading-none font-bold tabular-nums" style={{ color: text.primary }}>
        {fmtInt(value)}
      </span>
      <DailyPrev prevDay={prevDay} align={prevAlign} />
    </div>
  )
}

/** 前一日結算量 — hover 說明每日統計時間固定為隔日 01:00 */
function DailyPrev({ prevDay, align = 'left' }: { prevDay: number; align?: 'left' | 'right' }) {
  const tipPos = align === 'right' ? 'right-0' : 'left-0'
  return (
    <span className="trend-trigger group/trend relative inline-flex items-center gap-1 text-[12px] font-medium leading-none tabular-nums cursor-default w-fit text-ink-sub">
      <CalendarClock size={13} strokeWidth={2} />
      前一日 {fmtInt(prevDay)}
      <span className={`pointer-events-none absolute top-full ${tipPos} mt-2 z-40 w-[200px] opacity-0 translate-y-1 transition-all duration-150 group-hover/trend:opacity-100 group-hover/trend:translate-y-0`}>
        <span className="block rounded-lg bg-surface border border-border shadow-card overflow-hidden text-left">
          <span className="block px-3 py-1.5 border-b border-divider bg-inset/50 text-[11px] font-semibold text-ink-sub">
            前一日事件數量
          </span>
          <span className="block px-3 py-2 text-[11px] text-ink-sub leading-snug">
            每日資料統計時間固定為隔日 01:00。
          </span>
        </span>
      </span>
    </span>
  )
}
