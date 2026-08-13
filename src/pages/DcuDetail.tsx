import { useMemo, useState } from 'react'
import { ArrowLeft, Copy, Check, Settings, ClipboardList, Info } from 'lucide-react'
import { metersForDcu, type DcuMeterRow } from '@/data/dcuMeters'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterInfoDrawer } from '@/components/dcu/MeterInfoDrawer'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import type { DcuStatus } from '@/data/dcuList'
import {
  Th,
  StatusPill,
  SortHead,
  FilterHead,
  SearchHead,
  MenuItem,
  Pagination,
  type SortDir,
} from '@/components/table/tableBits'
import { useNav } from '@/store/useNav'
import { status as statusTok } from '@/tokens'

const DATA_TYPES = ['電表資料(Meter list)', '事件資料(Event list)', '讀表資料(Reading list)']
const PAGE_SIZE = 10

type SortKey = 'signal' | 'lastLp' | 'lastMn'
type StatusFilter = 'all' | DcuStatus

/**
 * 裝置管理 · DCU 詳細資料 (Figma 2934:58398) — the meter list under one DCU.
 * 內容抽成 DcuDetailContent，供整頁（裝置列表進入）與彈窗（DCU總覽進入，
 * 與電表詳細資料同一種彈窗模式）共用。
 */
export function DcuDetail() {
  const model = useNav((s) => s.dcuModel) ?? 'AE1092D0000'
  const setView = useNav((s) => s.setView)
  const from = useNav((s) => s.dcuDetailFrom) // 從哪一頁進來就返回哪一頁

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1400px]">
      {/* header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView(from)}
          className="grid place-items-center h-8 w-8 rounded-lg text-ink-sub hover:bg-inset hover:text-ink"
          title={from === 'warroom' ? '返回 DCU總覽' : '返回 DCU 裝置列表'}
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-[16px] font-semibold text-ink">DCU詳細資料</h2>
      </div>
      <DcuDetailContent model={model} />
    </div>
  )
}

/** DCU 詳細資料內容（裝置 + 資料類型 + 電表表格）；頁面與彈窗共用 */
export function DcuDetailContent({ model }: { model: string }) {
  const [dataType, setDataType] = useState(DATA_TYPES[0])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState({ dcuSerial: '', meterNo: '', elecNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'dcuSerial' | 'meterNo' | 'elecNo'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState<string | null>(null)
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [infoMeter, setInfoMeter] = useState<DcuMeterRow | null>(null)
  const [settingsMeter, setSettingsMeter] = useState<DcuMeterRow | null>(null)

  const all = useMemo(() => metersForDcu(model), [model])

  const filtered = useMemo(() => {
    let rows = all.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        r.dcuSerial.toLowerCase().includes(q.dcuSerial.trim().toLowerCase()) &&
        r.meterNo.toLowerCase().includes(q.meterNo.trim().toLowerCase()) &&
        r.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()),
    )
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const d = sortKey === 'signal' ? a.signal - b.signal : a[sortKey].localeCompare(b[sortKey])
        return sortDir === 'asc' ? d : -d
      })
    }
    return rows
  }, [all, statusFilter, q, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text)
      window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200)
    }, () => {})
  }
  const resetPage = () => setPage(1)
  const setSearch = (k: keyof typeof q, v: string) => {
    setQ((s) => ({ ...s, [k]: v }))
    resetPage()
  }

  return (
    <>
      {/* device + data-type */}
      <div className="flex items-end gap-8">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-ink-mut">裝置</span>
          <span className="text-[22px] font-bold tracking-tight text-ink font-mono">{model}</span>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-mut">資料類型</span>
          <select
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            className="w-[220px] rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
          >
            {DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* table card —— 12 欄較寬，容器不夠寬時讓表格自己橫向捲動，不要擠壓欄位 */}
      <div className="rounded-card bg-surface border border-border shadow-card p-4">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[1340px] text-[13px] border-collapse">
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
                  label="DCU編號"
                  value={q.dcuSerial}
                  open={menu === 'dcuSerial'}
                  onToggle={() => setMenu(menu === 'dcuSerial' ? null : 'dcuSerial')}
                  onChange={(v) => setSearch('dcuSerial', v)}
                />
              </Th>
              <Th>
                <SearchHead
                  label="表號"
                  value={q.meterNo}
                  open={menu === 'meterNo'}
                  onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')}
                  onChange={(v) => setSearch('meterNo', v)}
                />
              </Th>
              <Th>
                <SearchHead
                  label="電號"
                  value={q.elecNo}
                  open={menu === 'elecNo'}
                  onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')}
                  onChange={(v) => setSearch('elecNo', v)}
                />
              </Th>
              <Th>地址</Th>
              <Th>停用</Th>
              <Th>回報裝置</Th>
              <Th>FAN MAC</Th>
              <Th>
                <SortHead label="訊號值" active={sortKey === 'signal'} dir={sortDir} onClick={() => toggleSort('signal')} />
              </Th>
              <Th>
                <SortHead label="最後LP時間" active={sortKey === 'lastLp'} dir={sortDir} onClick={() => toggleSort('lastLp')} />
              </Th>
              <Th>
                <SortHead label="最後MN時間" active={sortKey === 'lastMn'} dir={sortDir} onClick={() => toggleSort('lastMn')} />
              </Th>
              <Th className="w-[140px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={`${r.meterNo}-${i}`} className="border-b border-divider hover:bg-inset/40">
                <td className="px-3 py-2.5">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-3 py-2.5 font-mono text-ink">{r.dcuSerial}</td>
                <td className="px-3 py-2.5 font-mono text-ink">{r.meterNo}</td>
                <td className="px-3 py-2.5 font-mono text-ink-sub">{r.elecNo}</td>
                <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{r.address}</td>
                <td className="px-3 py-2.5" style={{ color: r.disabled === 'Y' ? statusTok.danger.fg : undefined }}>
                  {r.disabled}
                </td>
                <td className="px-3 py-2.5 font-mono text-ink-sub">{r.reportDevice}</td>
                <td className="px-3 py-2.5 font-mono text-ink-sub">{r.fanMac}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink">{r.signal || '—'}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{r.lastLp}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{r.lastMn}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => copy(r.meterNo)} title="複製表號" className="text-ink-mut hover:text-brand">
                      {copied === r.meterNo ? <Check size={15} className="text-normal" /> : <Copy size={15} />}
                    </button>
                    <button onClick={() => setDetailMeter(r.meterNo)} title="詳細資料" className="text-ink-mut hover:text-brand">
                      <ClipboardList size={15} />
                    </button>
                    <button onClick={() => setInfoMeter(r)} title="電表資料" className="text-ink-mut hover:text-brand">
                      <Info size={15} />
                    </button>
                    <button onClick={() => setSettingsMeter(r)} title="裝置設定" className="text-ink-mut hover:text-brand">
                      <Settings size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-ink-mut">
                  查無符合條件的資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <Pagination page={safePage} totalPages={totalPages} onPage={setPage} totalCount={filtered.length} />

        {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      </div>

      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {infoMeter && <MeterInfoDrawer meter={infoMeter} onClose={() => setInfoMeter(null)} />}
      {settingsMeter && <MeterSettingsModal meter={settingsMeter} onClose={() => setSettingsMeter(null)} />}
    </>
  )
}
