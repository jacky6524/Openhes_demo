import { useMemo, useState } from 'react'
import { Download, Files } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'
import { TargetSearchMulti, parseTargets, type TargetMode } from '@/components/shared/TargetSearch'
import { Field, GroupSelect, QueryButtons, RangeInput } from '@/components/shared/QueryFields'
import { ReuploadPanel } from '@/components/mdms/ReuploadPanel'
import {
  DASH_KEYS, DASH_COLOR, MDMS_TYPES, dashPoints, fmtStamp, parseLocal,
  type DashKey, type DashPoint,
} from '@/data/mdmsUpload'

/**
 * 讀表管理 · MDMS上拋。
 *
 * 2026-11-19 業主意見（參考圖 1119更新參考/MDMS上拋 (4).png）改版成**兩大板塊**：
 *   左＝Dashboard「MDMS查詢」（先看）、右＝「上拋操作」（再操作，components/mdms/ReuploadPanel.tsx）。
 *   · LP／MN／ALT 三個識別色（DASH_COLOR），**與告警無關**——達成率低也不轉紅、拿掉 90% 注意線與紅帶
 *   · 時間搜尋以**整點**為單位（時間下拉 00:00～23:00）
 *   · 一次搜尋同時更新三張卡與折線圖；點卡片＝切到該類型的頁籤
 *   · 類型改用折線圖頁籤區分：ALL（三條線、只分顏色）／LP／MN／ALT（單一類型才有柱狀「缺值」筆數）
 *   · 原本的「選擇資料類型」複選下拉拿掉（卡片固定三種，類型由頁籤切）
 *   · 重新上拋加「群組」
 * 折線圖 Y 軸下緣依資料自動調整（值多在 85～100，固定 0～100 會擠在頂端分不出三條線）。
 * 卡片＝區間內最新一個時段（同參考圖：右上角是時段時間）；進行中的時段標「上拋中」，折線圖不畫進行中時段。
 * 資料全為 mock（data/mdmsUpload.ts 的 dashPoints）。
 */
interface Applied {
  mode: TargetMode
  text: string // 表號／電號（多筆以換行分隔）
  group: string // 群組模式選的群組：`${kind}:${群組名}`
  from: string // 'YYYY-MM-DDTHH:00'
  to: string
}
const DEFAULT: Applied = { mode: 'meterNo', text: '', group: '', from: '2026-01-02T11:00', to: '2026-01-02T15:00' }

/** 折線圖最多畫最後 48 小時（LP 15 分一點＝192 點） */
const CHART_HOURS = 48
type Tab = 'ALL' | DashKey
const TABS: { key: Tab; label: string }[] = [{ key: 'ALL', label: 'ALL' }, ...DASH_KEYS.map((k) => ({ key: k, label: k }))]

const fmtN = (n: number) => n.toLocaleString('en-US')
const labelOf = (k: DashKey) => MDMS_TYPES.find((t) => t.key === k)!.label

