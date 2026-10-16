import { useMemo, useState } from 'react'
import { FileText, ClipboardList, Settings, Ban } from 'lucide-react'
import { SearchButtons, NotSearched } from '@/components/shared/ListSearch'
import {
  METER_LIST_ROWS, METER_CATEGORIES, MODULE_MODELS, METER_GROUPS,
  type MeterListRow,
} from '@/data/dcuListPage'
import { Th, StatusPill, SortHead, StampLines, type SortDir } from '@/components/table/tableBits'
import { STICKY_TH, useInfiniteRows } from '@/components/shared/Tabs'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import type { DcuMeterRow } from '@/data/dcuMeters'
import { status as statusTok } from '@/tokens'

/**
 * 裝置管理 · 電表清單 (Figma 3677:26714)。
 *
 * 與 DCU清單同一種版式（標題列＋篩選列＋清單），欄位換成電表側，
 * 每列兩個動作（詳細資料／裝置設定），沒有拓樸圖。
 *
 * 2026-10-16 業主意見：
 *   · 預設以**表號**查詢、移除 FAN MAC 搜尋；右側 DCU 搜尋預設 DCU序號
 *   · 「修改模式」搬進齒輪（裝置設定）裡，清單右上不再有批次按鈕
 *   · 欄位順序：區處及營業區、狀態、連線狀態、電號、表號、地址、模組型號／序號、DCU序號、IP、最後LP／MN 時間
 *   · 重要資料（電號、表號、地址）放大；模組、時間拆兩行；整張表不出現左右捲軸
 *   · 版面撐滿視窗、下方不留白，改**無限捲動**（不分頁）
 */
type SortKey = 'elecNo' | 'meterNo' | 'moduleModel' | 'dcuSerial' | 'address' | 'ip' | 'lastLp' | 'lastMn'

const DCU_FIELDS = [
  { key: 'dcuSerial', label: 'DCU序號' },
  { key: 'dcuCode', label: 'DCU編號' },
] as const
const SEARCH_FIELDS = [
  { key: 'meterNo', label: '表號' },
  { key: 'elecNo', label: '電號' },
  { key: 'moduleSerial', label: '模組序號' },
] as const
type DcuField = (typeof DCU_FIELDS)[number]['key']
type SearchField = (typeof SEARCH_FIELDS)[number]['key']

const ALL = 'ALL'

/** 查詢條件（兩組欄位搜尋＋各篩選）—— 畫面上編輯的是草稿，按「搜尋」才整組套用 */
interface Query {
  dcuField: DcuField; dcuText: string
  field: SearchField; text: string
  office: string; category: string; moduleModel: string; state: string; group: string
}
const EMPTY_QUERY: Query = {
  dcuField: 'dcuSerial', dcuText: '', field: 'meterNo', text: '',
  office: '', category: ALL, moduleModel: ALL, state: ALL, group: ALL,
}

