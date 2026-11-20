import { useMemo, useState } from 'react'
import { FileText, ClipboardList, Settings, Ban } from 'lucide-react'
import { SearchButtons, NotSearched } from '@/components/shared/ListSearch'
import {
  METER_LIST_ROWS, METER_CATEGORIES, MODULE_MODELS, METER_GROUPS,
  type MeterListRow,
} from '@/data/dcuListPage'
import { Th, StatusPill, EventBadge, ONLINE_LABELS, SortHead, StampLines, ListTh, OneLine, TwoLine, LIST_TD, type ColAlign, type SortDir } from '@/components/table/tableBits'
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
 *
 * 2026-11-04 業主意見：
 *   · 日期改 YYYY/MM/DD HH:mm（同正式版 formatUpdateTime）
 *   · 標題旁只寫「共 N 筆」，不再寫「已載入 M」
 *   · 模組型號與模組序號同字級（原本序號小一號）
 *   · 不用「修改模式」：齒輪（裝置設定）不再開修改模式頁籤
 *
 * 2026-11-11 依正式機 API 欄位文件（1111調整內容/OpenHES_DCU與電表清單_API欄位_UIUX.md）同步欄位：
 *   · 欄位與順序：區處及營業區、連線狀態、電號、表號、模組型號、DCU編號、DCU序號、FAN MAC、模組序號、地址、IP、
 *     最後LP時間、最後MN時間、操作（取代 10-16 的順序）。正式機清單**沒有「狀態」欄**，拿掉；「狀態」篩選仍保留
 *   · 模組型號與模組序號拆成兩欄；新增 DCU編號、FAN MAC
 *   · 可排序欄：區處及營業區、電號、表號、模組型號、FAN MAC、地址（同正式機）
 *   · 連線狀態文字「在線／離線」；區處及營業區格式「02-北南 62」；缺值顯示「-」，時間缺值「--」
 *   · 詳細資料圖示有事件數 badge（> 0 才顯示）
 */
type SortKey = 'office' | 'elecNo' | 'meterNo' | 'moduleModel' | 'fanMac' | 'address'

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
  /** 可排序表頭；對齊規則見 tableBits 的 ListTh（與 DCU清單一致） */
  const head = (k: SortKey, label: string, align: ColAlign = 'left') => (
    <ListTh label={label} align={align} sort={{ active: sortKey === k, dir: sortDir, onClick: () => toggleSort(k) }} />
  )
  /** 最後LP／MN 時間：非當日標紅（與其他電表清單同一條規則）；只到時分，日期用斜線（'YYYY/MM/DD HH:mm'，同正式版） */
  const stale = (sameDay: boolean) => (sameDay ? undefined : statusTok.danger.fg)
  const hm = (t: string) => t.slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3')

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
                共 {filtered.length} 筆
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
        <div className="min-h-0 flex-1 overflow-auto px-4" onScroll={onScroll}>
          <table className="w-full table-auto text-[13px] border-collapse">
            {/* 欄位與順序比照正式機（2026-11-11 API 欄位文件 §4.4）；正式機清單沒有獨立「狀態」欄 */}
            {/* 2026-11-19 業主：內容與標題都盡量不換行 —— 不給固定欄寬，表格用 auto 版面讓每欄依內容取寬；
                寬度夠時全部一行，不夠時只有標題在指定位置（\n）換行、地址縮成兩行，再不夠才左右捲動 */}
            <thead>
              <tr className="text-ink-sub">
                {head('office', '區處及\n營業區')}
                <ListTh label={'連線\n狀態'} align="center" />
                {head('elecNo', '電號')}
                {head('meterNo', '表號')}
                {head('moduleModel', '模組\n型號')}
                <ListTh label="DCU編號" />
                <ListTh label="DCU序號" />
                {head('fanMac', 'FAN MAC')}
                <ListTh label={'模組\n序號'} />
                <ListTh label="地址" width={170} sort={{ active: sortKey === 'address', dir: sortDir, onClick: () => toggleSort('address') }} />
                <ListTh label="IP" />
                <ListTh label={'最後LP\n時間'} />
                <ListTh label={'最後MN\n時間'} />
                <ListTh />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.meterNo} className="border-b border-divider align-middle hover:bg-inset/40">
                  <td className={`${LIST_TD} text-ink-sub`}><OneLine value={m.office} /></td>
                  <td className={`${LIST_TD} text-center`}><StatusPill status={m.online ? 'online' : 'offline'} labels={ONLINE_LABELS} /></td>
                  <td className={`${LIST_TD} text-[13.5px] font-semibold tabular-nums text-ink`}><OneLine value={m.elecNo} /></td>
                  <td className={`${LIST_TD} text-[13.5px] font-semibold tabular-nums text-ink`}><OneLine value={m.meterNo} /></td>
                  <td className={`${LIST_TD} text-ink`}><OneLine value={m.moduleModel} /></td>
                  {/* 沒有掛 DCU 的電表：缺值一律「-」（正式機規則，不留白、不當成 0） */}
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}>{m.dcuCode ? <OneLine value={m.dcuCode} /> : <span className="font-sans text-ink-mut">-</span>}</td>
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}>{m.dcuSerial ? <OneLine value={m.dcuSerial} /> : <span className="font-sans text-ink-mut">-</span>}</td>
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}><OneLine value={m.fanMac} /></td>
                  {/* 序號不用等寬字：等寬字字身較矮，同為 13px 看起來仍小一號（業主 2026-11-04） */}
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}><OneLine value={m.moduleSerial} /></td>
                  <td className={`${LIST_TD} text-[14px] leading-snug text-ink`}><span className="line-clamp-2 block min-w-[150px] whitespace-normal leading-snug" title={m.address}>{m.address}</span></td>
                  <td className={`${LIST_TD} tabular-nums text-ink-sub`}><OneLine value={m.ip} /></td>
                  <td className={`${LIST_TD} leading-snug tabular-nums`} style={{ color: stale(m.lastLpSameDay) }}>{m.lastLp ? <StampLines value={hm(m.lastLp)} /> : '--'}</td>
                  <td className={`${LIST_TD} leading-snug tabular-nums`} style={{ color: stale(m.lastMnSameDay) }}>{m.lastMn ? <StampLines value={hm(m.lastMn)} /> : '--'}</td>
                  <td className={LIST_TD}>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailMeter(m.meterNo)} title={m.eventCount ? `詳細資料（${m.eventCount} 筆事件）` : '詳細資料'} className="text-ink-mut hover:text-brand">
                        <EventBadge count={m.eventCount}><ClipboardList size={15} /></EventBadge>
                      </button>
                      {/* 2026-10-01 業主意見：齒輪功能暫不啟用 → 疊禁止符號，仍可點開瀏覽（彈窗上方說明、操作停用） */}
                      <button onClick={() => setSettingsRow(m)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                        <Settings size={15} />
                        <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-10 text-center text-ink-mut">
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
      {settingsRow && <MeterSettingsModal meter={toMeterRow(settingsRow)} onClose={() => setSettingsRow(null)} />}
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

/** 輸入框／下拉一律固定 36px 高（h-9）：只靠 py 撐高時，原生 select 與 input 算出來的高度不同，會差 1～2px（2026-11-11） */
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
