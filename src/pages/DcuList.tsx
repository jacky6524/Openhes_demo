import { useMemo, useState } from 'react'
import { FileText, ClipboardList, Settings, Network, Ban } from 'lucide-react'
import { SearchButtons, NotSearched } from '@/components/shared/ListSearch'
import {
  DCU_LIST_ROWS, CHANNELS, COMM_TYPES, DCU_MODELS, DCU_GROUPS,
  type DcuListRow,
} from '@/data/dcuListPage'
import { Th, StatusPill, SortHead, Pagination, type SortDir } from '@/components/table/tableBits'
import { DcuModeModal } from '@/components/dcu/DcuModeModal'
import { TopologyModal } from '@/components/dcu/TopologyModal'
import { DcuDetailModal } from '@/components/dcu/DcuDetailModal'
import { DcuSettingsModal } from '@/components/dcu/DcuSettingsModal'
import type { DcuRow } from '@/data/dcuList'
import { status as statusTok } from '@/tokens'

/**
 * 裝置管理 · DCU清單 (Figma 3677:24866)。
 *
 * 與「裝置列表」不同頁：這一頁沒有地圖，是純清單 + 六個篩選 + 欄位搜尋，
 * 每列動作：詳細資料／裝置設定（拓樸圖暫時取消，見 SHOW_TOPOLOGY），右上可匯出與批次「修改模式」。
 */
type SortKey = 'serial' | 'code' | 'enabled' | 'meterCount' | 'address' | 'whitelistOnline'
  | 'channel' | 'comm' | 'ip' | 'mode' | 'whitelisted'

/** 欄位搜尋的可選欄位（設計稿的「搜尋」下拉） */
const SEARCH_FIELDS = [
  { key: 'serial', label: 'DCU序號' },
  { key: 'code', label: 'DCU編號' },
  { key: 'address', label: '地址' },
  { key: 'ip', label: 'IP' },
] as const
type SearchField = (typeof SEARCH_FIELDS)[number]['key']

const ALL = 'ALL'
/** 拓樸圖按鈕開關 —— 2026-09-23 業主要求暫時取消，改回 true 即恢復 */
const SHOW_TOPOLOGY = false

/** 查詢條件（搜尋欄＋各篩選）—— 畫面上編輯的是草稿，按「搜尋」才整組套用 */
interface Query {
  field: SearchField; text: string
  office: string; model: string; state: string; comm: string; channel: string; group: string
}
const EMPTY_QUERY: Query = { field: 'serial', text: '', office: '', model: ALL, state: ALL, comm: ALL, channel: ALL, group: ALL }

