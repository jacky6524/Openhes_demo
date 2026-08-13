import { TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TrendArrow } from './TrendArrow'
import { TrendTip } from './TrendTip'
import { InfoPopover, Note } from './InfoPopover'
import { useDashboard, useCurrentNode } from '@/store/useDashboard'
import { fmtInt } from '@/lib/format'
import { offlineGap } from '@/lib/aggregate'
import { trendDelta } from '@/lib/trends'
import { dcuStats, dcuTrendDelta } from '@/lib/dcu'
import { isRateAlert } from '@/config/thresholds'
import { chartNeutral, status, text } from '@/tokens'

/**
 * 連線率卡 — one card per variant (電表連線率 / DCU連線率), layout per 7/24 會議:
 *   [ label + trend / 大字連線率值(黑, <95% 轉紅) | bar / 未連線·已連線·總數 並排 ]
 *
 * Bar = 「空容器裝填比率」: the container stays quiet neutral; ONLY the 未連線
 * (problem) share is filled red. 未連線(紅字, 含數量+趨勢) 置於已連線左側並排。
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
          label: '電表連線率(%)',
          rate: m.connectRate,
          trend: trendDelta(node, 'connect'),
          connected: m.connected,
          total: m.meterTotal,
          totalLabel: '電表總數',
          offline: offlineGap(m),
          calc: '已連線電表 / 電表總數',
          // 電表連線率顯示更新時間；DCU 連線率依會議決議移除
          showUpdate: true,
        }
      : {
          label: 'DCU連線率(%)',
          rate: dcu.rate,
          trend: dcuTrendDelta(node),
          connected: dcu.connected,
          total: dcu.total,
          totalLabel: 'DCU總數',
          offline: dcu.offline,
          calc: '已連線DCU / DCU總數',
          showUpdate: false,
        }

  return (
    <Card
      active={selected === 'connect'}
      onClick={() => selectKpi('connect')}
      className="px-3 py-3 min-w-0 flex flex-col justify-center relative group"
    >
      <ConnBlock {...block} />
      <InfoPopover title={block.label.replace('(%)', '')} align="left">
        <Note>計算方式：{block.calc}</Note>
        {block.showUpdate && <Note>資料更新時間：每小時（整點）</Note>}
        <Note>備註：排除停用</Note>
      </InfoPopover>
    </Card>
  )
}

/** one connection-rate block: [label+trend / big value] | [bar / 未連線·已連線·總數 並排] */
function ConnBlock({
  label,
  rate,
  trend,
  connected,
  total,
  totalLabel,
  offline,
}: {
  label: string
  rate: number
  trend: number
  connected: number
  total: number
  totalLabel: string
  offline: number
}) {
  const offlinePct = total > 0 ? (offline / total) * 100 : 0
  const offlineDelta = Math.max(1, Math.round(offline * 0.013)) // deterministic mock Δ
  // 未連線 / 斷線 一律紅色標示；連線率大字預設黑字，僅低於告警值 (<95%) 轉紅。
  const offAccent = status.danger.fg
  const rateAlert = isRateAlert(rate)

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* left: label / (value + trend 置數值右側、底部貼齊) */}
      <div className="shrink-0 flex flex-col gap-2 w-[164px]">
        <div className="px-1">
          <span className="text-[15px] font-semibold text-ink-sub tracking-[0.2px] whitespace-nowrap">{label}</span>
        </div>
        <div className="px-1 flex items-end gap-1.5">
          <div
            className="text-[31px] leading-none font-bold tabular-nums tracking-[0.2px]"
            style={{ color: rateAlert ? status.danger.fg : text.primary }}
          >
            {rate.toFixed(2)}
          </div>
          {/* 趨勢改放數值右側，底部與數值貼齊 */}
          <TrendArrow delta={trend} higherIsBetter align="left" />
        </div>
      </div>

      {/* right: empty-container bar → 未連線 · 已連線 · 總數 並排 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
        <div className="h-2 w-full rounded-[4px] overflow-hidden flex" style={{ background: chartNeutral.track }}>
          {/* only the problem share is filled */}
          <div style={{ width: `${Math.max(offlinePct, offline > 0 ? 1.5 : 0)}%`, background: offAccent }} />
        </div>

        {/* 未連線(紅, 含數量+趨勢) 置最左，並排 已連線 / 總數 */}
        <div className="flex items-end justify-between gap-1.5">
          {/* 未連線 — the highlighted problem record (leftmost) */}
          <div className="flex flex-col gap-0.5 items-start">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: offAccent }} />
              <span className="text-[12px]" style={{ color: offAccent }}>未連線</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[17px] font-bold tabular-nums leading-none" style={{ color: offAccent }}>
                {fmtInt(offline)}
              </span>
              <span
                className="trend-trigger group/trend relative inline-flex items-center text-[11px] font-medium tabular-nums cursor-default"
                style={{ color: offAccent }}
              >
                <TrendingUp size={12} strokeWidth={2.2} />
                {fmtInt(offlineDelta)}
                <TrendTip method="與前一小時相比" align="left" />
              </span>
            </div>
          </div>

          {/* 已連線 */}
          <div className="flex flex-col gap-0.5 items-end">
            <span className="text-[12px] text-ink-mut">已連線</span>
            <span className="text-[17px] font-bold text-ink tabular-nums leading-none">{fmtInt(connected)}</span>
          </div>

          {/* 總數 */}
          <div className="flex flex-col gap-0.5 items-end">
            <span className="text-[12px] text-ink-mut">{totalLabel}</span>
            <span className="text-[17px] font-bold text-ink tabular-nums leading-none">{fmtInt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
