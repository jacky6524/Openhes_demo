import { Card } from '@/components/ui/Card'
import { TrendArrow } from './TrendArrow'
import { InfoPopover, Note } from './InfoPopover'
import { useCurrentNode, useDashboard } from '@/store/useDashboard'
import { fmtInt } from '@/lib/format'
import { isRateAlert, METRIC_FIELD } from '@/config/thresholds'
import { trendDelta } from '@/lib/trends'
import { status, text } from '@/tokens'
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

/**
 * 讀表率 KPI 卡（LP / MN午夜 / ALT）— 對齊前端 `.metric-card`：
 *   padding: 0 12px; justify-content: center
 *   .metric-heading--spread → 標題與趨勢左右對齊
 *   .metric-title  14/500/ls .5px/text-secondary
 *   .metric-value  36/800/lh 40，僅 <95% 轉 --status-error-emphasis
 * Hover 顯示計算方式與「排除停用」備註（MN 另附更新時間）。
 */
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
      className="group relative flex min-w-0 flex-col justify-center px-3 [@media(max-height:943px)]:px-2.5"
    >
      <div className="w-full min-w-0">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="whitespace-nowrap text-[14px] font-medium leading-5 tracking-[0.5px] text-ink-sub">
            {label}
          </span>
          <TrendArrow delta={trendDelta(node, metric)} higherIsBetter />
        </div>
        <div
          className="mt-2 text-[36px] font-extrabold leading-10 tabular-nums"
          style={{ color: alert ? status.danger.fg : text.primary }}
        >
          {value.toFixed(2)}
        </div>
      </div>

      <InfoPopover title={label.replace(/\s*\(%\)/, '')}>
        <Note>計算方式：{READ_CALC[metric]}</Note>
        {SHOW_UPDATE[metric] && <Note>{READ_UPDATE_NOTE}</Note>}
        <Note>{EXCLUDE_NOTE}</Note>
      </InfoPopover>
    </Card>
  )
}

/**
 * 事件數量 / 停電數量 — 對齊前端 `.event-panel`：
 *   padding 12；內容底部對齊；兩欄等寬，第二欄左側 1px 分隔線
 *   .event-stat  label 12/700 #6f6267｜value 22/lh22｜previous 10/500 #9a8c91
 *
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
    <Card className="group relative flex min-w-0 flex-col justify-end p-3 [@media(max-height:943px)]:p-2.5">
      <div className="grid w-full min-w-0 grid-cols-2 items-center">
        <CountBlock label="事件數量" value={total} prevDay={eventPrevDay} prevAlign="left" />
        <CountBlock label="停電數量" value={outage} prevDay={outagePrevDay} prevAlign="right" divided />
      </div>

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
  divided,
}: {
  label: string
  value: number
  prevDay: number
  prevAlign?: 'left' | 'right'
  divided?: boolean
}) {
  return (
    <div
      className={[
        'flex min-w-0 flex-col justify-center gap-[5px] px-0.5',
        divided ? 'ml-0.5 border-l pl-2.5' : '',
      ].join(' ')}
      style={divided ? { borderColor: '#EEE4E6' } : undefined}
    >
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-bold leading-[1.2] text-ink-sub">
        {label}
      </span>
      <strong
        className="block max-w-full whitespace-nowrap text-[22px] font-extrabold leading-[22px] tracking-[-0.2px] tabular-nums"
        style={{ color: text.primary }}
      >
        {fmtInt(value)}
      </strong>
      <DailyPrev prevDay={prevDay} align={prevAlign} />
    </div>
  )
}

/** 前一日結算量 — hover 說明每日統計時間固定為隔日 01:00 */
function DailyPrev({ prevDay, align = 'left' }: { prevDay: number; align?: 'left' | 'right' }) {
  const tipPos = align === 'right' ? 'right-0' : 'left-0'
  return (
    <span className="trend-trigger group/trend relative block w-fit cursor-default overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium leading-[1.2] tabular-nums text-ink-fai hover:text-ink-sub">
      前一日 {fmtInt(prevDay)}
      <span className={`pointer-events-none absolute top-full ${tipPos} mt-2 z-40 w-[200px] opacity-0 translate-y-1 transition-all duration-150 group-hover/trend:opacity-100 group-hover/trend:translate-y-0`}>
        <span className="block overflow-hidden rounded-lg border border-border bg-surface text-left shadow-card">
          <span className="block border-b border-divider bg-inset/50 px-3 py-1.5 text-[11px] font-semibold text-ink-sub">
            前一日事件數量
          </span>
          <span className="block px-3 py-2 text-[11px] leading-snug text-ink-sub">
            每日資料統計時間固定為隔日 01:00。
          </span>
        </span>
      </span>
    </span>
  )
}
