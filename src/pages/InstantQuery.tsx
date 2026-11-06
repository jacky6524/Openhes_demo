import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { METER_LIST_ROWS, DCU_LIST_ROWS, type MeterListRow, type DcuListRow } from '@/data/dcuListPage'
import { Th, SortHead, InfiniteFooter, useInfiniteRows, type SortDir } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'

/**
 * 裝置管理 · 即裝即查（Figma 3966:26671／3966:28710／3966:29593，同一頁依「搜尋模式」變三種版面）：
 *   表號         → 電表註冊／最後連線回報／最後LP時間（同一張卡片）
 *   FAN IMEI/MAC → 電表註冊（卡片）＋事件資料（獨立表格）
 *   DCU序號      → 電表註冊（DCU 版欄位）／最後連線回報（卡片）＋網管資料（獨立表格）
 * 2026-10-22 業主新版設計稿「即裝即查-1／-2／-3」：搜尋模式改單選鈕；「最後連線回報」「最後LP時間」
 * 的時間移到標題旁（紅字）；表格獨立成卡片、欄位可排序、無限捲動（不分頁）；電表註冊多「來源 HES」。
 * 設計稿 -3（DCU序號）的電表註冊欄位是整段複製電表版，DCU 沒有表號／電號，這裡仍用 DCU 版欄位。
 * 另有 3971:30755、3977:31162… 等同名畫面，經確認是註冊衝突、裝置群組，各自獨立成頁。
 * 資料全為 mock，取自電表清單／DCU清單；清單沒有的欄位用序號 hash 補。
 *
 * 2026-11-04 業主意見：結果下方留白太多 → 整頁撐滿視窗，並以圖表補足：
 *   表號         卡片＋「今日 LP 回報」（96 格，每 15 分一格：已收到／缺漏／未到時間）＋「今日訊號強度」折線
 *   FAN IMEI/MAC 卡片＋事件資料表（撐滿剩餘高度）
 *   DCU序號      卡片＋網管資料：訊號強度趨勢折線＋表格並排（撐滿剩餘高度）
 * 2026-11-06 業主設計稿：搜尋模式改膠囊頁籤（同即時讀表）；「事件資料」「網管資料」標題原本浮在頁面底色上，
 *   改放進表格卡片內、表格上方。
 * mock 的「現在」＝2025/01/01 15:00（與電表清單最後 LP 時間同一天），LP 時間軸與卡片上的最後LP時間對得上。
 */
const MODES = [
  { key: 'meterNo', label: '表號' },
  { key: 'fanMac', label: 'FAN IMEI/MAC' },
  { key: 'dcuSerial', label: 'DCU 序號' },
] as const
type Mode = (typeof MODES)[number]['key']

/** 各搜尋模式的預設搜尋內容（取清單第一筆，確保按下搜尋一定查得到；2026-10-22 業主要求先填預設值） */
const SAMPLE: Record<Mode, string> = {
  meterNo: METER_LIST_ROWS[0].meterNo,
  fanMac: METER_LIST_ROWS[0].fanMac,
  dcuSerial: DCU_LIST_ROWS[0].serial,
}

type Result = { kind: 'meter'; m: MeterListRow; mode: Mode } | { kind: 'dcu'; d: DcuListRow } | 'none' | null