export function MeterList() {
  /**
   * 2026-09-23 依業主意見：進頁面**預設不載入清單**，要按「搜尋」才查詢；
   * 篩選欄也一併改成按「搜尋」才生效。applied＝null 代表尚未搜尋過。
   */
  const [draft, setDraft] = useState<Query>(EMPTY_QUERY)
  const [applied, setApplied] = useState<Query | null>(null)
  const set = <K extends keyof Query>(k: K, v: Query[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [settingsRow, setSettingsRow] = useState<MeterListRow | null>(null)

  const filtered = useMemo(() => {
    if (!applied) return [] as MeterListRow[]
    const { office, category, moduleModel, state, group } = applied
    const dq = applied.dcuText.trim().toLowerCase()
    const q = applied.text.trim().toLowerCase()
    let rows = METER_LIST_ROWS.filter(
      (m) =>
        m.office.toLowerCase().includes(office.trim().toLowerCase()) &&
        (category === ALL || m.category === category) &&
        (moduleModel === ALL || m.moduleModel === moduleModel) &&
        (state === ALL || (state === 'enabled' ? m.enabled : !m.enabled)) &&
        (group === ALL || m.group === group) &&
        (!dq || String(m[applied.dcuField]).toLowerCase().includes(dq)) &&
        (!q || String(m[applied.field]).toLowerCase().includes(q)),
    )
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const d = String(a[sortKey]).localeCompare(String(b[sortKey]))
        return sortDir === 'asc' ? d : -d
      })
    }
    return rows
  }, [applied, sortKey, sortDir])

  // 無限捲動：捲到底再多放一批；搜尋／排序變動就回到第一批
  const { visible, onScroll, reset } = useInfiniteRows(filtered.length)
  const rows = filtered.slice(0, visible)

  const apply = () => { setApplied(draft); reset() }
  const resetAll = () => { setDraft(EMPTY_QUERY); setApplied(null); reset() }

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    reset()
  }
  const head = (k: SortKey, label: string) => (
    <Th className={STICKY_TH}><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )
  /** 最後LP／MN 時間：非當日標紅（與其他電表清單同一條規則）；只到時分（'YYYY-MM-DD HH:mm'） */
  const stale = (sameDay: boolean) => (sameDay ? undefined : statusTok.danger.fg)
  const hm = (t: string) => t.slice(0, 16)

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-card bg-surface border border-border shadow-card">
        {/* 標題列 */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-brand" />
            <h2 className="text-[15px] font-semibold text-ink">電表清單</h2>
            {applied && (
              <span className="ml-2 text-[12px] text-ink-mut tabular-nums">
                共 {filtered.length} 筆{visible < filtered.length && `（已載入 ${visible}）`}
              </span>
            )}
          </div>
          <button className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
            匯出
          </button>
        </div>

        {/* 搜尋列（最上層）—— 2026-09-23 業主意見：搜尋在上、篩選在下 */}
        <div className="flex shrink-0 flex-wrap items-end gap-3 px-4 pt-3 pb-2">
          <FilterField label="搜尋">
            <div className="flex items-center gap-2">
              <select value={draft.field} onChange={(e) => set('field', e.target.value as SearchField)} className={`${BOX} w-[118px]`}>
                {SEARCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <input
                value={draft.text}
                onChange={(e) => set('text', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                placeholder={`請輸入${SEARCH_FIELDS.find((f) => f.key === draft.field)?.label ?? ''}（可留空）`}
                className={`${BOX} w-[240px]`}
              />
            </div>
          </FilterField>
          <SearchButtons onSearch={apply} onReset={resetAll} />
        </div>

        {/* 篩選列 —— 與搜尋欄一起在按下「搜尋」時套用 */}
        <div className="flex shrink-0 flex-wrap items-end gap-3 px-4 pt-1 pb-3 border-b border-border">
          <FilterField label="營業區">
            <input
              value={draft.office}
              onChange={(e) => set('office', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="請輸入"
              className={BOX}
            />
          </FilterField>
          <FilterField label="電表分類">
            <Select value={draft.category} onChange={(v) => set('category', v)} options={METER_CATEGORIES} />
          </FilterField>
          <FilterField label="選擇模組">
            <Select value={draft.moduleModel} onChange={(v) => set('moduleModel', v)} allLabel="所有型號" options={MODULE_MODELS} width={150} />
          </FilterField>
          <FilterField label="狀態">
            <Select
              value={draft.state}
              onChange={(v) => set('state', v)}
              options={[{ value: 'enabled', label: '啟用' }, { value: 'disabled', label: '停用' }]}
            />
          </FilterField>
          <FilterField label="電表群組">
            <Select value={draft.group} onChange={(v) => set('group', v)} options={METER_GROUPS} />
          </FilterField>
          {/* 選填：有填才只列出掛在該 DCU 底下的電表；沒有 DCU 的電表此時不會出現 */}
          <FilterField label="DCU（選填）">
            <div className="flex items-center gap-2">
              <select value={draft.dcuField} onChange={(e) => set('dcuField', e.target.value as DcuField)} className={`${BOX} w-[118px]`}>
                {DCU_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <input
                value={draft.dcuText}
                onChange={(e) => set('dcuText', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                placeholder="請輸入"
                className={`${BOX} w-[150px]`}
              />
            </div>
          </FilterField>
        </div>

        {/* 表格 —— 自己是捲動容器、表頭 sticky；欄寬隨視窗伸縮，不出現左右捲軸 */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4" onScroll={onScroll}>
          <table className="w-full table-fixed text-[13px] border-collapse">
            <colgroup>
              <col style={{ width: '9%' }} />{/* 區處及營業區 */}
              <col style={{ width: '5%' }} />{/* 狀態 */}
              <col style={{ width: '6%' }} />{/* 連線狀態 */}
              <col style={{ width: '10%' }} />{/* 電號 */}
              <col style={{ width: '10%' }} />{/* 表號 */}
              <col style={{ width: '17%' }} />{/* 地址 */}
              <col style={{ width: '11%' }} />{/* 模組型號／序號 */}
              <col style={{ width: '10%' }} />{/* DCU序號 */}
              <col style={{ width: '9%' }} />{/* IP */}
              <col style={{ width: '6%' }} />{/* 最後LP */}
              <col style={{ width: '6%' }} />{/* 最後MN */}
              <col style={{ width: '64px' }} />{/* 動作 */}
            </colgroup>
            <thead>
              <tr className="text-ink-sub">
                <Th className={`${STICKY_TH} !whitespace-normal`}>區處及營業區</Th>
                <Th className={STICKY_TH}>狀態</Th>
                <Th className={STICKY_TH}>連線狀態</Th>
                {head('elecNo', '電號')}
                {head('meterNo', '表號')}
                {head('address', '地址')}
                {head('moduleModel', '模組型號 / 序號')}
                {head('dcuSerial', 'DCU序號')}
                {head('ip', 'IP')}
                {head('lastLp', '最後LP時間')}
                {head('lastMn', '最後MN時間')}
                <Th className={STICKY_TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.meterNo} className="border-b border-divider align-middle hover:bg-inset/40">
                  <td className="px-3 py-3 text-ink-sub">{m.office}</td>
                  <td className="px-3 py-3" style={{ color: m.enabled ? undefined : statusTok.danger.fg }}>
                    <span className={m.enabled ? 'text-ink-sub' : ''}>{m.enabled ? '啟用' : '停用'}</span>
                  </td>
                  <td className="px-3 py-3"><StatusPill status={m.online ? 'online' : 'offline'} /></td>
                  <td className="px-3 py-3 font-mono text-[14px] font-semibold text-ink break-all">{m.elecNo}</td>
                  <td className="px-3 py-3 font-mono text-[14px] font-semibold text-ink break-all">{m.meterNo}</td>
                  <td className="px-3 py-3 text-[14px] leading-snug text-ink">{m.address}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col leading-snug">
                      <span className="text-ink">{m.moduleModel}</span>
                      <span className="font-mono text-[12px] text-ink-mut break-all">{m.moduleSerial}</span>
                    </div>
                  </td>
                  {/* 沒有掛 DCU 的電表明寫「無」，不留空白（避免被當成資料缺漏） */}
                  <td className="px-3 py-3 font-mono text-ink-sub break-all">{m.dcuSerial || <span className="font-sans text-ink-mut">無</span>}</td>
                  <td className="px-3 py-3 font-mono text-ink-sub whitespace-nowrap">{m.ip}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: stale(m.lastLpSameDay) }}><StampLines value={hm(m.lastLp)} /></td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: stale(m.lastMnSameDay) }}><StampLines value={hm(m.lastMn)} /></td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailMeter(m.meterNo)} title="詳細資料" className="text-ink-mut hover:text-brand">
                        <ClipboardList size={15} />
                      </button>
                      {/* 2026-10-01 業主意見：齒輪功能暫不啟用 → 疊禁止符號，仍可點開瀏覽（彈窗上方說明、操作停用） */}
                      <button onClick={() => setSettingsRow(m)} title="裝置設定（含修改模式；暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                        <Settings size={15} />
                        <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-ink-mut">
                    {applied ? '查無符合條件的電表' : <NotSearched />}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {applied && rows.length > 0 && (
            <div className="py-3 text-center text-[12px] text-ink-mut">
              {visible < filtered.length ? '向下捲動載入更多…' : `已顯示全部 ${filtered.length} 筆`}
            </div>
          )}
        </div>
      </div>

      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {settingsRow && <MeterSettingsModal meter={toMeterRow(settingsRow)} showMode onClose={() => setSettingsRow(null)} />}
    </div>
  )
}

/** 電表裝置設定彈窗吃的是 DcuMeterRow 形狀，這裡補齊它需要的欄位 */
function toMeterRow(m: MeterListRow): DcuMeterRow {
  return {
    status: m.online ? 'online' : 'offline',
    dcuSerial: m.dcuSerial,
    meterNo: m.meterNo,
    elecNo: m.elecNo,
    address: m.address,
    disabled: m.enabled ? 'N' : 'Y',
    whitelist: 'in',
    connectedDcu: m.dcuSerial,
    reportDevice: m.moduleSerial,
    fanMac: m.fanMac,
    signal: m.online ? 95 : 0,
    lastLp: m.lastLp,
    lastLpMins: m.lastLpSameDay ? 60 : 3000,
    lastMn: m.lastMn,
    lastMnMins: m.lastMnSameDay ? 600 : 3000,
  }
}

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      {children}
    </label>
  )
}

function Select({
  value, onChange, options, allLabel = 'ALL', width = 120,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[] | readonly { value: string; label: string }[]
  allLabel?: string
  width?: number
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={BOX} style={{ width }}>
      <option value={ALL}>{allLabel}</option>
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>,
      )}
    </select>
  )
}
