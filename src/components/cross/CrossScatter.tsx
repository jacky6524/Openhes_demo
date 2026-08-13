import { useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { Info } from 'lucide-react'
import { useDashboard, useCurrentNode, useScopeLabel } from '@/store/useDashboard'
import { getById } from '@/data/mockData'
import { METRIC_FIELD, METRIC_LABEL } from '@/config/thresholds'
import { Card } from '@/components/ui/Card'
import { series as seriesTok, status, text as textTok, neutral } from '@/tokens'
import type { MetricKey } from '@/types'

const UPDATE_NOTE = '資料更新時間：每小時（整點）'
const EXCLUDE_NOTE = '備註：排除停用'

// 紅區定義（7/24 會議）：連線率 ≥ 98% 且 讀表率 < 90% ＝ 連得上卻讀不到
const CONNECT_CUT = 98
const READ_CUT = 90

/* 正常點與下方讀表率圖同色系 (LP indigo)，紅色只留給異常 — 視覺風格綁定對應 */
const DOT_FILL = seriesTok.lp
const DOT_STROKE = '#4644B8'

/**
 * Cross-compare (§4.3): x=連線率, y=讀表率(固定 LP), point=region at current level.
 * 紅底區 = 連線率 ≥ 98% 且 讀表率 < 90%（連得上卻讀不到）；該區內的點染紅。
 * 右上角讀表指標固定為 LP，不隨上方讀表區塊點選改變。點大小 = DCU 斷線數。
 */
export function CrossScatter() {
  const node = useCurrentNode()
  const scope = useScopeLabel()
  const drillInto = useDashboard((s) => s.drillInto)

  // 讀表軸固定 LP（14g）— 不隨 selectedKpi 改變
  const readKey: MetricKey = 'lp'

  const data = useMemo(() => {
    // 無智慧電表的子區域沒有連線/讀表數據，排除以免落在原點形成假異常點
    const kids = (node.children ?? []).filter((c) => c.metrics.meterTotal > 0)
    return kids.map((c) => ({
      x: c.metrics.connectRate,
      y: c.metrics[METRIC_FIELD[readKey]],
      z: c.metrics.dhcDisconnect,
      name: c.name,
      id: c.id,
      anomaly: c.metrics.connectRate >= CONNECT_CUT && c.metrics[METRIC_FIELD[readKey]] < READ_CUT,
    }))
  }, [node])

  const xMin = Math.min(90, ...data.map((d) => d.x)) - 0.5
  const yMin = Math.min(82, ...data.map((d) => d.y)) - 0.5

  return (
    <Card className="p-3.5 h-full flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <div className="relative group/hc flex items-center gap-1.5 cursor-default">
          <h3 className="text-[13px] font-semibold text-ink">連線率 × 讀表率比對</h3>
          <span className="text-ink-mut leading-none inline-flex">
            <Info size={13} />
          </span>
          {/* 14a：點 / 紅底區等說明移至標題 hover */}
          <span className="pointer-events-none absolute top-full left-0 mt-2 z-40 w-[268px] opacity-0 translate-y-1 transition-all duration-150 group-hover/hc:opacity-100 group-hover/hc:translate-y-0">
            <span className="block rounded-lg bg-surface border border-border shadow-card px-3 py-2 text-left">
              <span className="block text-[12px] font-semibold text-ink mb-1">連線率 × 讀表率比對</span>
              <span className="block py-0.5 text-[11px] text-ink-sub leading-snug">點（區域）：大小 = DCU 斷線數</span>
              <span className="block py-0.5 text-[11px] text-ink-sub leading-snug">{UPDATE_NOTE}</span>
              <span className="block py-0.5 text-[11px] text-ink-sub leading-snug">{EXCLUDE_NOTE}</span>
            </span>
          </span>
        </div>
        <span className="text-[11px] text-ink-mut">{scope} · {METRIC_LABEL[readKey]}</span>
      </div>

      <div className="flex-1 min-h-[220px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={neutral.divider} />
            {/* focus quadrant shading: 連線率 ≥98% 且 讀表率 <90% = 連得上卻讀不到 */}
            <ReferenceArea
              x1={CONNECT_CUT}
              x2={100}
              y1={yMin}
              y2={READ_CUT}
              fill={status.danger.bg}
              fillOpacity={0.5}
              label={{
                value: '連得上卻讀不到',
                position: 'insideBottomRight',
                fontSize: 10,
                fill: status.danger.fg,
              }}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[xMin, 100]}
              tick={{ fontSize: 10, fill: textTok.tertiary }}
              tickFormatter={(v) => `${v}`}
              label={{ value: '連線率 (%)', position: 'insideBottom', offset: -8, fontSize: 10, fill: textTok.secondary }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[yMin, 100]}
              tick={{ fontSize: 10, fill: textTok.tertiary }}
              label={{ value: '讀表率 (%)', angle: -90, position: 'insideLeft', fontSize: 10, fill: textTok.secondary }}
            />
            <ZAxis type="number" dataKey="z" range={[70, 560]} />
            <ReferenceLine x={CONNECT_CUT} stroke={textTok.tertiary} strokeDasharray="4 4" />
            <ReferenceLine y={READ_CUT} stroke={textTok.tertiary} strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="rounded-lg bg-surface border border-border shadow-card px-2.5 py-1.5 text-[11px]">
                    <div className="font-semibold text-ink">{d.name}</div>
                    <div className="text-ink-sub">連線率 {d.x}% · 讀表率 {d.y}%</div>
                    <div className="text-ink-sub">DCU 斷線 {d.z}</div>
                    <div className="mt-1 pt-1 border-t border-divider text-ink-mut">{UPDATE_NOTE}</div>
                  </div>
                )
              }}
            />
            <Scatter
              data={data}
              isAnimationActive={false}
              onClick={(p: any) => {
                const n = p?.id && getById(p.id)
                if (n) drillInto(n)
              }}
            >
              {data.map((d) => (
                <Cell
                  key={d.id}
                  fill={d.anomaly ? status.danger.fg : DOT_FILL}
                  fillOpacity={d.anomaly ? 0.9 : 0.72}
                  stroke={d.anomaly ? status.danger.fg : DOT_STROKE}
                  strokeWidth={1}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
