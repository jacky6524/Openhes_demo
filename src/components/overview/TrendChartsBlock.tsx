import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtInt } from '@/lib/format'
import { neutral, overview, text } from '@/tokens'
import type { TrendPoint } from '@/data/systemOverview'
import { trends } from '@/data/systemOverview'

/**
 * 區塊 5：圖表區 —— 規格書 §5 參考畫面。
 * 五張過去 7 天的長條圖並排：電表總數 / 連線率 / 讀表率 / 停電數 / 事件數。
 *
 * 比率型（連線率、讀表率）固定 80–100 的 Y 軸，比照參考畫面，讓每天的細微
 * 落差看得出來；數量型則自動縮放。
 */
const CHARTS: {
  key: keyof Omit<TrendPoint, 'date'>
  title: string
  color: string
  unit: '數量' | '百分比'
  domain?: [number, number]
}[] = [
  { key: 'meterCount', title: '電表總數', color: overview.meterCount, unit: '數量' },
  { key: 'connectRatio', title: '連線率', color: overview.connect, unit: '百分比', domain: [80, 100] },
  { key: 'readRatio', title: '讀表率', color: overview.lp, unit: '百分比', domain: [80, 100] },
  { key: 'outage', title: '停電數', color: overview.outage, unit: '數量' },
  { key: 'event', title: '事件數', color: overview.event, unit: '數量' },
]

export function TrendChartsBlock() {
  return (
    <section className="grid grid-cols-5 gap-4">
      {CHARTS.map((c) => (
        <TrendChart key={c.key} spec={c} />
      ))}
    </section>
  )
}

function TrendChart({ spec: c }: { spec: (typeof CHARTS)[number] }) {
  const dataKey = c.key
  return (
    <div className="rounded-card bg-surface border border-border shadow-card px-3 pt-3 pb-2 flex flex-col">
      <div className="text-[13px] font-semibold text-ink-sub text-center">{c.title}</div>
      <div className="mt-1 h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trends} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={neutral.divider} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: text.tertiary }}
              tickLine={false}
              axisLine={{ stroke: neutral.border }}
              angle={-90}
              textAnchor="end"
              height={38}
              interval={0}
            />
            <YAxis
              width={46}
              tick={{ fontSize: 10, fill: text.tertiary }}
              tickLine={false}
              axisLine={false}
              domain={c.domain ?? ['auto', 'auto']}
              tickFormatter={(v: number) => (c.unit === '百分比' ? String(v) : fmtInt(v))}
            />
            <Tooltip
              cursor={{ fill: neutral.inset }}
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${neutral.border}`,
                fontSize: 12,
                boxShadow: '0 1px 2px rgba(42,33,37,.05), 0 6px 18px rgba(42,33,37,.08)',
              }}
              formatter={(v: number) => [c.unit === '百分比' ? `${v}%` : fmtInt(v), c.title]}
            />
            <Bar dataKey={dataKey} fill={c.color} maxBarSize={18} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-ink-mut">{c.unit}</div>
    </div>
  )
}
