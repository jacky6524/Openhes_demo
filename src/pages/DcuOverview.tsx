import { useMemo, useState } from 'react'
import { FileText, Copy, Check, ClipboardList, Info, Settings } from 'lucide-react'
import { DCU_ROWS, DCU_SUMMARY, type DcuRow, type DcuStatus } from '@/data/dcuList'
import { DcuStreetMap } from '@/components/map/DcuStreetMap'
import { DcuMeterPanel } from '@/components/dcu/DcuMeterPanel'
import { DcuInfoDrawer } from '@/components/dcu/DcuInfoDrawer'
import {
  Th,
  StatusPill,
  SortHead,
  FilterHead,
  SearchHead,
  MenuItem,
  Pagination,
  PercentBadge,
  GREEN,
  RED,
  type SortDir,
} from '@/components/table/tableBits'
import { useNav } from '@/store/useNav'
import { fmtInt } from '@/lib/format'
import { status as statusTok } from '@/tokens'

const UPDATE_TIME = '2025-01-01 15:00'

/**
 * 裝置管理 · DCU 裝置列表 (Figma 2934:57458).
 *   ┌ 裝置列表 ─────────────── 更新時間 … ┐  街道地圖 + DCU 標記
 *   ┌ DCU 列表（hover 說明統計口徑）        讀表率色階圖例 ┐  可篩選/搜尋/排序 + 分頁
 * Each row has 複製 + 詳細資料 actions; 詳細資料 opens the DCU detail screen.
 */
