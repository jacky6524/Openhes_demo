import { useMemo, useRef, useState } from 'react'
import {
  Th, SortHead, FilterHead, MenuItem, InfiniteFooter, useInfiniteRows, RED, type SortDir,
} from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'
import { PageTitle } from '@/components/shared/PageTitle'
import { Field, QueryButtons } from '@/components/shared/QueryFields'
import { FIELD_BOX } from '@/components/shared/TargetSearch'

/**
 * 裝置管理 · 註冊衝突（Figma 3971:30755；2026-10-22 業主新版設計稿「註冊衝突.png」）。
 *
 * 2026-11-11 業主意見＋設計稿（1111調整內容/1110修改）：
 *   - 移除「資料與回報不一致」這個大分類：衝突原因直接標「未匯入資料」或對不上的欄位（電號／MAC/IMEI／模組型號，可多個）
 *   - 上方改成「衝突數量統計」卡：未匯入資料／衝突總數／電號衝突／MAC/IMEI衝突／模組型號衝突；點卡片＝篩選
 *   - 列表上方加搜尋列：表號、電號、MAC/IMEI、DCU編號
 *   - 移除欄位裡的打勾／叉叉圖示；對不上的欄位維持「灰字資料＋紅字回報」
 * 一筆回報一列；未匯入資料的列，電號／MAC·IMEI／模組型號直接顯示回報值。資料全為 mock。
 */
type FieldKey = 'elecNo' | 'mac' | 'model'
type Reason = 'unimported' | FieldKey
interface Triple { elecNo: string; mac: string; model: string }
interface Conflict {
  reportNo: string // 回報表號
  unimported: boolean
  reported: Triple // 模組實際回報的值
  data: Triple // OpenHES 內的資料；「未匯入資料」列不會用到
  dcu: string // DCU編號
  address: string
  at: string
}

const MODELS = ['SGCM-W15-TFB', 'SGCM-W61-TFB', 'SGCM-N71-NBF']
const FIELDS: FieldKey[] = ['elecNo', 'mac', 'model']

/** 45 筆：前 30 筆未匯入，之後 15 筆有欄位對不上；三個欄位依序輪流錯開，每筆至少錯一個 */
const ROWS: Conflict[] = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1
  const reported: Triple = {
    elecNo: `08-${88407303 + (n % 4) * 11}`,
    mac: String(35534545436 + (n % 4) * 97),
    model: MODELS[0],
  }
  const unimported = i < 30
  // mask 的 bit 決定哪個欄位對不上（1..7，不會是 0）
  const mask = 1 + ((i - 30) % 7)
  const data: Triple = {
    elecNo: mask & 1 ? `08-${88407303 + n * 3}` : reported.elecNo,
    mac: mask & 2 ? String(35534318436 + n * 7) : reported.mac,
    model: mask & 4 ? MODELS[1] : reported.model,
  }
  return {
    reportNo: `AB-TR-${String(n).padStart(3, '0')}`,
    unimported,
    reported,
    data,
    dcu: i % 3 === 0 ? '--' : `04997BC0900-${1 + (i % 3)}`,
    address: '新北市新店區寶元路一段84巷3號',
    at: `2025/01/${String(1 + (i % 28)).padStart(2, '0')} 10:30:00`,
  }
})

const mismatch = (r: Conflict, k: FieldKey) => !r.unimported && r.data[k] !== r.reported[k]
const reasonsOf = (r: Conflict): Reason[] => (r.unimported ? ['unimported'] : FIELDS.filter((k) => mismatch(r, k)))

/** 衝突原因標籤：名稱與顏色（統計卡的小圓點用同一色，對得回表格裡的標籤） */
const REASON: Record<Reason, { label: string; stat: string; fg: string; bg: string }> = {
  unimported: { label: '未匯入資料', stat: '未匯入資料', ...statusTok.danger },
  elecNo: { label: '電號', stat: '電號衝突', ...statusTok.warning },
  mac: { label: 'MAC/IMEI', stat: 'MAC/IMEI衝突', ...statusTok.info },
  model: { label: '模組型號', stat: '模組型號衝突', fg: '#06B6D4', bg: '#ECFEFF' },
}
const REASON_KEYS = Object.keys(REASON) as Reason[]

const COUNT: Record<Reason, number> = {
  unimported: ROWS.filter((r) => r.unimported).length,
  elecNo: ROWS.filter((r) => mismatch(r, 'elecNo')).length,
  mac: ROWS.filter((r) => mismatch(r, 'mac')).length,
  model: ROWS.filter((r) => mismatch(r, 'model')).length,
}

type SortKey = 'reportNo' | 'dcu' | 'address' | 'at'
interface Query { reportNo: string; elecNo: string; mac: string; dcu: string }
const EMPTY_Q: Query = { reportNo: '', elecNo: '', mac: '', dcu: '' }
const has = (v: string, q: string) => !q.trim() || v.toLowerCase().includes(q.trim().toLowerCase())

