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
import { Card } from '@/components/ui/Card'
import { ReadGauge } from './ReadGauge'
import { useCurrentNode, useScopeLabel } from '@/store/useDashboard'
import { classify, THRESHOLDS } from '@/config/thresholds'
import { fmtInt } from '@/lib/format'
import { status, text as textTok, RATE_BAR } from '@/tokens'

/**
 * 讀表 × 連線概況 — 對齊前端 `.trend-panel`：
 *   ┌──────────┬─────────────────────────────┬──────────────────┐
 *   │ 環形      │ LP / MN / ALT 近 14 天折線     │ LP/MN/ALT 讀表率  │
 *   │ 連線率     │ (每日結算)                    │ + 缺口紅色進度條   │
 *   └──────────┴─────────────────────────────┴──────────────────┘
 *   .trend-content  grid `minmax(118px,.8fr) minmax(240px,2fr) minmax(140px,1fr)`
 *   .trend-chart    高 168px（矮螢幕 clamp(116px,16vh,150px)）
 *   .device-list    gap 14；head 14/800；progress 9px 軌道 #e7e2e4
 *
 * 頁籤＝通訊類型 ALL / RF / NB / LTE（切換影響三區數值）。
 *
 * 2026-11-17 同步正式機截圖：
 *   · 副標只留範圍（拿掉「· 近 14 天」）；折線放進淺灰圓角底板，上方標題「近14日讀表趨勢」
 *     （2026-11-19 業主：淺灰底板拿掉，折線直接放在卡片白底上）
 *   · X 軸為實際日期（今天往前 14 天），Y 軸貼近資料範圍（整數刻度），不再固定 0–100
 *   · 右欄進度條改為依讀表率填滿（原本只填未讀缺口），色用淡藍 RATE_BAR（業主要求避開告警色），數值一律黑字一位小數
 *   · 環形連線率一位小數
 */

/**
 * 折線色 — 與前端 trendChartSeries 的 color 完全相同。
 * （prototype 舊版為了辨識度自行加深過，現統一回前端色票。）
 */