function generateMdmsXml(applied: Applied, series: Record<DashKey, DashPoint[]>) {
  const now = new Date().toISOString()
  const targetLabel = applied.mode === 'group' ? (applied.group || '全部') : (applied.text ? parseTargets(applied.text).join(',') : '全部')
  const modeLabel = applied.mode === 'meterNo' ? '表號' : applied.mode === 'elecNo' ? '電號' : '群組'

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<MeterReadingsUploadReport xmlns="http://www.taipower.com.tw/hes/mdms/v1" generatedAt="${now}">\n`
  xml += `  <Header>\n`
  xml += `    <Source>OpenHES</Source>\n`
  xml += `    <TargetMode>${modeLabel}</TargetMode>\n`
  xml += `    <Target>${escapeXml(targetLabel)}</Target>\n`
  xml += `    <DataStartTime>${applied.from.replace('T', ' ')}:00</DataStartTime>\n`
  xml += `    <DataEndTime>${applied.to.replace('T', ' ')}:00</DataEndTime>\n`
  xml += `  </Header>\n`
  xml += `  <Summary>\n`
  for (const k of DASH_KEYS) {
    const list = series[k]
    const latest = list[list.length - 1]
    if (latest) {
      xml += `    <Category key="${k}" name="${escapeXml(labelOf(k))}">\n`
      xml += `      <LatestTime>${fmtStamp(latest.ts)}</LatestTime>\n`
      xml += `      <UploadRate>${latest.pct.toFixed(2)}%</UploadRate>\n`
      xml += `      <Uploaded>${latest.uploaded}</Uploaded>\n`
      xml += `      <Total>${latest.total}</Total>\n`
      xml += `      <Missing>${latest.missing}</Missing>\n`
      xml += `    </Category>\n`
    }
  }
  xml += `  </Summary>\n`
  xml += `  <TimeSeries>\n`
  for (const k of DASH_KEYS) {
    xml += `    <Series key="${k}" name="${escapeXml(labelOf(k))}">\n`
    for (const p of series[k]) {
      xml += `      <Point time="${fmtStamp(p.ts)}" total="${p.total}" uploaded="${p.uploaded}" missing="${p.missing}" rate="${p.pct.toFixed(2)}" />\n`
    }
    xml += `    </Series>\n`
  }
  xml += `  </TimeSeries>\n`
  xml += `</MeterReadingsUploadReport>\n`
  return xml
}

export function MdmsUpload() {
  const [draft, setDraft] = useState<Applied>(DEFAULT)
  const [applied, setApplied] = useState<Applied>(DEFAULT)
  const [tab, setTab] = useState<Tab>('ALL')
  const set = <K extends keyof Applied>(k: K, v: Applied[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const search = () => setApplied(draft)
  const clear = () => { setDraft(DEFAULT); setApplied(DEFAULT) }

  // 三種類型 → 區間內各點（舊→新）。起訖顛倒時自動對調
  const series = useMemo(() => {
    const a = parseLocal(applied.from) ?? 0
    const b = parseLocal(applied.to) ?? 0
    const [from, to] = a <= b ? [a, b] : [b, a]
    const target = applied.mode === 'group' ? applied.group : parseTargets(applied.text).join(',')
    const scale = target ? `${applied.mode}:${target}` : ''
    return Object.fromEntries(DASH_KEYS.map((k) => [k, dashPoints(k, from, to, scale)])) as Record<DashKey, DashPoint[]>
  }, [applied])

  const downloadXml = () => {
    const xml = generateMdmsXml(applied, series)
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mdms-upload-${applied.from.replace(/[:T]/g, '')}_${applied.to.replace(/[:T]/g, '')}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-[720px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="MDMS上拋" icon={<Files size={20} className="text-brand" />} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] gap-4">
        {/* ── 左：Dashboard ── */}
        <section className="flex min-h-0 flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <PanelTitle
            extra={
              <button
                type="button"
                onClick={downloadXml}
                title="下載 MDMS 查詢結果 XML"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand"
              >
                <Download size={14} />
                下載 XML
              </button>
            }
          >
            MDMS查詢
          </PanelTitle>

          <div className="flex flex-col gap-3">
            <TargetSearchMulti
              mode={draft.mode}
              text={draft.text}
              onMode={(m) => set('mode', m)}
              onText={(v) => set('text', v)}
              onSubmit={search}
              groupInput={<GroupSelect value={draft.group} onChange={(v) => set('group', v)} className="w-[360px]" />}
            />
            <div className="flex flex-wrap items-end gap-2">
              <Field label="上拋電表資料時間" hint="以整點為單位，單次上限 1 個月">
                <RangeInput from={draft.from} to={draft.to} maxMonths={1} stepMin={60} onChange={(from, to) => setDraft((d) => ({ ...d, from, to }))} />
              </Field>
              <QueryButtons onClear={clear} onSearch={search} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {DASH_KEYS.map((k) => (
              <RateCard key={k} k={k} b={series[k][series[k].length - 1]} active={tab === k} onClick={() => setTab(tab === k ? 'ALL' : k)} />
            ))}
          </div>

          <TrendPanel series={series} tab={tab} onTab={setTab} />
        </section>

        {/* ── 右：上拋操作 ── */}
        <ReuploadPanel typeKey={tab === 'ALL' ? 'LP' : tab} from={applied.from} to={applied.to} />
      </div>
    </div>
  )
}

export function PanelTitle({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-danger" />
        <h2 className="text-[16px] font-semibold text-ink">{children}</h2>
      </div>
      {extra}
    </div>
  )
}

/* ───────────────────────── 達成率卡片 ───────────────────────── */

function RateCard({ k, b, active, onClick }: { k: DashKey; b?: DashPoint; active: boolean; onClick: () => void }) {
  const c = DASH_COLOR[k]
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? '再點一次回到 ALL' : `折線圖切到 ${k}`}
      className="rounded-card px-4 pb-4 pt-3 text-left transition-shadow hover:shadow-card"
      style={{ background: c.tint, boxShadow: active ? `inset 0 0 0 2px ${c.line}` : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{labelOf(k)}</span>
        {b && (
          <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-ink-mut">
            {fmtStamp(b.ts).slice(5)}
          </span>
        )}
      </div>
      {!b ? (
        <div className="py-6 text-[13px] text-ink-mut">這個區間沒有時段</div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1 font-bold tabular-nums" style={{ color: c.line, fontSize: 36, lineHeight: 1.1 }}>
            {b.pct.toFixed(2)}<span className="text-[12px] font-medium">%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, background: c.line }} />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-ink-sub">
            <span>已上拋</span><span>總數</span>
          </div>
          <div className="flex justify-between text-[15px] font-bold tabular-nums text-ink">
            <span>{fmtN(b.uploaded)}</span><span>{fmtN(b.total)}</span>
          </div>
        </>
      )}
    </button>
  )
}

/* ───────────────────────── 趨勢分析 ───────────────────────── */

type Row = { ts: number; label: string } & Partial<Record<DashKey, number>> & { one?: DashPoint }

function TrendPanel({ series, tab, onTab }: { series: Record<DashKey, DashPoint[]>; tab: Tab; onTab: (t: Tab) => void }) {
  const keys: DashKey[] = tab === 'ALL' ? DASH_KEYS : [tab]

  const { rows, yMin, cut } = useMemo(() => {
    // 進行中的時段才剛開始上拋，不畫進趨勢
    const settled = Object.fromEntries(keys.map((k) => [k, series[k].filter((p) => !p.inProgress)])) as Record<DashKey, DashPoint[]>
    const last = Math.max(0, ...keys.map((k) => settled[k][settled[k].length - 1]?.ts ?? 0))
    const minTs = last - CHART_HOURS * 3_600_000
    const map = new Map<number, Row>()
    for (const k of keys) {
      for (const p of settled[k]) {
        if (p.ts <= minTs) continue
        const r = map.get(p.ts) ?? { ts: p.ts, label: '' }
        r[k] = p.pct
        if (tab !== 'ALL') r.one = p
        map.set(p.ts, r)
      }
    }
    const list = [...map.values()].sort((a, b) => a.ts - b.ts)
    const multiDay = list.length > 1 && list[list.length - 1].ts - list[0].ts >= 86_400_000
    for (const r of list) r.label = multiDay ? fmtStamp(r.ts).slice(5) : fmtStamp(r.ts).slice(11)
    const total = Math.max(0, ...keys.map((k) => settled[k].length))
    // Y 軸下緣貼近資料（值多在 85～100，0～100 會擠成一條線）：最小值往下取整到 10、再留 10
    const vals = list.flatMap((r) => keys.map((k) => r[k]).filter((v): v is number => v !== undefined))
    const yMin = vals.length ? Math.max(0, Math.floor(Math.min(...vals) / 10) * 10 - 10) : 0
    return { rows: list, yMin, cut: total > 0 && settled[keys[0]][0] && settled[keys[0]][0].ts <= minTs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, tab])

  // X 軸只標整點，太密時再抽稀（最多約 12 個）
  const ticks = useMemo(() => {
    const hours = rows.filter((r) => r.ts % 3_600_000 === 0)
    const every = Math.max(1, Math.ceil(hours.length / 12))
    return hours.filter((_, i) => i % every === 0).map((r) => r.label)
  }, [rows])

  const one = tab !== 'ALL'

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">趨勢分析</h3>
        <PillTabs tabs={TABS} value={tab} onChange={onTab} />
      </div>

      {/* 圖例：ALL 只分顏色；單一類型多一個缺值柱 */}
      <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-sub">
        <span className="text-ink-mut">達成率 %</span>
        <span className="flex-1" />
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ background: DASH_COLOR[k].line }} />{k}</span>
        ))}
        {one && (
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: DASH_COLOR[tab].bar }} />缺值（筆，右軸）</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-[260px] flex-1 place-items-center text-[13px] text-ink-mut">這個區間沒有已完成的時段</div>
      ) : (
        <div className="min-h-[260px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: one ? 4 : 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEE7E9" />
              <XAxis dataKey="label" ticks={ticks} interval={0} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8A7F83' }} />
              <YAxis yAxisId="pct" domain={[yMin, 100]} tickCount={6} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8A7F83' }} width={36} />
              {one && (
                <YAxis yAxisId="miss" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8A7F83' }} width={56} tickFormatter={(v: number) => fmtN(v)} />
              )}
              <Tooltip content={<TrendTip keys={keys} />} cursor={{ stroke: '#C9C0C3', strokeDasharray: '3 3' }} />
              {one && (
                <Bar yAxisId="miss" dataKey={(r: Row) => r.one?.missing ?? null} name="缺值" fill={DASH_COLOR[tab].bar} maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              )}
              {keys.map((k) => (
                <Line
                  key={k}
                  yAxisId="pct"
                  dataKey={k}
                  connectNulls
                  stroke={DASH_COLOR[k].line}
                  strokeWidth={2.5}
                  dot={rows.length <= 60 ? { r: 3.5, fill: '#fff', stroke: DASH_COLOR[k].line, strokeWidth: 2 } : false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TrendTip({ active, payload, keys }: { active?: boolean; payload?: Array<{ payload: Row }>; keys: DashKey[] }) {
  const r = active ? payload?.[0]?.payload : null
  if (!r) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] shadow-card">
      <div className="mb-2 text-ink">{fmtStamp(r.ts)}</div>
      {r.one ? (
        <>
          <TipRow k="達成率" v={`${r.one.pct.toFixed(2)}%`} color={DASH_COLOR[keys[0]].line} />
          <TipRow k="已上拋" v={fmtN(r.one.uploaded)} />
          <TipRow k="總數" v={fmtN(r.one.total)} />
          <TipRow k="缺值" v={fmtN(r.one.missing)} />
        </>
      ) : (
        keys.map((k) => r[k] !== undefined && <TipRow key={k} k={k} v={`${r[k]!.toFixed(2)}%`} color={DASH_COLOR[k].line} dot />)
      )}
    </div>
  )
}
function TipRow({ k, v, color, dot }: { k: string; v: string; color?: string; dot?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-8 leading-6">
      <span className="flex items-center gap-1.5 text-ink-sub">
        {dot && <span className="size-2 rounded-full" style={{ background: color }} />}{k}
      </span>
      <span className="font-semibold tabular-nums text-ink" style={color ? { color } : undefined}>{v}</span>
    </div>
  )
}
