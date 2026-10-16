import { useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { METER_LIST_ROWS, DCU_LIST_ROWS, type MeterListRow, type DcuListRow } from '@/data/dcuListPage'
import { Th, Pagination } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'

/**
 * 裝置管理 · 即裝即查（Figma 3966:26671／3966:28710／3966:29593，同一頁依「搜尋模式」變三種版面）：
 *   表號         → 電表註冊／最後連線回報／最後LP時間
 *   FAN IMEI/MAC → 電表註冊／事件資料（表格）
 *   DCU序號      → 電表註冊（DCU 版欄位）／最後連線回報／網管資料（表格）
 * 另有 3971:30755、3977:31162… 等同名畫面，經確認是註冊衝突、裝置群集，各自獨立成頁。
 * 資料全為 mock，取自電表清單／DCU清單；清單沒有的欄位用序號 hash 補。
 */
const MODES = [
  { key: 'meterNo', label: '表號' },
  { key: 'fanMac', label: 'FAN IMEI/MAC' },
  { key: 'dcuSerial', label: 'DCU序號' },
] as const
type Mode = (typeof MODES)[number]['key']

type Result = { kind: 'meter'; m: MeterListRow; mode: Mode } | { kind: 'dcu'; d: DcuListRow } | 'none' | null

export function InstantQuery() {
  const [mode, setMode] = useState<Mode>('meterNo')
  const [text, setText] = useState('')
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
  const clear = () => { setMode('meterNo'); setText(''); setResult(null) }

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="px-2 text-[12px] text-ink-sub">搜尋模式</span>
          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value as Mode); setResult(null) }}
            className={`${BOX} w-[144px]`}
          >
            {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="搜尋"
            className={`${BOX} w-[240px] pl-9`}
          />
        </div>
        <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
          清除條件
        </button>
        <button onClick={search} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
          搜尋
        </button>
      </div>

      <div className="rounded-card bg-surface border border-border shadow-card p-4">
        {result === null && <Empty text="請選擇搜尋模式並輸入關鍵字後按「搜尋」" />}
        {result === 'none' && <Empty text="查無符合條件的裝置" />}
        {result && result !== 'none' && result.kind === 'meter' && <MeterResult m={result.m} mode={result.mode} />}
        {result && result !== 'none' && result.kind === 'dcu' && <DcuResult d={result.d} />}
      </div>
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
      <Cell label="IP address" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : m.ip} />
    </Section>
  )

  if (mode === 'fanMac') {
    return (
      <div className="flex flex-col gap-4">
        {reg}
        <Section title="事件資料" plain>
          <PagedTable
            columns={['事件時間', '事件碼', '說明', 'HES接收時間', 'OpenHES接收時間']}
            rows={eventRows(m.meterNo)}
          />
        </Section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {reg}
      <Section title="最後連線回報">
        <Cell label="回報時間" value={stamp} />
        <Cell label="Cell ID" value={String(8000000 + (seedOf(m.meterNo) % 99999))} />
        <Cell label="IP" value={m.ip} />
        <Cell label="Parent" value={m.dcuSerial || '--'} />
        <Cell label="模組韌體型號" value={<ConnTag online={m.online} />} />
      </Section>
      <Section title="最後LP時間">
        <Cell label="時間" value={stamp} />
      </Section>
    </div>
  )
}

function DcuResult({ d }: { d: DcuListRow }) {
  const noFirst = seedOf(d.serial) % 2 === 0
  const stamp = '2026/08/26 15:00'
  return (
    <div className="flex flex-col gap-4">
      <Section title="電表註冊">
        <Cell label="時間" value={stamp} />
        <Cell label="型號" value={d.model} />
        <Cell label="韌體版本" value="--" />
        <Cell label="狀態" value="已註冊" />
        <Cell label="首次註冊時間" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊時間') : stamp} />
        <Cell label="IMSI" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : `466${String(seedOf(d.serial)).padStart(12, '0').slice(0, 12)}`} />
      </Section>
      <Section title="最後連線回報">
        <Cell label="回報時間" value={stamp} />
        <Cell label="Cell ID" value={String(8000000 + (seedOf(d.serial) % 99999))} />
        <Cell label="IP" value={d.ip} />
        <Cell label="Parent" value={d.serial} />
        <Cell label="模組韌體型號" value={<ConnTag online={d.online} />} />
      </Section>
      <Section title="網管資料" plain>
        <PagedTable columns={['連線日期', '訊號強度']} rows={signalRows(d.serial)} />
      </Section>
    </div>
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
  return Array.from({ length: 36 }, (_, i) => {
    const [code, desc] = EVENTS[(s + i) % EVENTS.length]
    const day = String(1 + (i % 28)).padStart(2, '0')
    return [`2025-01-${day} 10:30:00`, code, desc, `2025-01-${day} 10:30:00`, `2025-01-${day} 10:30:00`]
  })
}
function signalRows(seed: string): string[][] {
  const s = seedOf(seed)
  return Array.from({ length: 36 }, (_, i) => [
    `2025-01-${String(1 + (i % 28)).padStart(2, '0')} 10:30:00`,
    String(-(50 + ((s + i * 7) % 30))),
  ])
}

/* ───────────────────────── 共用小零件 ───────────────────────── */

/** 表格自己捲、表頭釘住，底下接分頁（業主 2026-08-27 定調的表格標準） */
function PagedTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safe = Math.min(page, totalPages)
  const pageRows = useMemo(() => rows.slice((safe - 1) * pageSize, safe * pageSize), [rows, safe, pageSize])
  return (
    <div>
      <div className="max-h-[360px] overflow-auto rounded-lg border border-divider">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-ink-sub">
              {columns.map((c) => <Th key={c} className="sticky top-0 z-10 bg-inset">{c}</Th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={i} className="border-b border-divider">
                {r.map((v, j) => <td key={j} className="px-3 py-2.5 text-ink tabular-nums">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={safe} totalPages={totalPages} onPage={setPage} pageSize={pageSize} onPageSize={(s) => { setPageSize(s); setPage(1) }} />
    </div>
  )
}

function Section({ title, plain, children }: { title: string; plain?: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-danger" />
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      </div>
      {plain ? children : <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-divider">{children}</div>}
    </section>
  )
}

/** 三欄網格＋斑馬紋：以 CSS 奇偶「列」上色（每列三格），不用算 index */
function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-[13px] [&:nth-child(6n+1)]:bg-inset [&:nth-child(6n+2)]:bg-inset [&:nth-child(6n+3)]:bg-inset">
      <span className="flex w-[120px] shrink-0 items-center gap-2 text-ink-sub">
        <span className="size-1.5 rounded-full bg-brand" />{label}
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