const SERIES: { key: 'lp' | 'midnight' | 'alt'; label: string; short: string; color: string }[] = [
  { key: 'lp', label: 'LP 讀表率', short: 'LP', color: '#5E5CE6' },
  { key: 'midnight', label: 'MN 午夜讀表率', short: 'MN', color: '#64D2FF' },
  { key: 'alt', label: 'ALT 讀表率', short: 'ALT', color: '#FF858D' },
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

/** 各讀表類型的產生頻率說明（右欄 hover） */
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

  // 環形：連線率(即時)；著色綁連線率健康 (良好=綠/注意=黃/警告=紅，色值見 tokens.health)
  const gaugeValue = clamp(m.connectRate + off, 0, 100)
  const gaugeHealth = classify(gaugeValue, THRESHOLDS.connect)

  // 折線：近 14 天三線（含今天）。前 13 天為已結算值，在目前值上方小幅起伏；
  // 最後一天＝今天，即目前值（當日尚未結算完，所以通常比前幾天低一截，與正式機曲線尾端下彎一致）
  const series = useMemo(() => {
    const base = { lp: m.lpRate, midnight: m.midnightRate, alt: m.altRate }
    const today = new Date()
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - (DAYS - 1 - i))
      const row: any = { d: String(d.getDate()).padStart(2, '0') }
      for (const s of SERIES) {
        const v = base[s.key] + off
        if (i === DAYS - 1) { row[s.key] = round1(clamp(v, 0, 100)); continue }
        const r = lcg(hash(node.id + s.key + i))
        const lift = 0.6 + (lcg(hash(node.id + s.key))() * 0.8) // 該線整體高於今天 0.6–1.4
        const wobble = (r() - 0.5) * 0.35
        const wave = Math.sin((i / (DAYS - 1)) * Math.PI * 2 + s.key.length) * 0.12
        row[s.key] = round1(clamp(v + lift + wobble + wave, 0, 100))
      }
      return row
    })
  }, [node.id, m, off])

  // Y 軸貼近資料：上下各留一點空間後取整數
  const yDomain = useMemo(() => {
    const vals = series.flatMap((r: any) => SERIES.map((s) => r[s.key] as number))
    const lo = Math.max(0, Math.floor(Math.min(...vals) - 0.3))
    const hi = Math.min(100, Math.ceil(Math.max(...vals) + 0.3))
    return { lo, hi, ticks: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) }
  }, [series])

  // 右欄：LP / MN / ALT 即時讀表率
  const rates = useMemo(() => {
    return SERIES.map((s) => {
      const rate = clamp((s.key === 'lp' ? m.lpRate : s.key === 'midnight' ? m.midnightRate : m.altRate) + off, 0, 100)
      const read = Math.round((rate / 100) * m.meterTotal)
      return { key: s.key, label: s.short, rate, read, total: m.meterTotal, unread: m.meterTotal - read }
    })
  }, [m, off])

  return (
    <Card className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3 [@media(max-height:943px)]:gap-1.5 [@media(max-height:943px)]:py-2.5">
      {/* .panel-header */}
      <header className="flex w-full shrink-0 items-center justify-between gap-3">
        <div className="group/hc relative flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1.5">
          <strong className="cursor-default overflow-hidden text-ellipsis text-[16px] font-semibold leading-6 tracking-[1px] text-ink">
            讀表 × 連線概況
          </strong>
          <span className="text-[12px] font-normal leading-4 tracking-[0.2px] text-ink-mut">{scope}</span>
          <HoverCard align="left">
            <HoverTitle>近 {DAYS} 天讀表曲線</HoverTitle>
            <HoverLine>{DAILY_NOTE}</HoverLine>
          </HoverCard>
        </div>

        {/* .segmented — 通訊類型頁籤 */}
        <div
          className="inline-flex shrink-0 rounded-full p-1"
          style={{ background: '#F0EDEF', boxShadow: 'inset 0 1px 4px rgba(58,42,48,.08)' }}
          aria-label="通訊類型"
        >
          {COMM.map((c) => {
            const active = comm === c.key
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => setComm(c.key)}
                className="min-w-[50px] rounded-full px-3 py-2 text-[14px] font-bold leading-[1.2] transition-colors"
                style={
                  active
                    ? { background: '#FFF', boxShadow: '0 2px 8px rgba(58,42,48,.12)', color: status.danger.fg }
                    : { color: '#62585C' }
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* .trend-content */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(118px,0.8fr)_minmax(240px,2fr)_minmax(140px,1fr)] items-center gap-3 [@media(max-height:943px)]:gap-2.5">
        {/* .trend-ring — 連線率（環色連動連線率門檻；hover 說明計算方式） */}
        <div className="group/hc relative grid place-items-center self-center">
          <ReadGauge value={gaugeValue} caption="連線率" health={gaugeHealth} decimals={1} />
          <HoverCard align="left">
            <HoverTitle>連線率</HoverTitle>
            <HoverLine>計算方式：已連線電表 / 電表總數</HoverLine>
            <HoverLine>{UPDATE_NOTE}</HoverLine>
            <HoverLine>{EXCLUDE_NOTE}</HoverLine>
          </HoverCard>
        </div>

        {/* .trend-chart — 三線面積圖，14 天；淺灰底板＋標題（正式機版式） */}
        <div className="min-h-0 min-w-0 px-2 pb-1.5 pt-2.5">
          <div className="mb-1 text-center text-[13px] font-semibold text-ink-sub">近{DAYS}日讀表趨勢</div>
          {/* 圖例：對齊前端 echarts legend（top center、roundRect 10×7、9px #40373b） */}
          <div className="mb-1.5 flex items-center justify-center gap-4">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-[7px] w-2.5 rounded-[2px]" style={{ background: s.color }} />
                <span className="text-[9px] font-medium text-[#40373B]">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="h-[140px] [@media(max-height:943px)]:h-[clamp(100px,13vh,124px)]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      {/* 前端 areaStyle：0.16 → 0.02 */}
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#E8DDE1" vertical={false} />
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 10, fill: '#9A8C91' }}
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: '#DDD3D6' }}
                />
                <YAxis
                  domain={[yDomain.lo, yDomain.hi]}
                  ticks={yDomain.ticks}
                  allowDataOverflow
                  tick={{ fontSize: 10, fill: '#9A8C91' }}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
                <Tooltip
                  cursor={{ stroke: '#CFC4C8', strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div
                        className="min-w-[220px] rounded-[10px] border px-[18px] py-4"
                        style={{
                          borderColor: '#E3D8DC',
                          background: 'rgba(255,255,255,.97)',
                          boxShadow: '0 10px 28px rgba(58,42,48,.16)',
                        }}
                      >
                        <div className="mb-2 text-[15px] font-bold text-ink">{label} 日</div>
                        {payload.map((p: any) => (
                          <div key={p.dataKey} className="flex items-center gap-2 whitespace-nowrap text-[13px] leading-[1.9]">
                            <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: p.color }} />
                            <span className="text-ink-sub">{p.name}</span>
                            <strong className="ml-auto font-medium tabular-nums text-ink">{p.value}%</strong>
                          </div>
                        ))}
                        <div className="mt-2.5 whitespace-nowrap border-t border-border pt-[9px] text-[12px] text-ink-mut">
                          {DAILY_NOTE}
                        </div>
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
                    strokeWidth={1.8}
                    strokeOpacity={0.95}
                    fill={`url(#grad-${s.key})`}
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* .device-list — LP / MN / ALT 即時讀表率＋缺口紅條 */}
        <div className="grid min-w-0 content-center gap-3.5 self-center py-1 [@media(max-height:943px)]:gap-2.5">
          {rates.map((b) => {
            const fillPct = Math.max(0, Math.min(100, b.rate))
            return (
              <div key={b.key} className="group/hc relative grid min-w-0 cursor-default gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <strong className="min-w-0 flex-1 text-[14px] font-extrabold text-ink">{b.label}</strong>
                  <b className="shrink-0 text-[14px] font-extrabold tabular-nums" style={{ color: textTok.primary }}>
                    {b.rate.toFixed(1)}%
                  </b>
                </div>
                {/* .device-progress — 軌道中性，依讀表率填滿淡藍（正式機為紅，業主要求避開告警色） */}
                <div className="mt-px h-[9px] overflow-hidden rounded-full" style={{ background: '#E7E2E4' }}>
                  <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: RATE_BAR }} />
                </div>
                <HoverCard align="right">
                  <HoverTitle>{b.label} 讀表率</HoverTitle>
                  <HoverLine>
                    讀表數 / 總數：{fmtInt(b.read)} / {fmtInt(b.total)}
                  </HoverLine>
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
      className={`pointer-events-none absolute bottom-full ${pos} z-40 mb-2 w-[228px] translate-y-1 opacity-0 transition-all duration-150 group-hover/hc:translate-y-0 group-hover/hc:opacity-100`}
    >
      <span className="block rounded-lg border border-border bg-surface px-3 py-2 text-left shadow-card">{children}</span>
    </span>
  )
}
function HoverTitle({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] font-semibold text-ink">{children}</span>
}
function HoverLine({ children }: { children: React.ReactNode }) {
  return <span className="block py-0.5 text-[11px] leading-snug text-ink-sub">{children}</span>
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
const round1 = (n: number) => Math.round(n * 10) / 10
