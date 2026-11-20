import { useMemo, useState } from 'react'
import { FileText, ClipboardList, Settings, Network, Ban } from 'lucide-react'
import { SearchButtons, NotSearched } from '@/components/shared/ListSearch'
import {
  DCU_LIST_ROWS, CHANNELS, COMM_TYPES, DCU_MODELS, DCU_GROUPS,
  type DcuListRow,
} from '@/data/dcuListPage'
import { Th, StatusPill, EnabledState, EventBadge, ONLINE_LABELS, SortHead, ListTh, OneLine, TwoLine, LIST_TD, type ColAlign, type SortDir } from '@/components/table/tableBits'
import { STICKY_TH, useInfiniteRows } from '@/components/shared/Tabs'
import { TopologyModal } from '@/components/dcu/TopologyModal'
import { DcuDetailModal } from '@/components/dcu/DcuDetailModal'
import { DcuSettingsModal } from '@/components/dcu/DcuSettingsModal'
import type { DcuRow } from '@/data/dcuList'

/**
 * 裝置管理 · DCU清單 (Figma 3677:24866)。
 *
 * 與「裝置列表」不同頁：這一頁沒有地圖，是純清單 + 六個篩選 + 欄位搜尋，
 * 每列動作：詳細資料／裝置設定（拓樸圖暫時取消，見 SHOW_TOPOLOGY），右上可匯出。
 *
 * 2026-10-16 業主意見：
 *   · 「修改模式」搬進齒輪（只刻畫面、不開放），因此不需要勾選欄與批次按鈕；模式選項改為
 *     關閉RF／MN優先80%／正常模式／讀取1天LP
 *   · 欄位順序：區處及營業區、狀態、連線狀態、DCU序號、DCU編號、地址、IP、頻道組別、連線類型、模式、白名單鎖定(N/Y)
 *   · 重要資料（序號、地址）放大；整張表不出現左右捲軸；版面撐滿視窗、下方不留白，改無限捲動
 *
 * 2026-11-11 依正式機 API 欄位文件（1111調整內容/OpenHES_DCU與電表清單_API欄位_UIUX.md）同步欄位：
 *   · 欄位與順序：DCU序號、DCU編號、連線狀態、狀態、電表數、地址、區處及營業區、白名單電表連線數、
 *     頻道組別、通訊方式、IP、模式、白名單、操作（取代 10-16 的順序；「白名單鎖定」欄由「白名單 已加入／未加入」取代）
 *   · 連線狀態文字「在線／離線」；區處及營業區格式「02-北南 62」；連線類型改名「通訊方式」，多 SATCOM
 *   · 白名單電表連線數只在白名單已加入時顯示，否則「-」；詳細資料圖示有事件數 badge（> 0 才顯示）
 *   · 狀態欄置中（業主 2026-11-11：停用置中、啟用不含底框）
 *   · 2026-11-19 業主：白名單欄 已加入／未加入 → Y／N（置中）
 *   · 2026-11-19 業主：欄位參考台達（1119更新參考/台達dcu 清單.jpg）——順序改為
 *     區處及營業區、電表數、電表連線數（新增）、白名單電表連線數、連線狀態、狀態、DCU編號、DCU序號、
 *     頻道組別、連線類型（原「通訊方式」，改回台達用語）、地址、IP、模式、白名單、操作。
 *     台達的勾選欄不加（10-16 起批次修改模式已搬進齒輪）；白名單維持 Y／N、連線狀態維持文字標籤。
 */