export function DcuList() {
  /**
   * 2026-09-23 依業主意見：進頁面**預設不載入清單**，要按「搜尋」才查詢；
   * 篩選欄也一併改成按「搜尋」才生效（真實系統是送出查詢條件給後端，不是前端即時過濾）。
   * applied＝null 代表尚未搜尋過。
   */
  const [draft, setDraft] = useState<Query>(EMPTY_QUERY)
  const [applied, setApplied] = useState<Query | null>(null)
  const set = <K extends keyof Query>(k: K, v: Query[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const search = () => { setApplied(draft); setPage(1); setPicked(new Set()) }
  const reset = () => { setDraft(EMPTY_QUERY); setApplied(null); setPage(1); setPicked(new Set()) }

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [modeOpen, setModeOpen] = useState(false)
  const [topoSerial, setTopoSerial] = useState<string | null>(null)
  const [detailSerial, setDetailSerial] = useState<string | null>(null)
  const [settingsRow, setSettingsRow] = useState<DcuListRow | null>(null)

  const filtered = useMemo(() => {
    if (!applied) return [] as DcuListRow[]
    const { office, model, state, comm, channel, group } = applied
    const q = applied.text.trim().toLowerCase()
    let rows = DCU_LIST_ROWS.filter((d) => {
      return (
        d.office.toLowerCase().includes(office.trim().toLowerCase()) &&
        (model === ALL || d.model === model) &&
        (state === ALL || (state === 'enabled' ? d.enabled : !d.enabled)) &&
        (comm === ALL || d.comm === comm) &&
        (channel === ALL || d.channel === channel) &&
        (group === ALL || d.group === group) &&
        (!q || String(d[applied.field]).toLowerCase().includes(q))
      )
    })
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const d = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? d : -d
      })
    }
    return rows
  }, [applied, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const allChecked = pageRows.length > 0 && pageRows.every((d) => picked.has(d.serial))

  const toggleAll = () =>
    setPicked((s) => {
      const n = new Set(s)
      if (allChecked) pageRows.forEach((d) => n.delete(d.serial))
      else pageRows.forEach((d) => n.add(d.serial))
      return n
    })
  const toggleOne = (serial: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(serial) ? n.delete(serial) : n.add(serial)
      return n
    })

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }
  const head = (k: SortKey, label: string) => (
    <Th><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )

  const pickedRows = DCU_LIST_ROWS.filter((d) => picked.has(d.serial))

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="rounded-card bg-surface border border-border shadow-card">
        {/* 標題列 */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-brand" />
            <h2 className="text-[15px] font-semibold text-ink">DCU清單</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              匯出
            </button>
            <button
              onClick={() => setModeOpen(true)}
              disabled={!picked.size}
              title={picked.size ? `修改 ${picked.size} 台的模式` : '請先勾選要修改的 DCU'}
              className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-40"
            >
              修改模式
            </button>
          </div>
        </div>

        {/* 搜尋列（最上層）—— 2026-09-23 業主意見：搜尋在上、篩選在下 */}
        <div className="flex flex-wrap items-end gap-3 px-4 pt-3 pb-2">
          <FilterField label="搜尋">
            <div className="flex items-center gap-2">
              <select
                value={draft.field}
                onChange={(e) => set('field', e.target.value as SearchField)}
                className={`${BOX} w-[110px]`}
              >
                {SEARCH_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <input
                value={draft.text}
                onChange={(e) => set('text', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="請輸入關鍵字（可留空）"
                className={`${BOX} w-[240px]`}
              />
            </div>
          </FilterField>
          <SearchButtons onSearch={search} onReset={reset} />
        </div>

        {/* 篩選列 —— 與搜尋欄一起在按下「搜尋」時套用 */}
        <div className="flex flex-wrap items-end gap-3 px-4 pt-1 pb-3 border-b border-border">
          <FilterField label="營業區">
            <input
              value={draft.office}
              onChange={(e) => set('office', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="請輸入"
              className={BOX}
            />
          </FilterField>
          <FilterField label="選擇DCU">
            <Select value={draft.model} onChange={(v) => set('model', v)} allLabel="所有型號" options={DCU_MODELS} />
          </FilterField>
          <FilterField label="狀態">
            <Select
              value={draft.state}
              onChange={(v) => set('state', v)}
              options={[{ value: 'enabled', label: '啟用' }, { value: 'disabled', label: '停用' }]}
            />
          </FilterField>
          <FilterField label="通訊方式">
            <Select value={draft.comm} onChange={(v) => set('comm', v)} options={COMM_TYPES} />
          </FilterField>
          <FilterField label="頻道組別">
            <Select value={draft.channel} onChange={(v) => set('channel', v)} options={CHANNELS} />
          </FilterField>
          <FilterField label="DCU群組">
            <Select value={draft.group} onChange={(v) => set('group', v)} options={DCU_GROUPS} />
          </FilterField>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[1560px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub border-b border-border">
                <Th className="w-[42px]">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand h-3.5 w-3.5 align-middle" />
                </Th>
                {head('serial', 'DCU序號')}
                {head('code', 'DCU編號')}
                <Th>連線狀態</Th>
                {head('enabled', '狀態')}
                {head('meterCount', '電表數')}
                {head('address', '地址')}
                <Th>區處及營業區</Th>
                {head('whitelistOnline', '白名單電表連線數')}
                {head('channel', '頻道組別')}
                {head('comm', '通訊方式')}
                {head('ip', 'IP')}
                {head('mode', '模式')}
                {head('whitelisted', '白名單')}
                <Th className={SHOW_TOPOLOGY ? 'w-[104px]' : 'w-[76px]'} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d) => (
                <tr key={d.serial} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.has(d.serial)}
                      onChange={() => toggleOne(d.serial)}
                      className="accent-brand h-3.5 w-3.5 align-middle"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-ink">{d.serial}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub">{d.code}</td>
                  <td className="px-3 py-2.5"><StatusPill status={d.online ? 'online' : 'offline'} /></td>
                  <td className="px-3 py-2.5 text-ink-sub">{d.enabled ? '啟用' : '停用'}</td>
                  <td className="px-3 py-2.5 tabular-nums text-ink">{d.meterCount}</td>
                  <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{d.address}</td>
                  <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{d.office}</td>
                  <td className="px-3 py-2.5 tabular-nums text-ink">{d.whitelistOnline}</td>
                  <td className="px-3 py-2.5 text-ink-sub">{d.channel}</td>
                  <td className="px-3 py-2.5 text-ink-sub">{d.comm}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub whitespace-nowrap">{d.ip}</td>
                  <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{d.mode}</td>
                  {/* 未加入白名單是需要處理的狀態，標紅 */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: d.whitelisted ? undefined : statusTok.danger.fg }}>
                    {d.whitelisted ? '已加入' : '未加入'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailSerial(d.serial)} title="詳細資料" className="text-ink-mut hover:text-brand">
                        <ClipboardList size={15} />
                      </button>
                      {/* 2026-10-01 業主意見：齒輪一律標「暫不啟用」（重啟DCU／Ping 也只是示意） */}
                      <button onClick={() => setSettingsRow(d)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                        <Settings size={15} />
                        <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                      </button>
                      {/* 拓樸圖按鈕 2026-09-23 依業主意見暫時取消；TopologyModal 仍保留，要恢復時把按鈕加回來即可 */}
                      {SHOW_TOPOLOGY && (
                        <button onClick={() => setTopoSerial(d.serial)} title="拓樸圖" className="text-ink-mut hover:text-brand">
                          <Network size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-3 py-10 text-center text-ink-mut">
                    {applied ? '查無符合條件的 DCU' : <NotSearched />}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {applied && (
          <div className="px-4 pb-3">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={(s) => { setPageSize(s); setPage(1) }}
              totalCount={filtered.length}
            />
          </div>
        )}
      </div>

      {modeOpen && (
        <DcuModeModal models={pickedRows.map((d) => d.model)} count={pickedRows.length} onClose={() => setModeOpen(false)} />
      )}
      {topoSerial && <TopologyModal serial={topoSerial} onClose={() => setTopoSerial(null)} />}
      {detailSerial && <DcuDetailModal model={detailSerial} onClose={() => setDetailSerial(null)} />}
      {settingsRow && (
        <DcuSettingsModal dcu={toDcuRow(settingsRow)} onClose={() => setSettingsRow(null)} />
      )}
    </div>
  )
}

/** DCU裝置設定彈窗吃的是舊的 DcuRow 形狀，這裡補齊它需要的欄位 */
function toDcuRow(d: DcuListRow): DcuRow {
  return {
    status: d.online ? 'online' : 'offline',
    model: d.serial,
    serial: d.code,
    online: d.whitelistOnline,
    total: d.meterCount,
    read: d.whitelistOnline,
    percent: d.meterCount ? (d.whitelistOnline / d.meterCount) * 100 : 0,
    alarms: 0,
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
  value,
  onChange,
  options,
  allLabel = 'ALL',
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[] | readonly { value: string; label: string }[]
  allLabel?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${BOX} w-[130px]`}>
      <option value={ALL}>{allLabel}</option>
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>,
      )}
    </select>
  )
}