export function InstantQuery() {
  const [mode, setMode] = useState<Mode>('meterNo')
  const [text, setText] = useState(SAMPLE.meterNo)
  const [result, setResult] = useState<Result>(null)

  const search = () => {
    const q = text.trim().toLowerCase()
    if (!q) return setResult(null)
    if (mode === 'dcuSerial') {
      const d = DCU_LIST_ROWS.find((x) => x.serial.toLowerCase() === q)
      return setResult(d ? { kind: 'dcu', d } : 'none')
    }
    const m = METER_LIST_ROWS.find((x) => String(x[mode]).toLowerCase() === q)
    setResult(m ? { kind: 'meter', m, mode } : 'none')
  }
  const clear = () => { setMode('meterNo'); setText(SAMPLE.meterNo); setResult(null) }

  return (
    <div className="flex h-full min-h-[760px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="即裝即查" />
      <div className="flex flex-col gap-1">
        <span className="px-2 text-[12px] text-ink-sub">搜尋模式</span>
        <PillTabs tabs={MODES} value={mode} onChange={(k) => { setMode(k); setText(SAMPLE[k]); setResult(null) }} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="請輸入"
            className={`${BOX} w-[240px]`}
          />
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button onClick={search} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            搜尋
          </button>
        </div>
      </div>

      {result === null && <Card><Empty text="請選擇搜尋模式並輸入關鍵字後按「搜尋」" /></Card>}
      {result === 'none' && <Card><Empty text="查無符合條件的裝置" /></Card>}
      {result && result !== 'none' && result.kind === 'meter' && <MeterResult m={result.m} mode={result.mode} />}
      {result && result !== 'none' && result.kind === 'dcu' && <DcuResult d={result.d} />}
    </div>
  )
}

/* ───────────────────────── 三種結果版面 ───────────────────────── */

function lpStamp(s: string) {
  const [d, t] = s.split(' ')
  return `${d.replace(/-/g, '/')} ${t.slice(0, 5)}`
}
const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const missing = (label: string) => <span style={{ color: statusTok.danger.fg }}>{label}</span>
const sourceHes = (seed: string) => `TP-HES-0${1 + (seedOf(seed) % 9)}`

function ConnTag({ online }: { online: boolean }) {
  const tok = online ? statusTok.normal : statusTok.danger
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: tok.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: tok.fg }} />
      {online ? '連線' : '斷線'}
    </span>
  )
}

function MeterResult({ m, mode }: { m: MeterListRow; mode: Mode }) {
  /** 一部分電表 OpenHES 沒有首次註冊記錄（紅字提示，設計稿即為此狀態） */
  const noFirst = seedOf(m.meterNo) % 2 === 0
  const stamp = lpStamp(m.lastLp)
  const reg = (
    <Section title="電表註冊">
      <Cell label="時間" value={stamp} />
      <Cell label="表號" value={m.meterNo} />
      <Cell label="電號" value={m.elecNo} />
      <Cell label="FAN" value={m.fanMac} />
      <Cell label="模組韌體型號" value={m.moduleModel} />
      <Cell label="模組韌體版本" value="--" />
      <Cell label="狀態" value="已註冊" />
      <Cell label="首次註冊時間" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊時間') : stamp} />
      <Cell label="來源 HES" value={sourceHes(m.meterNo)} />
      <Cell label="IP address" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : m.ip} />
    </Section>
  )

  if (mode === 'fanMac') {
    return (
      <>
        <Card>{reg}</Card>
        <SortTable
          title="事件資料"
          fill
          columns={['事件時間', '事件碼', '說明', 'HES接收時間', 'OpenHES接收時間']}
          sortable={[0, 3, 4]}
          rows={eventRows(m.meterNo)}
        />
      </>
    )
  }

  return (
    <>
      <Card>
        {reg}
        <Section title="最後連線回報" stamp={stamp}>
          <Cell label="Cell ID" value={String(8000000 + (seedOf(m.meterNo) % 99999))} />
          <Cell label="IP" value={m.ip} />
          <Cell label="Parent" value={m.dcuSerial || '--'} />
          <Cell label="連線狀態" value={<ConnTag online={m.online} />} />
        </Section>
        <Section title="最後LP時間" stamp={stamp} />
      </Card>
      {/* 結果下方：兩張圖撐滿剩餘高度 */}
      <div className="grid min-h-[300px] flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3">
        <LpStrip m={m} />
        <SignalCard title="今日訊號強度" hint="每小時取樣・dBm，越接近 0 越好" points={meterSignal(m)} empty="今日沒有訊號回報" />
      </div>
    </>
  )
}

