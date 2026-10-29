import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import {
  Th, SortHead, FilterHead, MenuItem, InfiniteFooter, useInfiniteRows, GREEN, RED, type SortDir,
} from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'
import { PageTitle } from '@/components/shared/PageTitle'

/**
 * 裝置管理 · 註冊衝突（Figma 3971:30755；2026-10-22 業主新版設計稿「註冊衝突.png」）。
 *
 * 一筆回報一列。衝突原因兩種：
 *   未匯入資料        OpenHES 沒有這顆電表的資料 → 電號／MAC·IMEI／模組型號直接顯示「回報值」
 *   資料與回報不一致  三個欄位逐一比對：一致 → 值＋綠色勾；不一致 → 灰字「資料值 (資料)」＋紅字「回報值 (回報)」
 * 上方五張統計卡（未匯入／不一致／電號／MAC·IMEI／模組型號不一致）由資料算出；
 * 衝突原因可篩選、四個欄位可排序、無限捲動（不分頁）。資料全為 mock。
 */
type Reason = '未匯入資料' | '資料與回報不一致'
interface Triple { elecNo: string; mac: string; model: string }
interface Conflict {
  reportNo: string // 回報表號
  reason: Reason
  reported: Triple // 模組實際回報的值
  data: Triple // OpenHES 內的資料；「未匯入資料」列不會用到
  dcu: string // DCU編號
  address: string
  at: string
}

const MODELS = ['SGCM-W15-TFB', 'SGCM-W61-TFB', 'SGCM-N71-NBF']
const FIELDS = ['elecNo', 'mac', 'model'] as const

/** 45 筆：前 30 筆未匯入，之後 15 筆不一致；不一致的三個欄位依序輪流錯開，每筆至少錯一個 */
const ROWS: Conflict[] = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1
  const reported: Triple = {
    elecNo: `08-${88407303 + (n % 4) * 11}`,
    mac: String(35534545436 + (n % 4) * 97),
    model: MODELS[0],
  }
  const unimported = i < 30
  // 不一致列：mask 的 bit 決定哪個欄位對不上（1..7，不會是 0）
  const mask = 1 + ((i - 30) % 7)
  const data: Triple = {
    elecNo: mask & 1 ? `08-${88407303 + n * 3}` : reported.elecNo,
    mac: mask & 2 ? String(35534318436 + n * 7) : reported.mac,
    model: mask & 4 ? MODELS[1] : reported.model,
  }
  return {
    reportNo: `AB-TR-${String(n).padStart(3, '0')}`,
    reason: unimported ? '未匯入資料' : '資料與回報不一致',
    reported,
    data,
    dcu: i % 3 === 0 ? '--' : `04997BC0900-${1 + (i % 3)}`,
    address: '新北市新店區寶元路一段84巷3號',
    at: `2025-01-${String(1 + (i % 28)).padStart(2, '0')} 10:30:00`,
  }
})

const mismatch = (r: Conflict, k: (typeof FIELDS)[number]) => r.reason === '資料與回報不一致' && r.data[k] !== r.reported[k]
const COUNT = {
  unimported: ROWS.filter((r) => r.reason === '未匯入資料').length,
  mismatch: ROWS.filter((r) => r.reason === '資料與回報不一致').length,
  elecNo: ROWS.filter((r) => mismatch(r, 'elecNo')).length,
  mac: ROWS.filter((r) => mismatch(r, 'mac')).length,
  model: ROWS.filter((r) => mismatch(r, 'model')).length,
}

const REASON_TOK: Record<Reason, { fg: string; bg: string }> = {
  未匯入資料: statusTok.danger,
  資料與回報不一致: statusTok.warning,
}

type SortKey = 'reportNo' | 'dcu' | 'address' | 'at'
const ALL = '全部'

