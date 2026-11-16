import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageTitle } from '@/components/shared/PageTitle'
import { TargetSearchMulti, parseTargets, type TargetMode } from '@/components/shared/TargetSearch'
import { Field, GroupSelect, MultiSelect, QueryButtons, RangeInput } from '@/components/shared/QueryFields'
import { status as statusTok } from '@/tokens'
import { ReuploadBar } from '@/components/mdms/ReuploadBar'
import {
  MDMS_TYPES, DEFAULT_MDMS_KEYS, MDMS_ALERT, buckets, fmtStamp, parseLocal,
  type MdmsBucket, type MdmsKey, type MdmsType,
} from '@/data/mdmsUpload'

/**
 * 讀表管理 · MDMS上拋（設計稿「MDMS上拋-1」圖表檢視、「MDMS上拋-2」卡片檢視）。
 *
 * 條件：表號／電號／群組、資料類型（複選）、上拋電表資料時間（區間）。
 * 畫面：各類型最新時段的達成率卡片＋趨勢分析折線圖（LP／ALT／MN… 頁籤、90% 注意線、低於注意線的時段紅帶）。
 * 2026-11-04 業主意見：不需要沒有圖表的「卡片檢視」（設計稿 MDMS上拋-2），已移除，右上角切換鈕一併拿掉。
 * 達成率＝已上拋／總數，低於 MDMS_ALERT 以紅色顯示。資料全為 mock（data/mdmsUpload.ts）。
 * 2026-11-04 業主意見：輸入欄以即時讀表為準 —— 搜尋改膠囊頁籤（表號／電號／群組）＋多行輸入（可貼多筆），
 * 群組改下拉（裝置群組頁的群組），上拋電表資料時間改 24 小時制、15 分一格（共用 components/shared/QueryFields）。
 * 同日業主確認：資料時間**單次上限 1 個月**（同即時讀表）；資料類型要**能同時比較多種** → 複選下拉。
 *   選多種：上排每種類型一張最新時段卡，趨勢圖用膠囊頁籤切換類型
 *   只選一種：上排顯示該類型最新三個時段
 * 2026-11-11 業主意見：卡片與趨勢分析之間加一行「重新上拋」（搜尋並執行上拋，components/mdms/ReuploadBar.tsx）；
 *   上方搜尋列＝看上拋狀況（dashboard），這一行＝重新上拋，兩者分開。
 */
const GREEN = statusTok.normal.fg
const RED = statusTok.danger.fg
const BLUE = statusTok.info.fg
const CHART_LIMIT = 192

interface Applied {
  mode: TargetMode
  text: string // 表號／電號（多筆以換行分隔）
  group: string // 群組模式選的群組：`${kind}:${群組名}`
  keys: MdmsKey[] // 資料類型（複選下拉，依選項順序）
  from: string // 'YYYY-MM-DDTHH:mm'（日期輸入框的格式；分鐘只會是 00／15／30／45）
  to: string
}
const DEFAULT: Applied = { mode: 'meterNo', text: '', group: '', keys: DEFAULT_MDMS_KEYS, from: '2026-01-02T11:00', to: '2026-01-02T15:00' }

const toneOf = (pct: number) => (pct < MDMS_ALERT ? RED : GREEN)
const fmtN = (n: number) => n.toLocaleString('en-US')

