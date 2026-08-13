import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { ReadGauge } from './ReadGauge'
import { useCurrentNode, useScopeLabel } from '@/store/useDashboard'
import { classify, THRESHOLDS, isRateAlert } from '@/config/thresholds'
import { fmtInt } from '@/lib/format'
import { chartNeutral, neutral, status, text as textTok } from '@/tokens'

/**
 * LP/MN/ALT 14 日讀表曲線 · 連線/讀表概況卡（依會議調整）：
 *   ┌──────────┬─────────────────────────────┬──────────────────┐
 *   │ 圓餅       │ LP / MN / ALT 三線面積圖      │ 柱狀 LP/MN/ALT    │
 *   │ 連線率(即時)│ (近 14 天 · 每日結算)         │ (即時讀表率)       │
 *   └──────────┴─────────────────────────────┴──────────────────┘
 * 頁籤＝通訊類型 ALL / RF / NB / LTE（切換影響三區數值）。
 * 折線三線全顯（加深加粗以利辨識，非背景圖）。圓餅／柱狀／折線皆有「資料更新」hover。
 */

// 折線用較深的線色（辨識度），漸層填色維持淺色
const LINE = { lp: '#5E5CE6', midnight: '#1FA8CC', alt: '#EF5B57' }
const SERIES: { key: 'lp' | 'midnight' | 'alt'; label: string; color: string }[] = [
  { key: 'lp', label: 'LP 讀表率', color: LINE.lp },
  { key: 'midnight', label: 'MN 午夜讀表率', color: LINE.midnight },
  { key: 'alt', label: 'ALT 讀表率', color: LINE.alt },
]

const DAYS = 14

// 通訊類型頁籤 — off 為 demo 用的數值偏移，讓切換看得出差異
const COMM = [
  { key: 'all', label: 'ALL', off: 0 },
  { key: 'rf', label: 'RF', off: 0.6 },
  { key: 'nb', label: 'NB', off: -1.6 },
  { key: 'lte', label: 'LTE', off: 0.4 },
] as const
type CommKey = (typeof COMM)[number]['key']

// 與上方讀表率等指標計算相同
const UPDATE_NOTE = '資料更新時間：每小時（整點）'
const EXCLUDE_NOTE = '備註：排除停用'
// 時間軸（近 14 天曲線）為每日結算，不顯示更新時間，改註記結算時點
const DAILY_NOTE = '備註：每日資料統計時間為隔日 01:00'

/** 各讀表類型的產生頻率說明（柱狀圖 hover） */
const FREQ_NOTE: Record<'lp' | 'midnight' | 'alt', string> = {
  lp: 'LP 每 15 分鐘產生一筆，每日 96 筆',
  alt: 'ALT 每小時一筆，每日 24 筆',
  midnight: 'MN 每日 1 筆',
}

