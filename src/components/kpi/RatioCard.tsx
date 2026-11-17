import { Card } from '@/components/ui/Card'
import { TrendArrow, TrendGlyph } from './TrendArrow'
import { TrendTip } from './TrendTip'
import { InfoPopover, Note } from './InfoPopover'
import { useDashboard, useCurrentNode } from '@/store/useDashboard'
import { fmtInt } from '@/lib/format'
import { offlineGap } from '@/lib/aggregate'
import { trendDelta } from '@/lib/trends'
import { dcuStats, dcuTrendDelta } from '@/lib/dcu'
import { rateHealth } from '@/config/thresholds'
import { classifySeverity } from '@/data/dcuFleet'
import { VALUE_COLOR } from './valueTone'
import { status } from '@/tokens'

/**
 * 連線率卡（電表 / DCU）— 對齊前端 `.metric-card--wide` / `.metric-card--dcu`：
 *
 *   grid-template-columns: minmax(164px, .46fr) minmax(0, 1fr)
 *   align-items: end; gap: 12px; padding: 12px
 *   左：metric-title 14/500 + metric-value 36/800
 *   右：summary-bars（5px 軌道，只填未連線紅段）
 *       summary-layout: minmax(80px,1.4fr) 1fr 1fr → 未連線 / 已連線 / 總數
 * 2026-11-17 同步正式機截圖：數值一位小數、依三態著色（電表用連線率門檻、DCU 用 ONLINE_RATE_THRESHOLDS）；
 * 電表卡拿掉頂部進度條（DCU 卡保留）；未連線變化量依方向顯示（減少＝黑色向下、增加＝紅色向上）。
 */
export function RatioCard({ variant }: { variant: 'meter' | 'dcu' }) {
  const node = useCurrentNode()
  const selected = useDashboard((s) => s.selectedKpi)
  const selectKpi = useDashboard((s) => s.selectKpi)
  const m = node.metrics
  const dcu = dcuStats(node)

  const block =
    variant === 'meter'
      ? {
          label: '電表連線率 (%)',
          rate: m.connectRate,
          trend: trendDelta(node, 'connect'),
          connected: m.connected,
          total: m.meterTotal,
          totalLabel: '電表總數',
          offline: offlineGap(m),
          calc: '已連線電表 / 電表總數',
          // 電表連線率顯示更新時間；DCU 連線率依會議決議移除
          showUpdate: true,
          tone: rateHealth('connect', m.connectRate),
          showBar: false,
        }
      : {
          label: 'DCU 連線率(%)',
          rate: dcu.rate,
          trend: dcuTrendDelta(node),
          connected: dcu.connected,
          total: dcu.total,
          totalLabel: 'DCU總數',
          offline: dcu.offline,
          calc: '已連線DCU / DCU總數',
          showUpdate: false,
          tone: ({ normal: 'good', warn: 'warning', alert: 'alert' } as const)[classifySeverity(dcu.rate / 100)],
          showBar: true,
        }

  return (
    <Card
      active={selected === 'connect'}
      onClick={() => selectKpi('connect')}
      className="group relative grid min-w-0 grid-cols-[minmax(164px,0.46fr)_minmax(0,1fr)] items-end gap-3 p-3 [@media(max-height:943px)]:gap-2.5 [@media(max-height:943px)]:px-2.5 [@media(max-height:943px)]:py-2"
    >
      <ConnBlock {...block} />
      <InfoPopover title={block.label.replace(/\s*\(%\)/, '')} align="left">
        <Note>計算方式：{block.calc}</Note>
        {block.showUpdate && <Note>資料更新時間：每小時（整點）</Note>}
        <Note>備註：排除停用</Note>
      </InfoPopover>
    </Card>
  )
}

function ConnBlock({
  label,
  rate,
  trend,
  connected,
  total,
  totalLabel,
  offline,
  tone,
  showBar,
}: {
  label: string
  rate: number
  trend: number
  connected: number
  total: number
  totalLabel: string
  offline: number
  tone: keyof typeof VALUE_COLOR
  showBar: boolean
}) {
  const offlinePct = total > 0 ? (offline / total) * 100 : 0
  const offlineDelta = Math.max(1, Math.round(offline * 0.013)) // deterministic mock Δ
  // 連線率上升 ⇒ 未連線減少（黑色向下）；下降 ⇒ 未連線增加（紅色向上）
  const offlineUp = trend < 0
  // 未連線 / 斷線 一律紅色標示；連線率大字預設黑字，僅低於告警值 (<95%) 轉紅。
  const offAccent = status.danger.fg

  return (
    <>
      {/* .metric-main — 標題 + 大字，趨勢貼在標題右側（前端 .metric-heading） */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="whitespace-nowrap text-[14px] font-medium leading-5 tracking-[0.5px] text-ink-sub">
            {label}
          </span>
          <TrendArrow delta={trend} higherIsBetter align="left" />
        </div>
        <div
          className="mt-1 text-[36px] font-extrabold leading-10 tabular-nums"
          style={{ color: VALUE_COLOR[tone] }}
        >
          {rate.toFixed(1)}
        </div>
      </div>

      {/* .meter-summary / .dcu-summary */}
      <div className="grid min-w-0 gap-[5px]">
        {/* .summary-bars — 空容器只填「未連線」紅段（電表卡不顯示） */}
        {showBar && (
          <div className="flex h-[5px] w-full overflow-hidden rounded-full" style={{ background: '#EEE8EA' }}>
            <div
              className="shrink-0"
              style={{ width: `${Math.max(offlinePct, offline > 0 ? 1.5 : 0)}%`, background: offAccent }}
            />
            <div className="flex-1" style={{ background: '#E7E3E4' }} />
          </div>
        )}

        {/* .summary-layout */}
        <div className="grid min-w-0 grid-cols-[minmax(80px,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          {/* 未連線 — the highlighted problem record */}
          <div className="grid min-w-0 gap-1.5">
            <span className="flex min-w-0 items-center gap-[5px] overflow-hidden text-[14px] leading-[1.1]" style={{ color: offAccent }}>
              <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: offAccent }} />
              <em className="not-italic">未連線</em>
              <small
                className="trend-trigger group/trend relative ml-[3px] inline-flex cursor-default items-center gap-0.5 text-[12px] font-bold tabular-nums"
                style={{ color: offlineUp ? offAccent : '#2D2B2D' }}
              >
                <TrendGlyph direction={offlineUp ? 'up' : 'down'} size={14} />
                {fmtInt(offlineDelta)}
                <TrendTip method="與前一小時相比" align="left" />
              </small>
            </span>
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-extrabold leading-[1.08] tabular-nums" style={{ color: offAccent }}>
              {fmtInt(offline)}
            </strong>
          </div>

          {/* 已連線 */}
          <div className="grid min-w-0 gap-1.5">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.1] text-ink-mut">已連線</span>
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-extrabold leading-[1.08] tabular-nums text-ink">
              {fmtInt(connected)}
            </strong>
          </div>

          {/* 總數 */}
          <div className="grid min-w-0 gap-1.5 text-right">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.1] text-ink-mut">{totalLabel}</span>
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-extrabold leading-[1.08] tabular-nums text-ink">
              {fmtInt(total)}
            </strong>
          </div>
        </div>
      </div>
    </>
  )
}