function DcuResult({ d }: { d: DcuListRow }) {
  const noFirst = seedOf(d.serial) % 2 === 0
  const stamp = '2026/08/26 15:00'
  return (
    <>
      <Card>
        <Section title="電表註冊">
          <Cell label="時間" value={stamp} />
          <Cell label="型號" value={d.model} />
          <Cell label="韌體版本" value="--" />
          <Cell label="狀態" value="已註冊" />
          <Cell label="首次註冊時間" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊時間') : stamp} />
          <Cell label="IMSI" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : `466${String(seedOf(d.serial)).padStart(12, '0').slice(0, 12)}`} />
          <Cell label="來源 HES" value={sourceHes(d.serial)} />
          <Cell label="IP address" value={d.ip} />
        </Section>
        <Section title="最後連線回報" stamp={stamp}>
          <Cell label="Cell ID" value={String(8000000 + (seedOf(d.serial) % 99999))} />
          <Cell label="IP" value={d.ip} />
          <Cell label="Parent" value={d.serial} />
          <Cell label="連線狀態" value={<ConnTag online={d.online} />} />
        </Section>
      </Card>
      <div className="grid min-h-[300px] flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
        <SignalCard title="訊號強度趨勢" hint="每日一筆・dBm，越接近 0 越好" points={dcuSignal(d.serial)} empty="沒有網管資料" />
        <SortTable title="網管資料" fill columns={['連線日期', '訊號強度']} sortable={[0]} rows={signalRows(d.serial)} />
      </div>
    </>
  )
}

/* ───────────────────────── mock 表格資料 ───────────────────────── */

const EVENTS: Array<[string, string]> = [
  ['-56', 'FAN跟電表失聯'],
  ['-12', '電表重新上線'],
  ['3', '電表時間校正'],
]
function eventRows(seed: string): string[][] {
  const s = seedOf(seed)
  return Array.from({ length: 45 }, (_, i) => {
    const [code, desc] = EVENTS[(s + i) % EVENTS.length]
    const day = String(1 + (i % 28)).padStart(2, '0')
    return [`2025/01/${day} 10:30:00`, code, desc, `2025/01/${day} 10:30:00`, `2025/01/${day} 10:30:00`]
  })
}
function signalRows(seed: string): string[][] {
  const s = seedOf(seed)
  return Array.from({ length: 45 }, (_, i) => [
    `2025/01/${String(1 + (i % 28)).padStart(2, '0')} 10:30:00`,
    String(-(50 + ((s + i * 7) % 30))),
  ])
}

/* ───────────────────────── 圖表（2026-11-04） ───────────────────────── */

const TODAY = '2025/01/01' // mock 的「今天」（與電表清單 lastLp 同格式）
const NOW_SLOT = 15 * 4 // mock 的「現在」＝15:00；之前的格子才算過去

type LpSlot = 'ok' | 'miss' | 'future'
const pad2 = (n: number) => String(n).padStart(2, '0')
const slotTime = (i: number) => `${pad2(Math.floor(i / 4))}:${pad2((i % 4) * 15)}`

/** 今日 96 個 15 分鐘格：最後 LP 之前大多收到（偶有缺漏），之後到現在都是缺漏，現在以後是未到時間 */
function lpSlots(m: MeterListRow): LpSlot[] {
  const [date, time] = m.lastLp.split(' ')
  const [hh, mm] = time.split(':').map(Number)
  const cutoff = date === TODAY ? hh * 4 + Math.floor(mm / 15) : -1
  const s = seedOf(m.meterNo)
  return Array.from({ length: 96 }, (_, i) => {
    if (i >= NOW_SLOT) return 'future'
    if (i > cutoff) return 'miss'
    return (s + i * 7) % 37 === 0 ? 'miss' : 'ok'
  })
}

const LP_TONE: Record<LpSlot, { bg: string; label: string }> = {
  ok: { bg: statusTok.normal.fg, label: '已收到' },
  miss: { bg: statusTok.danger.fg, label: '缺漏' },
  future: { bg: statusTok.inactive.bg, label: '未到時間' },
}