export function SharedMetricCard() {
  const node = useCurrentNode()
  const scope = useScopeLabel()
  const [comm, setComm] = useState<CommKey>('all')
  const off = COMM.find((c) => c.key === comm)!.off
  const m = node.metrics

  // 圓餅：連線率(即時)；著色綁連線率健康 (良好=中性/注意=黃/警告=紅)
  const gaugeValue = clamp(m.connectRate + off, 0, 100)
  const gaugeHealth = classify(gaugeValue, THRESHOLDS.connect)

  // 折線：近 14 天三線
  const series = useMemo(() => {
    const base = { lp: m.lpRate, midnight: m.midnightRate, alt: m.altRate }
    return Array.from({ length: DAYS }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      const row: any = { d: day }
      for (const s of SERIES) {
        const r = lcg(hash(node.id + s.key + i))
        const wobble = (r() - 0.5) * 24
        const wave = Math.sin((i / (DAYS - 1)) * Math.PI * 2 + s.key.length) * 7
        row[s.key] = clamp(Math.round(base[s.key] + off - 26 + wobble + wave), 18, 100)
      }
      return row
    })
  }, [node.id, m, off])

  // 柱狀：LP / MN / ALT 即時讀表率
  const bars = useMemo(() => {
    return SERIES.map((s) => {
      const rate = clamp((s.key === 'lp' ? m.lpRate : s.key === 'midnight' ? m.midnightRate : m.altRate) + off, 0, 100)
      const read = Math.round((rate / 100) * m.meterTotal)
      return { key: s.key, label: s.label.split(' ')[0], color: s.color, rate, read, total: m.meterTotal, unread: m.meterTotal - read }
    })
  }, [m, off])

  return (
    <Card className="p-3">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[16px] font-semibold text-ink">連線・讀表概況</h3>
          <span className="text-[12px] text-ink-sub">{scope} · 近 {DAYS} 天</span>
        </div>
        {/* 通訊類型頁籤 */}
        <div className="inline-flex rounded-lg bg-inset p-0.5 border border-border">
          {COMM.map((c) => (
            <button
              key={c.key}
              onClick={() => setComm(c.key)}
              className={[
                'px-3 py-1 text-[12px] font-medium rounded-md transition-colors',
                comm === c.key ? 'bg-surface text-brand shadow-sm' : 'text-ink-sub hover:text-ink',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-stretch gap-4">
        {/* left — gauge：連線率（環色連動連線率門檻；hover 說明計算方式） */}
        <div className="relative group/hc flex flex-col items-center justify-center shrink-0 cursor-default">
          <ReadGauge value={gaugeValue} caption="連線率" health={gaugeHealth} decimals={2} />
          <HoverCard align="left">
            <HoverTitle>連線率</HoverTitle>
            <HoverLine>計算方式：已連線電表 / 電表總數</HoverLine>
            <HoverLine>{UPDATE_NOTE}</HoverLine>
            <HoverLine>{EXCLUDE_NOTE}</HoverLine>
          </HoverCard>
        </div>

        {/* center — 3-series area chart, 14 days, all lines visible */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-center gap-4 mb-1">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[12px] text-ink-sub">{s.label}</span>
              </div>
            ))}
            <span className="relative group/hc text-ink-mut cursor-default inline-flex">
              <Info size={12} />
              <HoverCard>
                <HoverTitle>近 {DAYS} 天讀表曲線</HoverTitle>
                <HoverLine>{DAILY_NOTE}</HoverLine>
              </HoverCard>
            </span>
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke={neutral.divider} vertical={false} />
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 10, fill: textTok.tertiary }}
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: neutral.border }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[20, 40, 60, 80, 100]}
                  tick={{ fontSize: 10, fill: textTok.tertiary }}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
                <Tooltip
                  cursor={{ stroke: neutral.border }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg bg-surface border border-border shadow-card px-2.5 py-1.5 text-[11px]">
                        <div className="font-semibold text-ink mb-0.5">{label} 日</div>
                        {payload.map((p: any) => (
                          <div key={p.dataKey} className="flex items-center gap-1.5 text-ink-sub">
                            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                            {p.name}：<b className="text-ink tabular-nums">{p.value}%</b>
                          </div>
                        ))}
                        <div className="mt-1 pt-1 border-t border-divider text-ink-mut">{DAILY_NOTE}</div>
                      </div>
                    )
                  }}
                />
                {SERIES.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.2}
                    strokeOpacity={1}
                    fill={`url(#grad-${s.key})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* right — LP / MN / ALT 即時讀表率柱狀（空容器只填未讀，紅色 <95%）；
            讀表率兩位小數；讀表數/總數 與計算頻率移入各列 hover */}
        <div className="shrink-0 w-[190px] flex flex-col justify-center gap-3.5">
          {bars.map((b) => {
            const alert = isRateAlert(b.rate)
            const unreadPct = b.total > 0 ? (b.unread / b.total) * 100 : 0
            return (
              <div key={b.key} className="relative group/hc cursor-default">
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="font-semibold" style={{ color: b.color }}>{b.label}</span>
                  <b className="tabular-nums" style={{ color: alert ? status.danger.fg : textTok.primary }}>
                    {b.rate.toFixed(2)}%
                  </b>
                </div>
                <div className="mt-1 h-2 w-full rounded-[4px] overflow-hidden flex" style={{ background: chartNeutral.track }}>
                  <div style={{ width: `${Math.max(unreadPct, b.unread > 0 ? 1.5 : 0)}%`, background: status.danger.fg }} />
                </div>
                <HoverCard align="right">
                  <HoverTitle>{b.label} 讀表率</HoverTitle>
                  <HoverLine>讀表數 / 總數：{fmtInt(b.read)} / {fmtInt(b.total)}</HoverLine>
                  <HoverLine>{FREQ_NOTE[b.key]}</HoverLine>
                  <HoverLine>{UPDATE_NOTE}</HoverLine>
                </HoverCard>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/* ---- 統一 hover 樣式（無問號游標；父層需帶 group/hc） ---- */
function HoverCard({ children, align = 'center' }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  const pos = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  return (
    <span
      className={`pointer-events-none absolute bottom-full ${pos} mb-2 z-40 w-[228px] opacity-0 translate-y-1 transition-all duration-150 group-hover/hc:opacity-100 group-hover/hc:translate-y-0`}
    >
      <span className="block rounded-lg bg-surface border border-border shadow-card px-3 py-2 text-left">
        {children}
      </span>
    </span>
  )
}
function HoverTitle({ children }: { children: React.ReactNode }) {
  return <span className="block text-[12px] font-semibold text-ink mb-1">{children}</span>
}
function HoverLine({ children }: { children: React.ReactNode }) {
  return <span className="block py-0.5 text-[11px] text-ink-sub leading-snug">{children}</span>
}

/* helpers */
function hash(s: string) {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return x >>> 0
}
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