type SortKey = 'serial' | 'code' | 'online' | 'enabled' | 'meterCount' | 'meterOnline' | 'address' | 'office' | 'whitelistOnline' | 'channel' | 'comm' | 'ip' | 'mode'

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

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
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
          : typeof av === 'boolean' ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), 'zh-Hant', { numeric: true })
        return sortDir === 'asc' ? d : -d
      })
    }
    return rows
  }, [applied, sortKey, sortDir])

  // 無限捲動：捲到底再多放一批；搜尋／排序變動就回到第一批
  const { visible, onScroll, reset: resetScroll } = useInfiniteRows(filtered.length)
  const rows = filtered.slice(0, visible)

  const search = () => { setApplied(draft); resetScroll() }
  const reset = () => { setDraft(EMPTY_QUERY); setApplied(null); resetScroll() }

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    resetScroll()
  }
  /** center：表頭置中（狀態欄） */
  /** 可排序表頭；對齊規則見 tableBits 的 ListTh（與電表清單一致） */
  const head = (k: SortKey, label: string, align: ColAlign = 'left', width?: number) => (
    <ListTh label={label} align={align} width={width} sort={{ active: sortKey === k, dir: sortDir, onClick: () => toggleSort(k) }} />
  )


  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-card bg-surface border border-border shadow-card">
        {/* 標題列 */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-brand" />
            <h2 className="text-[15px] font-semibold text-ink">DCU清單</h2>
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
        <div className="flex shrink-0 flex-wrap items-end gap-3 px-4 pt-1 pb-3 border-b border-border">
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
          <FilterField label="連線類型">
            <Select value={draft.comm} onChange={(v) => set('comm', v)} options={COMM_TYPES} />
          </FilterField>
          <FilterField label="頻道組別">
            <Select value={draft.channel} onChange={(v) => set('channel', v)} options={CHANNELS} />
          </FilterField>
          <FilterField label="DCU群組">
            <Select value={draft.group} onChange={(v) => set('group', v)} options={DCU_GROUPS} />
          </FilterField>
        </div>

        {/* 表格 —— 自己是捲動容器、表頭 sticky；欄寬隨視窗伸縮，不出現左右捲軸 */}
        <div className="min-h-0 flex-1 overflow-auto px-4" onScroll={onScroll}>
          <table className="w-full table-auto text-[13px] border-collapse">
            {/* 欄位與順序比照正式機（2026-11-11 API 欄位文件 §3.4） */}
            {/* 2026-11-19 業主：內容與標題都盡量不換行 —— 不給固定欄寬，表格用 auto 版面讓每欄依內容取寬；
                寬度夠時全部一行，不夠時只有標題在指定位置（\n）換行、地址縮成兩行，再不夠才左右捲動 */}
            <thead>
              <tr className="text-ink-sub">
                {head('office', '區處及\n營業區')}
                {/* 2026-11-19 業主：數字只有一兩位，欄不用那麼寬 → 標題直接疊成多行、欄寬縮到最小（width=1＝取最小寬） */}
                {head('meterCount', '電表數', 'right', 1)}
                {head('meterOnline', '電表\n連線數', 'right', 1)}
                {head('whitelistOnline', '白名單\n電表\n連線數', 'right', 1)}
                {head('online', '連線\n狀態', 'center')}
                {head('enabled', '狀態', 'center')}
                {head('code', 'DCU編號')}
                {head('serial', 'DCU序號')}
                {head('channel', '頻道\n組別', 'center')}
                {head('comm', '連線\n類型')}
                <ListTh label="地址" width={170} sort={{ active: sortKey === 'address', dir: sortDir, onClick: () => toggleSort('address') }} />
                {head('ip', 'IP')}
                {head('mode', '模式')}
                <ListTh label="白名單" align="center" />
                <ListTh />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.serial} className="border-b border-divider align-middle hover:bg-inset/40">
                  <td className={`${LIST_TD} text-ink-sub`}><OneLine value={d.office} /></td>
                  <td className={`${LIST_TD} text-right tabular-nums text-ink`}>{d.meterCount}</td>
                  <td className={`${LIST_TD} text-right tabular-nums text-ink`}>{d.meterOnline}</td>
                  {/* 正式機：whiteList=true 時才是「白名單電表連線數」；未加入白名單顯示「-」 */}
                  <td className={`${LIST_TD} text-right tabular-nums text-ink`}>{d.whitelisted ? d.whitelistOnline : <span className="text-ink-mut">-</span>}</td>
                  <td className={`${LIST_TD} text-center`}><StatusPill status={d.online ? 'online' : 'offline'} labels={ONLINE_LABELS} /></td>
                  {/* 停用＝灰底標籤、啟用＝純文字（無底框）；整欄置中（業主 2026-11-11） */}
                  <td className={`${LIST_TD} text-center`}><EnabledState enabled={d.enabled} /></td>
                  <td className={`${LIST_TD} text-[13.5px] font-semibold tabular-nums text-ink`}>{d.code ? <OneLine value={d.code} /> : <span className="font-sans font-normal text-ink-mut">-</span>}</td>
                  <td className={`${LIST_TD} text-[13.5px] font-semibold tabular-nums text-ink`}><OneLine value={d.serial} /></td>
                  <td className={`${LIST_TD} text-center text-ink-sub`}>{d.channel}</td>
                  <td className={`${LIST_TD} text-ink-sub`}><OneLine value={d.comm} /></td>
                  <td className={`${LIST_TD} text-[14px] leading-snug text-ink`}><span className="line-clamp-2 block min-w-[150px] whitespace-normal leading-snug" title={d.address}>{d.address}</span></td>
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}><OneLine value={d.ip} /></td>
                  {/* 非預設模式用主色標出，一眼看得出哪些 DCU 被調整過 */}
                  <td className={`${LIST_TD} leading-snug ${d.mode === '正常模式' ? 'text-ink-sub' : 'font-medium text-brand'}`}>{d.mode}</td>
                  {/* 2026-11-19 業主：已加入／未加入 → Y／N */}
                  <td className={`${LIST_TD} text-center ${d.whitelisted ? 'font-semibold text-ink' : 'text-ink-mut'}`}>{d.whitelisted ? 'Y' : 'N'}</td>
                  <td className={LIST_TD}>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailSerial(d.serial)} title={d.eventCount ? `詳細資料（${d.eventCount} 筆事件）` : '詳細資料'} className="text-ink-mut hover:text-brand">
                        <EventBadge count={d.eventCount}><ClipboardList size={15} /></EventBadge>
                      </button>
                      {/* 2026-10-01 業主意見：齒輪一律標「暫不啟用」（重啟DCU／Ping 也只是示意）；2026-10-16 起「修改模式」也在齒輪內 */}
                      <button onClick={() => setSettingsRow(d)} title="裝置設定（含修改模式；暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-3 py-10 text-center text-ink-mut">
                    {applied ? '查無符合條件的 DCU' : <NotSearched />}
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

      {topoSerial && <TopologyModal serial={topoSerial} onClose={() => setTopoSerial(null)} />}
      {detailSerial && <DcuDetailModal model={detailSerial} onClose={() => setDetailSerial(null)} />}
      {settingsRow && (
        <DcuSettingsModal dcu={toDcuRow(settingsRow)} mode={settingsRow.mode} onClose={() => setSettingsRow(null)} />
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

/** 輸入框／下拉一律固定 36px 高（h-9），與電表清單相同（2026-11-11） */
const BOX =
  'h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

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