function LpStrip({ m }: { m: MeterListRow }) {
  const slots = useMemo(() => lpSlots(m), [m])
  const [hover, setHover] = useState<number | null>(null)
  const ok = slots.filter((x) => x === 'ok').length
  const miss = slots.filter((x) => x === 'miss').length
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle title="今日 LP 回報" />
        <span className="text-[12px] tabular-nums text-ink-sub">
          {hover !== null
            ? <>{TODAY.replace(/-/g, '/')} {slotTime(hover)}　<b className="text-ink">{LP_TONE[slots[hover]].label}</b></>
            : <>已收到 <b className="text-ink">{ok}</b> / 應收 {NOW_SLOT} 筆（至 15:00）・缺漏 <b className="text-ink">{miss}</b></>}
        </span>
      </div>
      {/* 24 欄（小時）× 4 列（每 15 分）；格子隨卡片高度伸縮 */}
      <div className="mt-3 flex min-h-0 flex-1 gap-2" onMouseLeave={() => setHover(null)}>
        <div className="grid shrink-0 grid-rows-4 gap-[2px] py-0 text-[11px] tabular-nums text-ink-mut">
          {['00', '15', '30', '45'].map((q) => <span key={q} className="flex items-center">:{q}</span>)}
        </div>
        <div className="grid min-h-0 flex-1 grid-flow-col grid-cols-[repeat(24,minmax(0,1fr))] grid-rows-4 gap-[2px]">
          {slots.map((st, i) => (
            <span
              key={i}
              onMouseEnter={() => setHover(i)}
              className={`rounded-[3px] ${hover === i ? 'ring-2 ring-ink ring-offset-1' : ''}`}
              style={{ background: LP_TONE[st].bg, boxShadow: st === 'future' ? 'inset 0 0 0 1px #E5E7EB' : undefined }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-2">
        <span className="w-[22px] shrink-0" />
        <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] text-[11px] tabular-nums text-ink-mut">
          {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? pad2(h) : ''}</span>)}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-sub">
        {(Object.keys(LP_TONE) as LpSlot[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: LP_TONE[k].bg, boxShadow: k === 'future' ? 'inset 0 0 0 1px #D1D5DB' : undefined }} />
            {LP_TONE[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface SigPoint { label: string; full: string; v: number | null }

/** 電表今日每小時訊號（dBm）：斷線的表在最後 LP 之後就沒有回報 */
function meterSignal(m: MeterListRow): SigPoint[] {
  const [date, time] = m.lastLp.split(' ')
  const cutoffH = date === TODAY ? Number(time.slice(0, 2)) : -1
  const s = seedOf(m.meterNo)
  const base = -(68 + (s % 18))
  return Array.from({ length: 15 }, (_, h) => ({
    label: `${pad2(h)}:00`,
    full: `${TODAY.replace(/-/g, '/')} ${pad2(h)}:00`,
    v: m.online || h <= cutoffH ? base + (((s >> (h % 8)) + h * 5) % 11) - 5 : null,
  }))
}

/** DCU 網管資料：與右側表格同一份資料，每天一筆、依日期排序 */
function dcuSignal(serial: string): SigPoint[] {
  const byDay = new Map<string, number>()
  for (const [t, v] of signalRows(serial)) byDay.set(t.slice(0, 10), Number(v))
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ label: d.slice(5).replace('-', '/'), full: d.replace(/-/g, '/'), v }))
}

const WEAK_DBM = -110

function SignalCard({ title, hint, points, empty }: { title: string; hint: string; points: SigPoint[]; empty: string }) {
  const has = points.some((p) => p.v !== null)
  const line = statusTok.info.fg
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle title={title} />
        <span className="text-[12px] text-ink-mut">{hint}</span>
      </div>
      {has ? (
        <div className="mt-2 min-h-[180px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF0F3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} minTickGap={16} />
              <YAxis domain={[-120, -40]} ticks={[-120, -100, -80, -60, -40]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} width={40} />
              <ReferenceLine y={WEAK_DBM} stroke={statusTok.danger.fg} strokeDasharray="3 3" label={{ value: '偏弱', position: 'right', fill: statusTok.danger.fg, fontSize: 11 }} />
              <Tooltip cursor={{ stroke: '#C9CDD4', strokeDasharray: '3 3' }} content={<SigTip />} />
              <Line dataKey="v" stroke={line} strokeWidth={2} connectNulls={false} dot={{ r: 3.5, fill: '#fff', stroke: line, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-ink-mut">{empty}</div>
      )}
    </div>
  )
}

function SigTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SigPoint }> }) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card">
      <div className="tabular-nums text-ink-sub">{p.full}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-ink">
        {p.v === null ? '無回報' : `${p.v} dBm`}{p.v !== null && p.v < WEAK_DBM && <span className="ml-1.5 font-normal" style={{ color: statusTok.danger.fg }}>偏弱</span>}
      </div>
    </div>
  )
}

