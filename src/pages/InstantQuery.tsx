import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { METER_LIST_ROWS, DCU_LIST_ROWS, type MeterListRow, type DcuListRow } from '@/data/dcuListPage'
import { Th, SortHead, InfiniteFooter, useInfiniteRows, type SortDir } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'
import { PageTitle } from '@/components/shared/PageTitle'

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
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="即裝即查" />
      <div className="flex flex-col gap-1">
        <span className="px-2 text-[12px] text-ink-sub">搜尋模式</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-[38px] items-center gap-3 px-2">
            {MODES.map((m) => (
              <label key={m.key} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-ink">
                <input
                  type="radio"
                  name="instant-mode"
                  checked={mode === m.key}
                  onChange={() => { setMode(m.key); setText(SAMPLE[m.key]); setResult(null) }}
                  className="size-4 cursor-pointer accent-danger"
                />
                {m.label}
              </label>
            ))}
          </div>
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
        <TableSection title="事件資料">
          <SortTable
            columns={['事件時間', '事件碼', '說明', 'HES接收時間', 'OpenHES接收時間']}
            sortable={[0, 3, 4]}
            rows={eventRows(m.meterNo)}
          />
        </TableSection>
      </>
    )
  }

  return (
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
      <TableSection title="網管資料">
        <SortTable columns={['連線日期', '訊號強度']} sortable={[0]} rows={signalRows(d.serial)} />
      </TableSection>
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
    return [`2025-01-${day} 10:30:00`, code, desc, `2025-01-${day} 10:30:00`, `2025-01-${day} 10:30:00`]
  })
}
function signalRows(seed: string): string[][] {
  const s = seedOf(seed)
  return Array.from({ length: 45 }, (_, i) => [
    `2025-01-${String(1 + (i % 28)).padStart(2, '0')} 10:30:00`,
    String(-(50 + ((s + i * 7) % 30))),
  ])
}

/* ───────────────────────── 共用小零件 ───────────────────────── */

/**
 * 獨立表格卡片：表頭釘住、表格自己捲、無限捲動（業主 2026-08-27 表格標準、不要頁碼）。
 * 只有 sortable 列出的欄位有排序箭頭；排序以字串比對（時間格式為 ISO，字串序即時間序）。
 */
function SortTable({ columns, sortable, rows }: { columns: string[]; sortable: number[]; rows: string[][] }) {
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
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div ref={scrollRef} className="max-h-[calc(100vh-460px)] min-h-[240px] overflow-auto">
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
  return <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">{children}</div>
}

/** 卡片外的區塊（事件資料／網管資料）：標題在頁面底色上，表格自成一張卡片 */
function TableSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} />
      {children}
    </section>
  )
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