export function DcuOverview() {
  // clicking a DCU row opens its meter panel beside the (compressed) list.
  // `selected` drives the animated split; `panelModel` keeps the panel mounted
  // through the retract animation so it can slide out before unmounting.
  const [selected, setSelected] = useState<string | null>(null)
  const [panelModel, setPanelModel] = useState<string | null>(null)

  const close = () => setSelected(null)
  const open = (model: string) => {
    if (selected === model) {
      close() // click the highlighted row again → retract
      return
    }
    setPanelModel(model)
    setSelected(model)
  }

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1100px]">
      <DcuMapPanel />
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: selected ? '1fr 1fr' : '1fr 0fr',
          columnGap: selected ? 12 : 0,
          transition: 'grid-template-columns 320ms ease, column-gap 320ms ease',
        }}
      >
        <DcuTable selected={selected} onSelectDcu={open} />
        <div
          className="min-w-0 overflow-hidden"
          style={{ opacity: selected ? 1 : 0, transition: 'opacity 240ms ease' }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && !selected) setPanelModel(null)
          }}
        >
          {panelModel && <DcuMeterPanel model={panelModel} onClose={close} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- map panel ------------------------------- */

function DcuMapPanel() {
  return (
    <div className="rounded-card bg-surface border border-border shadow-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: 'linear-gradient(90deg, #FBECEF 0%, #FDF6F7 55%, #FFFFFF 100%)' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-brand" />
          <h2 className="text-[15px] font-semibold text-ink">裝置列表</h2>
        </div>
        <span className="text-[12px] text-ink-mut">更新時間 {UPDATE_TIME}</span>
      </div>

      <div className="relative h-[320px] bg-inset/40 overflow-hidden">
        <DcuStreetMap />
        <div className="absolute bottom-3 left-4 z-10 flex items-end gap-4 rounded-lg bg-surface/90 backdrop-blur border border-border px-3 py-1.5 shadow-card">
          {[
            { label: '連線', color: GREEN },
            { label: '斷線', color: RED },
          ].map((l) => (
            <div key={l.label} className="flex flex-col items-center gap-1">
              <span className="text-[12px] text-ink-sub">{l.label}</span>
              <span className="h-1.5 w-9 rounded-full" style={{ background: l.color }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- table --------------------------------- */

type SortKey = 'read' | 'percent'
type StatusFilter = 'all' | DcuStatus

function DcuTable({ selected, onSelectDcu }: { selected: string | null; onSelectDcu: (m: string) => void }) {
  const openDcuDetail = useNav((s) => s.openDcuDetail)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [modelQ, setModelQ] = useState('')
  const [serialQ, setSerialQ] = useState('')
  const [menu, setMenu] = useState<null | 'status' | 'model' | 'serial'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState<string | null>(null)
  const [infoDcu, setInfoDcu] = useState<DcuRow | null>(null)

  const filtered = useMemo(() => {
    let rows = DCU_ROWS.filter(
      (d) =>
        (statusFilter === 'all' || d.status === statusFilter) &&
        d.model.toLowerCase().includes(modelQ.trim().toLowerCase()) &&
        d.serial.toLowerCase().includes(serialQ.trim().toLowerCase()),
    )
    if (sortKey) rows = [...rows].sort((a, b) => (sortDir === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]))
    return rows
  }, [statusFilter, modelQ, serialQ, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const copySerial = (serial: string) => {
    navigator.clipboard?.writeText(serial).then(() => {
      setCopied(serial)
      window.setTimeout(() => setCopied((c) => (c === serial ? null : c)), 1200)
    }, () => {})
  }
  const resetPage = () => setPage(1)

  return (
    <div className="rounded-card bg-surface border border-border shadow-card p-4">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        {/* 標題 hover 說明統計口徑（2026-09-03 業主意見） */}
        <div className="group relative">
          <h3 className="text-[15px] font-semibold text-ink cursor-default border-b border-dashed border-border-strong">
            DCU 列表
          </h3>
          <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-[248px] translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
              <div className="border-b border-divider bg-inset/50 px-3 py-1.5 text-[11px] font-semibold text-ink-sub">
                統計口徑
              </div>
              <div className="px-3 py-2 text-[11.5px] leading-snug text-ink-sub">
                本列表統計<b className="text-ink">以白名單為主</b>，且<b className="text-ink">不包含停用電表</b>。
              </div>
            </div>
          </div>
        </div>
        {/* 讀表率色階圖例 —— 上線/總數與 DCU/LTE/NB-IoT 頁籤依業主意見移除 */}
        <div className="flex items-center gap-3 text-[12px] text-ink-sub">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />＜50%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: statusTok.warning.fg }} />50-80%
          </span>
        </div>
      </div>

      {/* table */}
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-ink-sub border-b border-border">
            <Th>
              <FilterHead label="狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                {(['all', 'online', 'offline'] as StatusFilter[]).map((s) => (
                  <MenuItem
                    key={s}
                    active={statusFilter === s}
                    onClick={() => {
                      setStatusFilter(s)
                      setMenu(null)
                      resetPage()
                    }}
                  >
                    {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                  </MenuItem>
                ))}
              </FilterHead>
            </Th>
            <Th>
              <SearchHead
                label="DCU"
                value={modelQ}
                open={menu === 'model'}
                onToggle={() => setMenu(menu === 'model' ? null : 'model')}
                onChange={(v) => {
                  setModelQ(v)
                  resetPage()
                }}
              />
            </Th>
            <Th>
              <SearchHead
                label="DCU編號"
                value={serialQ}
                open={menu === 'serial'}
                onToggle={() => setMenu(menu === 'serial' ? null : 'serial')}
                onChange={(v) => {
                  setSerialQ(v)
                  resetPage()
                }}
              />
            </Th>
            <Th>上線數 / 總數</Th>
            <Th>
              <SortHead label="讀表" active={sortKey === 'read'} dir={sortDir} onClick={() => toggleSort('read')} />
            </Th>
            <Th>
              <SortHead label="百分比" active={sortKey === 'percent'} dir={sortDir} onClick={() => toggleSort('percent')} />
            </Th>
            <Th className="w-[150px]" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((d, i) => (
            <tr
              key={`${d.serial}-${i}`}
              onClick={() => onSelectDcu(d.model)}
              title="檢視此 DCU 的電表列表"
              className={`border-b border-divider cursor-pointer transition-colors ${
                selected === d.model ? 'bg-brand-soft/60' : 'hover:bg-inset/40'
              }`}
            >
              <td className="px-3 py-2.5">
                <StatusPill status={d.status} />
              </td>
              <td className="px-3 py-2.5">
                <span className={`font-mono ${selected === d.model ? 'text-brand font-semibold' : 'text-ink'}`}>
                  {d.model}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-ink">{d.serial}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink-sub">
                {fmtInt(d.online)} / {fmtInt(d.total)}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-ink">{fmtInt(d.read)}</td>
              <td className="px-3 py-2.5">
                <PercentBadge percent={d.percent} />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {d.alarms > 0 && (
                    <span className="grid place-items-center h-4 min-w-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold">
                      {d.alarms}
                    </span>
                  )}
                  <button onClick={() => copySerial(d.serial)} title="複製 DCU 編號" className="text-ink-mut hover:text-brand">
                    {copied === d.serial ? <Check size={15} className="text-normal" /> : <Copy size={15} />}
                  </button>
                  <button onClick={() => openDcuDetail(d.model)} title="詳細資料" className="text-ink-mut hover:text-brand">
                    <ClipboardList size={15} />
                  </button>
                  <button onClick={() => setInfoDcu(d)} title="DCU資料" className="text-ink-mut hover:text-brand">
                    <Info size={15} />
                  </button>
                  <button title="設定" className="text-ink-mut hover:text-brand">
                    <Settings size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-ink-mut">
                查無符合條件的 DCU
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(s) => {
          setPageSize(s)
          resetPage()
        }}
      />

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}

      {infoDcu && <DcuInfoDrawer dcu={infoDcu} onClose={() => setInfoDcu(null)} />}
    </div>
  )
}