export function MdmsUpload() {
  const [draft, setDraft] = useState<Applied>(DEFAULT)
  const [applied, setApplied] = useState<Applied>(DEFAULT)
  const set = <K extends keyof Applied>(k: K, v: Applied[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const search = () => setApplied(draft)
  const clear = () => { setDraft(DEFAULT); setApplied(DEFAULT) }

  // 每種選定的類型 → 範圍內各時段（新→舊）。起訖顛倒時自動對調
  const series = useMemo(() => {
    const a = parseLocal(applied.from) ?? 0
    const b = parseLocal(applied.to) ?? 0
    const [from, to] = a <= b ? [a, b] : [b, a]
    // mock 依查詢對象錯開數字（同一組對象每次結果相同）
    const target = applied.mode === 'group' ? applied.group : parseTargets(applied.text).join(',')
    const scale = target ? `${applied.mode}:${target}` : ''
    return MDMS_TYPES.filter((t) => applied.keys.includes(t.key)).map((type) => ({ type, rows: buckets(type, from, to, scale) }))
  }, [applied])

  return (
    <div className="flex h-full min-h-[680px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="MDMS上拋" />

      <div className="flex flex-col gap-2">
        <TargetSearchMulti
          mode={draft.mode}
          text={draft.text}
          onMode={(m) => set('mode', m)}
          onText={(v) => set('text', v)}
          onSubmit={search}
          groupInput={<GroupSelect value={draft.group} onChange={(v) => set('group', v)} />}
        />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="選擇資料類型">
            <MultiSelect
              options={MDMS_TYPES.map((t) => ({ value: t.key, label: t.label }))}
              value={draft.keys}
              onChange={(v) => set('keys', v)}
              placeholder="請選擇資料類型"
            />
          </Field>
          <Field label="上拋電表資料時間" hint="單次查詢上限 1 個月">
            <RangeInput from={draft.from} to={draft.to} maxMonths={1} onChange={(from, to) => setDraft((d) => ({ ...d, from, to }))} />
          </Field>
          <QueryButtons onClear={clear} onSearch={search} />
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-card border border-border bg-surface py-16 text-center text-[13px] text-ink-mut shadow-card">請至少選擇一種資料類型</div>
      ) : (
        <ChartView series={series} from={applied.from} to={applied.to} />
      )}
    </div>
  )
}

type OneSeries = { type: MdmsType; rows: MdmsBucket[] }
type Series = OneSeries[]

/* ───────────────────────── 圖表檢視 ───────────────────────── */

const fmtOf = (t: MdmsType) => (t.stepMin >= 1440 ? 'date' : 'time')

/**
 * 選多種：上排每種類型一張「最新時段」卡（最多 4 張一列），趨勢圖用膠囊頁籤切換類型；
 * 只選一種：上排三張＝該類型最新三個時段（第一張帶類型名稱），趨勢圖不需頁籤。
 */
function ChartView({ series, from, to }: { series: Series; from: string; to: string }) {
  const [pick, setPick] = useState<MdmsKey>(series[0].type.key)
  const cur = series.find((s) => s.type.key === pick) ?? series[0]
  const single = series.length === 1
  return (
    <>
      {single ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <RateCard key={i} title={i === 0 ? cur.type.label : undefined} b={cur.rows[i]} fmt={fmtOf(cur.type)} big={i === 0} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(series.length, 4)}, minmax(0, 1fr))` }}>
          {series.map(({ type, rows }) => (
            <RateCard key={type.key} title={type.label} b={rows[0]} fmt={fmtOf(type)} big />
          ))}
        </div>
      )}
      {/* 重新上拋：資料類型跟著下方趨勢的頁籤 */}
      <ReuploadBar typeKey={cur.type.key} from={from} to={to} />
      <TrendPanel series={series} cur={cur} onPick={setPick} />
    </>
  )
}

function TrendPanel({ series, cur, onPick }: { series: Series; cur: OneSeries; onPick: (k: MdmsKey) => void }) {
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
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-ink">趨勢分析・{cur.type.label}</h2>
          <span className="text-[12px] text-ink-mut">{cur.type.cadence}{excluded && ' · 不含進行中時段'}</span>
        </div>
        {/* 選了多種才需要切換 */}
        {series.length > 1 && (
          <div className="inline-flex rounded-full bg-inset p-1">
            {series.map(({ type }) => {
              const on = type.key === cur.type.key
              return (
                <button
                  key={type.key}
                  onClick={() => onPick(type.key)}
                  className={`rounded-full px-3 py-1 text-[12px] font-bold transition-colors ${on ? 'bg-surface text-brand shadow-card' : 'text-ink-sub'}`}
                >
                  {type.key === 'event' ? '事件' : type.key}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="mt-2 text-[12px] text-ink-mut">%</div>
      {points.length === 0 ? (
        <div className="grid min-h-[300px] flex-1 place-items-center text-[13px] text-ink-mut">這個區間沒有已完成的時段</div>
      ) : (
        <div className="min-h-[300px] flex-1" /* 趨勢圖撐滿剩餘高度（2026-11-06） */>
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
      <div className="mb-2 text-ink">{fmtStamp(p.ts)}</div>
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

/* ───────────────────────── 達成率卡片 ───────────────────────── */

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
