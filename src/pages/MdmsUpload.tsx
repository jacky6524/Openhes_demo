import { useMemo, useState } from 'react'
import { ArrowRight, LayoutGrid, LineChart as LineChartIcon } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageTitle } from '@/components/shared/PageTitle'
import { TargetSearch, FIELD_BOX, type TargetMode } from '@/components/shared/TargetSearch'
import { status as statusTok } from '@/tokens'
import {
  MDMS_TYPES, DEFAULT_MDMS_KEYS, MDMS_ALERT, buckets, fmtStamp, parseLocal,
  type MdmsBucket, type MdmsKey, type MdmsType,
} from '@/data/mdmsUpload'

/**
 * 讀表管理 · MDMS上拋（設計稿「MDMS上拋-1」圖表檢視、「MDMS上拋-2」卡片檢視）。
 *
 * 條件：表號／電號／群組、資料類型（複選）、上拋電表資料時間（區間）。右上角兩顆圖示切換檢視：
 *   圖表  各類型最新時段的達成率卡片＋趨勢分析折線圖（LP／ALT／MN… 頁籤、90% 注意線、低於注意線的時段紅帶）
 *   卡片  每種類型一區，每個時段一張達成率卡片（新→舊）
 * 達成率＝已上拋／總數，低於 MDMS_ALERT 以紅色顯示。資料全為 mock（data/mdmsUpload.ts）。
 */
const GREEN = statusTok.normal.fg
const RED = statusTok.danger.fg
const BLUE = statusTok.info.fg
const GRID_LIMIT = 24 // 卡片檢視每種類型最多顯示的時段數（日期範圍拉長時不爆版）
const CHART_LIMIT = 192

interface Applied {
  mode: TargetMode
  text: string
  keys: MdmsKey[]
  from: string
  to: string
}
const DEFAULT: Applied = { mode: 'meterNo', text: '', keys: DEFAULT_MDMS_KEYS, from: '2026-01-02T11:00', to: '2026-01-02T15:00' }

const toneOf = (pct: number) => (pct < MDMS_ALERT ? RED : GREEN)
const fmtN = (n: number) => n.toLocaleString('en-US')

export function MdmsUpload() {
  const [draft, setDraft] = useState<Applied>(DEFAULT)
  const [applied, setApplied] = useState<Applied>(DEFAULT)
  const [view, setView] = useState<'chart' | 'grid'>('chart')
  const set = <K extends keyof Applied>(k: K, v: Applied[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const toggleKey = (k: MdmsKey) =>
    set('keys', draft.keys.includes(k) ? draft.keys.filter((x) => x !== k) : [...draft.keys, k])
  const search = () => setApplied(draft)
  const clear = () => { setDraft(DEFAULT); setApplied(DEFAULT) }

  // 每種已勾選的類型 → 範圍內各時段（新→舊）。起訖顛倒時自動對調
  const series = useMemo(() => {
    const a = parseLocal(applied.from) ?? 0
    const b = parseLocal(applied.to) ?? 0
    const [from, to] = a <= b ? [a, b] : [b, a]
    const scale = applied.text.trim() ? `${applied.mode}:${applied.text.trim()}` : ''
    return MDMS_TYPES.filter((t) => applied.keys.includes(t.key)).map((type) => ({ type, rows: buckets(type, from, to, scale) }))
  }, [applied])

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="MDMS上拋" />

      <div className="flex flex-col gap-2">
        <TargetSearch label="重新上傳MDMS" mode={draft.mode} text={draft.text} onMode={(m) => set('mode', m)} onText={(v) => set('text', v)} onEnter={search} />
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="px-2 text-[12px] text-ink-sub">資料類型</span>
            <div className="flex h-[38px] items-center gap-4 px-2">
              {MDMS_TYPES.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-ink">
                  <input type="checkbox" checked={draft.keys.includes(t.key)} onChange={() => toggleKey(t.key)} className="size-4 cursor-pointer accent-danger" />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="px-2 text-[12px] text-ink-sub">上拋電表資料時間</span>
            <div className={`${FIELD_BOX} flex items-center gap-2 py-[5px]`}>
              <input type="datetime-local" value={draft.from} onChange={(e) => set('from', e.target.value)} className="bg-transparent text-[13px] tabular-nums text-ink focus:outline-none" />
              <ArrowRight size={14} className="text-ink-mut" />
              <input type="datetime-local" value={draft.to} onChange={(e) => set('to', e.target.value)} className="bg-transparent text-[13px] tabular-nums text-ink focus:outline-none" />
            </div>
          </label>
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button onClick={search} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            搜尋
          </button>
          <div className="ml-auto flex items-center gap-2 pb-1.5">
            <ViewBtn active={view === 'chart'} title="圖表檢視" onClick={() => setView('chart')}><LineChartIcon size={20} /></ViewBtn>
            <ViewBtn active={view === 'grid'} title="卡片檢視" onClick={() => setView('grid')}><LayoutGrid size={20} /></ViewBtn>
          </div>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-card border border-border bg-surface py-16 text-center text-[13px] text-ink-mut shadow-card">請至少勾選一種資料類型</div>
      ) : view === 'chart' ? (
        <ChartView series={series} />
      ) : (
        <GridView series={series} />
      )}
    </div>
  )
}