export function RegistrationConflict() {
  const [reason, setReason] = useState<Reason | null>(null)
  const [draft, setDraft] = useState<Query>(EMPTY_Q)
  const [query, setQuery] = useState<Query>(EMPTY_Q)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const hit = ROWS.filter((r) =>
      (!reason || reasonsOf(r).includes(reason)) &&
      has(r.reportNo, query.reportNo) &&
      // 電號、MAC/IMEI：資料值或回報值任一符合都算（不一致時兩個值都可能是使用者手上的那個）
      (has(r.reported.elecNo, query.elecNo) || (!r.unimported && has(r.data.elecNo, query.elecNo))) &&
      (has(r.reported.mac, query.mac) || (!r.unimported && has(r.data.mac, query.mac))) &&
      has(r.dcu === '--' ? '' : r.dcu, query.dcu))
    if (!sortKey) return hit
    return [...hit].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortKey].localeCompare(b[sortKey]))
  }, [reason, query, sortKey, sortDir])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [reason, query, sortKey, sortDir], 10)

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: SortKey, label: string) => (
    <Th className="sticky top-0 z-10 bg-inset"><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )
  const input = (k: keyof Query, label: string) => (
    <Field label={label}>
      <input
        value={draft[k]}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && setQuery(draft)}
        placeholder="請輸入"
        className={`${FIELD_BOX} w-[220px]`}
      />
    </Field>
  )

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="註冊衝突" />

      <Panel title="衝突數量統計">
        <div className="grid grid-cols-5 gap-3">
          <Stat label={REASON.unimported.stat} dot={REASON.unimported.fg} value={COUNT.unimported} active={reason === 'unimported'} onClick={() => setReason(reason === 'unimported' ? null : 'unimported')} />
          <Stat label="衝突總數" value={ROWS.length} active={reason === null} onClick={() => setReason(null)} />
          {FIELDS.map((k) => (
            <Stat key={k} label={REASON[k].stat} dot={REASON[k].fg} value={COUNT[k]} active={reason === k} onClick={() => setReason(reason === k ? null : k)} />
          ))}
        </div>
      </Panel>

      <Panel title="註冊衝突列表">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          {input('reportNo', '表號')}
          {input('elecNo', '電號')}
          {input('mac', 'MAC/IMEI')}
          {input('dcu', 'DCU編號')}
          <QueryButtons onClear={() => { setDraft(EMPTY_Q); setQuery(EMPTY_Q); setReason(null) }} onSearch={() => setQuery(draft)} />
        </div>

        <div className="overflow-hidden rounded-lg border border-divider">
          <div ref={scrollRef} className="max-h-[calc(100vh-430px)] min-h-[300px] overflow-auto">
            <table className="w-full min-w-[1240px] text-[13px] border-collapse">
              <thead>
                <tr className="text-ink-sub">
                  {head('reportNo', '回報表號')}
                  <Th className="sticky top-0 z-20 bg-inset">
                    <FilterHead label="衝突原因" open={filterOpen} onToggle={() => setFilterOpen((o) => !o)}>
                      <MenuItem active={reason === null} onClick={() => { setReason(null); setFilterOpen(false) }}>全部</MenuItem>
                      {REASON_KEYS.map((k) => (
                        <MenuItem key={k} active={reason === k} onClick={() => { setReason(k); setFilterOpen(false) }}>{REASON[k].label}</MenuItem>
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
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">{reasonsOf(r).map((k) => <ReasonPill key={k} reason={k} />)}</span>
                    </td>
                    {FIELDS.map((k) => (
                      <td key={k} className="px-3 py-2 align-middle"><Compare r={r} k={k} /></td>
                    ))}
                    <td className="px-3 py-3 text-ink">{r.dcu}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 whitespace-nowrap text-ink" title={r.address}>{r.address}</td>
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
      </Panel>
    </div>
  )
}

/** 單一欄位：對得上（或未匯入）＝單一值；對不上＝灰字資料／紅字回報兩行（不再加勾叉圖示） */
function Compare({ r, k }: { r: Conflict; k: FieldKey }) {
  if (!mismatch(r, k)) return <span className="tabular-nums text-ink">{r.reported[k]}</span>
  return (
    <span className="flex flex-col leading-[1.35] tabular-nums">
      <span className="text-ink-mut">{r.data[k]} (資料)</span>
      <span style={{ color: RED }}>{r.reported[k]} (回報)</span>
    </span>
  )
}

function ReasonPill({ reason }: { reason: Reason }) {
  const t = REASON[reason]
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: t.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: t.fg }} />{t.label}
    </span>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-danger" />
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  )
}

/** 統計卡兼篩選鈕：選中時品牌色外框；小圓點與表格裡的衝突原因標籤同色 */
function Stat({ label, value, dot, active, onClick }: { label: string; value: number; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? '目前篩選條件' : `只看「${label}」`}
      className={[
        'rounded-lg border px-5 py-3.5 text-left transition-colors',
        active ? 'border-brand bg-surface ring-1 ring-brand' : 'border-transparent bg-inset hover:border-border',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 text-[13px] text-ink-sub">
        {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className="mt-1 text-[30px] font-bold leading-tight tabular-nums text-ink">{value}</div>
    </button>
  )
}