export function RegistrationConflict() {
  const [reason, setReason] = useState<string>(ALL)
  // 統計卡的欄位篩選：只看該欄位對不上的列（只會出現在「資料與回報不一致」）；與 reason 互斥
  const [field, setField] = useState<(typeof FIELDS)[number] | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const hit = ROWS.filter((r) => (reason === ALL || r.reason === reason) && (!field || mismatch(r, field)))
    if (!sortKey) return hit
    return [...hit].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortKey].localeCompare(b[sortKey]))
  }, [reason, field, sortKey, sortDir])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [reason, field, sortKey, sortDir], 10)

  /** 點統計卡：再點一次取消；每次點擊都以那張卡為唯一條件 */
  const pickReason = (r: Reason) => { setField(null); setReason(reason === r && !field ? ALL : r) }
  const pickField = (f: (typeof FIELDS)[number]) => { setReason(ALL); setField(field === f ? null : f) }

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: SortKey, label: string) => (
    <Th className="sticky top-0 z-10 bg-inset"><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="註冊衝突" />

      <div className="grid grid-cols-5 gap-4">
        <Stat label="未匯入資料" value={COUNT.unimported} accent={statusTok.danger.fg} active={reason === '未匯入資料' && !field} onClick={() => pickReason('未匯入資料')} />
        <Stat label="資料與回報不一致" value={COUNT.mismatch} accent={statusTok.warning.fg} active={reason === '資料與回報不一致' && !field} onClick={() => pickReason('資料與回報不一致')} />
        <Stat label="電號 不一致" value={COUNT.elecNo} active={field === 'elecNo'} onClick={() => pickField('elecNo')} />
        <Stat label="MAC/IMEI 不一致" value={COUNT.mac} active={field === 'mac'} onClick={() => pickField('mac')} />
        <Stat label="模組型號 不一致" value={COUNT.model} active={field === 'model'} onClick={() => pickField('model')} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-ink-sub">
        <Legend bar={statusTok.danger.fg}>未匯入資料：顯示回報值</Legend>
        <Legend bar={statusTok.warning.fg}>資料與回報不一致：灰字為資料 / 紅字為回報</Legend>
        <span className="inline-flex items-center gap-1.5"><CircleCheck size={16} style={{ color: GREEN }} />資料與回報一致</span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div ref={scrollRef} className="max-h-[calc(100vh-390px)] min-h-[300px] overflow-auto">
          <table className="w-full min-w-[1280px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                {head('reportNo', '回報表號')}
                <Th className="sticky top-0 z-20 bg-inset">
                  <FilterHead label="衝突原因" open={filterOpen} onToggle={() => setFilterOpen((o) => !o)}>
                    {[ALL, '未匯入資料', '資料與回報不一致'].map((o) => (
                      <MenuItem key={o} active={reason === o} onClick={() => { setReason(o); setField(null); setFilterOpen(false) }}>{o}</MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th className="sticky top-0 z-10 bg-inset">電號</Th>
                <Th className="sticky top-0 z-10 bg-inset">MAC/IMEI</Th>
                <Th className="sticky top-0 z-10 bg-inset">模組型號</Th>
                {head('dcu', 'DCU編號')}
                {head('address', '用電地址')}
                {head('at', '回報時間')}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((r) => (
                <tr key={r.reportNo} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-3 whitespace-nowrap text-ink">{r.reportNo}</td>
                  <td className="px-3 py-3"><ReasonPill reason={r.reason} /></td>
                  {FIELDS.map((k) => (
                    <td key={k} className="px-3 py-2 align-middle">
                      <Compare r={r} k={k} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-ink">{r.dcu}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-ink">{r.address}</td>
                  <td className="px-3 py-3 tabular-nums whitespace-nowrap text-ink">{r.at}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-ink-mut">沒有符合條件的註冊衝突</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
    </div>
  )
}

/** 單一欄位的比對呈現：未匯入＝回報值；不一致列裡，對得上＝值＋綠勾，對不上＝灰字資料／紅字回報兩行 */
function Compare({ r, k }: { r: Conflict; k: (typeof FIELDS)[number] }) {
  if (r.reason === '未匯入資料') return <span className="tabular-nums text-ink">{r.reported[k]}</span>
  if (!mismatch(r, k)) {
    return (
      <span className="flex items-center justify-between gap-2 tabular-nums text-ink">
        {r.reported[k]}<CircleCheck size={18} className="shrink-0" style={{ color: GREEN }} />
      </span>
    )
  }
  return (
    <span className="flex flex-col leading-[1.35] tabular-nums">
      <span className="text-ink-mut">{r.data[k]} (資料)</span>
      <span style={{ color: RED }}>{r.reported[k]} (回報)</span>
    </span>
  )
}

function ReasonPill({ reason }: { reason: Reason }) {
  const t = REASON_TOK[reason]
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: t.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: t.fg }} />{reason}
    </span>
  )
}

/** 統計卡兼篩選鈕：選中時品牌色外框，再點一次取消 */
function Stat({ label, value, accent, active, onClick }: { label: string; value: number; accent?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? '再點一次取消篩選' : `只看「${label}」`}
      className={[
        'rounded-card border bg-surface px-5 py-4 text-left shadow-card transition-shadow hover:shadow-card-hover',
        active ? 'border-brand ring-1 ring-brand' : 'border-border',
      ].join(' ')}
      style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}
    >
      <div className="text-[13px] text-ink-sub">{label}</div>
      <div className="mt-1 text-[32px] font-bold leading-tight tabular-nums text-ink">{value}</div>
    </button>
  )
}

function Legend({ bar, children }: { bar: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-5 rounded-full" style={{ background: bar }} />{children}
    </span>
  )
}