/* ───────────────────────── 共用小零件 ───────────────────────── */

/**
 * 獨立表格卡片：表頭釘住、表格自己捲、無限捲動（業主 2026-08-27 表格標準、不要頁碼）。
 * 只有 sortable 列出的欄位有排序箭頭；排序以字串比對（時間格式為 ISO，字串序即時間序）。
 */
function SortTable({ title, columns, sortable, rows, fill = false }: { title?: string; columns: string[]; sortable: number[]; rows: string[][]; fill?: boolean }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (sortCol === null) return rows
    return [...rows].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortCol].localeCompare(b[sortCol]))
  }, [rows, sortCol, sortDir])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(sorted.length, [rows, sortCol, sortDir], 10)

  const toggle = (c: number) => {
    if (c === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(c); setSortDir('asc') }
  }

  return (
    <div className={`overflow-hidden rounded-card border border-border bg-surface shadow-card ${fill ? 'flex min-h-[300px] flex-1 flex-col' : ''}`}>
      {/* 標題在卡片內、表格上方（2026-11-06 設計稿） */}
      {title && <div className="shrink-0 px-4 pb-3 pt-4"><SectionTitle title={title} /></div>}
      {/* fill：撐滿父層剩餘高度（父層要是 flex column）；否則維持固定上限 */}
      <div ref={scrollRef} className={fill ? 'min-h-[200px] flex-1 overflow-auto' : 'max-h-[calc(100vh-460px)] min-h-[240px] overflow-auto'}>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-ink-sub">
              {columns.map((c, i) => (
                <Th key={c} className="sticky top-0 z-10 bg-inset">
                  {sortable.includes(i)
                    ? <SortHead label={c} active={sortCol === i} dir={sortDir} onClick={() => toggle(i)} />
                    : c}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, visible).map((r, i) => (
              <tr key={i} className="border-b border-divider">
                {r.map((v, j) => <td key={j} className="px-3 py-2.5 text-ink tabular-nums">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={visible} total={sorted.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">{children}</div>
}

function SectionTitle({ title, stamp }: { title: string; stamp?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px] rounded-full bg-danger" />
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {stamp && <span className="text-[13px] tabular-nums text-brand">{stamp}</span>}
    </div>
  )
}

/** stamp：標題旁的紅字時間；沒有 children 時只有標題列（最後LP時間） */
function Section({ title, stamp, children }: { title: string; stamp?: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} stamp={stamp} />
      {children && <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-divider">{children}</div>}
    </section>
  )
}

/** 三欄網格＋斑馬紋：以 CSS 奇偶「列」上色（每列三格），不用算 index */
function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-[13px] [&:nth-child(6n+1)]:bg-inset [&:nth-child(6n+2)]:bg-inset [&:nth-child(6n+3)]:bg-inset">
      <span className="flex w-[120px] shrink-0 items-center gap-2 text-ink-sub">
        <span className="size-1.5 rounded-full" style={{ background: '#2B7FFF' }} />{label}
      </span>
      <span className="min-w-0 truncate text-ink">{value}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-[13px] text-ink-mut">
      <Search size={22} className="text-ink-fai" />
      <span>{text}</span>
    </div>
  )
}

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