type Series = Array<{ type: MdmsType; rows: MdmsBucket[] }>

/* ───────────────────────── 圖表檢視 ───────────────────────── */

const SHORT: Record<MdmsKey, string> = { LP: 'LP', ALT: 'ALT', MN: 'MN', PQ: 'PQ', DRR: 'DRR' }

function ChartView({ series }: { series: Series }) {
  const [pick, setPick] = useState<MdmsKey>('LP')
  const cur = series.find((s) => s.type.key === pick) ?? series[0]

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {series.map(({ type, rows }) => (
          <RateCard key={type.key} title={type.title} b={rows[0]} fmt={type.stepMin >= 1440 ? 'date' : 'time'} big />
        ))}
      </div>
      <TrendPanel series={series} cur={cur} onPick={setPick} />
    </>
  )
}

function TrendPanel({ series, cur, onPick }: { series: Series; cur: Series[number]; onPick: (k: MdmsKey) => void }) {
  const daily = cur.type.stepMin >= 1440
  // 進行中的時段才剛開始上拋，不是真的掉線，不畫進趨勢
  const settled = cur.rows.filter((r) => !r.inProgress)
  const excluded = settled.length < cur.rows.length
  const points = useMemo(() => {
    const multiDay = settled.length > 1 && settled[0].ts - settled[settled.length - 1].ts >= 86_400_000
    return settled
      .slice(0, CHART_LIMIT)
      .reverse()
      .map((r) => ({
        ...r,
        label: daily ? fmtStamp(r.ts, false).slice(5) : multiDay ? fmtStamp(r.ts).slice(5) : fmtStamp(r.ts).slice(11),
        dip: r.pct < MDMS_ALERT ? 100 : 0,
      }))
  }, [settled, daily])

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-ink">趨勢分析</h2>
          <span className="text-[12px] text-ink-mut">{cur.type.cadence}{excluded && ' · 不含進行中時段'}</span>
        </div>
        <div className="inline-flex rounded-full bg-inset p-1">
          {series.map(({ type }) => {
            const on = type.key === cur.type.key
            return (
              <button
                key={type.key}
                onClick={() => onPick(type.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-bold transition-colors ${on ? 'bg-surface text-brand shadow-card' : 'text-ink-sub'}`}
              >
                {SHORT[type.key]}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-2 text-[12px] text-ink-mut">%</div>
      {points.length === 0 ? (
        <div className="grid h-[320px] place-items-center text-[13px] text-ink-mut">這個區間沒有已完成的時段</div>
      ) : (
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEE7E9" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8A7F83' }} minTickGap={24} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8A7F83' }} width={36} />
              <Tooltip content={<TrendTip />} cursor={{ stroke: '#C9C0C3', strokeDasharray: '3 3' }} />
              <Bar dataKey="dip" fill={RED} fillOpacity={0.2} barSize={36} isAnimationActive={false} />
              <ReferenceLine y={MDMS_ALERT} stroke={RED} strokeDasharray="3 3" label={{ value: '注意', position: 'right', fill: RED, fontSize: 12 }} />
              <Line dataKey="pct" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3.5, fill: '#fff', stroke: BLUE, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TrendTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MdmsBucket }> }) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] shadow-card">
      <div className="mb-2 text-ink">{fmtStamp(p.ts, true, '.')}</div>
      <TipRow k="達成率" v={`${p.pct.toFixed(2)}%`} color={toneOf(p.pct)} />
      <TipRow k="已上拋" v={fmtN(p.uploaded)} />
      <TipRow k="總數" v={fmtN(p.total)} />
    </div>
  )
}
function TipRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-8 leading-6">
      <span className="text-ink-sub">{k}</span>
      <span className="font-semibold tabular-nums text-ink" style={color ? { color } : undefined}>{v}</span>
    </div>
  )
}

/* ───────────────────────── 卡片檢視 ───────────────────────── */

function GridView({ series }: { series: Series }) {
  return (
    <div className="flex flex-col gap-5">
      {series.map(({ type, rows }) => (
        <section key={type.key} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="h-4 w-[3px] self-center rounded-full bg-danger" />
            <h2 className="text-[15px] font-semibold text-ink">{type.title}</h2>
            <span className="text-[12px] text-ink-mut">{type.cadence}</span>
            {rows.length > GRID_LIMIT && <span className="text-[12px] text-ink-mut">· 僅顯示最新 {GRID_LIMIT} 個時段</span>}
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {rows.slice(0, GRID_LIMIT).map((b) => (
              <RateCard key={b.ts} b={b} fmt={type.stepMin >= 1440 ? 'date' : 'time'} />
            ))}
            {rows.length === 0 && <div className="text-[13px] text-ink-mut">這個區間沒有時段</div>}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ───────────────────────── 共用：達成率卡片 ───────────────────────── */

function RateCard({ title, b, fmt, big }: { title?: string; b?: MdmsBucket; fmt: 'date' | 'time'; big?: boolean }) {
  if (!b) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-[13px] text-ink-mut shadow-card">
        {title && <div className="mb-2 font-semibold text-ink">{title}</div>}這個區間沒有時段
      </div>
    )
  }
  const color = toneOf(b.pct)
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-divider px-4 py-2.5 text-[12px] text-ink-mut">
        <span className={title ? 'text-[14px] font-semibold text-ink' : 'tabular-nums'}>{title ?? fmtStamp(b.ts, fmt === 'time')}</span>
        {title && <span className="tabular-nums">{fmtStamp(b.ts, fmt === 'time')}</span>}
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-baseline gap-1 font-bold tabular-nums" style={{ color, fontSize: big ? 40 : 34, lineHeight: 1.1 }}>
          {b.pct.toFixed(2)}<span className="text-[12px] font-medium">%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-inset">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, background: color }} />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-sub">
          <span>已上拋</span><span>總數</span>
        </div>
        <div className="flex justify-between text-[14px] font-bold tabular-nums text-ink">
          <span>{fmtN(b.uploaded)}</span><span>{fmtN(b.total)}</span>
        </div>
      </div>
    </div>
  )
}

function ViewBtn({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={active} className={`grid size-8 place-items-center rounded-lg transition-colors ${active ? 'text-brand' : 'text-ink-mut hover:text-ink'}`}>
      {children}
    </button>
  )
}
