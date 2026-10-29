import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Check, ClipboardList, Info, Network } from 'lucide-react'
import { metersForDcu, type DcuMeterRow } from '@/data/dcuMeters'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterInfoDrawer } from '@/components/dcu/MeterInfoDrawer'
import type { DcuStatus } from '@/data/dcuList'
import {
  Th,
  StatusPill,
  SortHead,
  FilterHead,
  SearchHead,
  MenuItem,
  InfiniteFooter,
  useInfiniteRows,
  type SortDir,
} from '@/components/table/tableBits'

type SortKey = 'lqi' | 'time'
type StatusFilter = 'all' | DcuStatus

/**
 * Inline 電表 panel (Figma 2934:57879) — opens beside the DCU list when a DCU is
 * clicked, listing that DCU's meters. Back arrow closes it.
 */
export function DcuMeterPanel({ model, onClose }: { model: string; onClose: () => void }) {
  const all = useMemo(() => metersForDcu(model), [model])
  const online = all.filter((m) => m.status === 'online').length

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState({ meterNo: '', elecNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'meterNo' | 'elecNo'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [infoMeter, setInfoMeter] = useState<DcuMeterRow | null>(null)

  const filtered = useMemo(() => {
    let rows = all.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        r.meterNo.toLowerCase().includes(q.meterNo.trim().toLowerCase()) &&
        r.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()),
    )
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const d = sortKey === 'lqi' ? a.signal - b.signal : a.lastLp.localeCompare(b.lastLp)
        return sortDir === 'asc' ? d : -d
      })
    }
    return rows
  }, [all, statusFilter, q, sortKey, sortDir])

  // 無限捲動（業主不要頁碼）：換 DCU、篩選或排序變動回到第一批
  const { visible, sentinelRef, hasMore } = useInfiniteRows(filtered.length, [model, statusFilter, q, sortKey, sortDir], 10)
  const pageRows = filtered.slice(0, visible)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(t)
      window.setTimeout(() => setCopied((c) => (c === t ? null : c)), 1200)
    }, () => {})
  }
  const setSearch = (k: keyof typeof q, v: string) => {
    setQ((s) => ({ ...s, [k]: v }))
  }

  return (
    <div className="rounded-card bg-surface border border-border shadow-card p-4 min-w-0">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink shrink-0"
            title="關閉電表列表"
          >
            <ArrowLeft size={17} />
          </button>
          <h3 className="text-[15px] font-semibold text-ink truncate">
            電表 / DCU: <span className="font-mono">{model}</span>
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-sub tabular-nums">
            上線數 <b className="text-ink">{online}</b> / 總數 <b className="text-ink">{all.length}</b>
          </span>
          <button
            title="拓撲圖"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand text-white px-3 py-1 text-[12px] font-medium hover:bg-brand-deep"
          >
            <Network size={13} />
            Topology
          </button>
        </div>
      </div>

      {/* table：自己捲、表頭釘住 */}
      <div ref={scrollRef} className="max-h-[calc(100vh-300px)] min-h-[200px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-ink-sub border-b border-border">
            <Th className="sticky top-0 z-10 bg-inset">
              <FilterHead label="狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                {(['all', 'online', 'offline'] as StatusFilter[]).map((s) => (
                  <MenuItem
                    key={s}
                    active={statusFilter === s}
                    onClick={() => {
                      setStatusFilter(s)
                      setMenu(null)
                    }}
                  >
                    {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                  </MenuItem>
                ))}
              </FilterHead>
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SearchHead
                label="表號"
                value={q.meterNo}
                open={menu === 'meterNo'}
                onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')}
                onChange={(v) => setSearch('meterNo', v)}
              />
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SearchHead
                label="電號"
                value={q.elecNo}
                open={menu === 'elecNo'}
                onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')}
                onChange={(v) => setSearch('elecNo', v)}
              />
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">FAN ID</Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SortHead label="LQI" active={sortKey === 'lqi'} dir={sortDir} onClick={() => toggleSort('lqi')} />
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SortHead label="更新時間" active={sortKey === 'time'} dir={sortDir} onClick={() => toggleSort('time')} />
            </Th>
            <Th className="sticky top-0 z-10 w-[96px] bg-inset" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r, i) => (
            <tr key={`${r.meterNo}-${i}`} className="border-b border-divider hover:bg-inset/40">
              <td className="px-3 py-2.5">
                <StatusPill status={r.status} />
              </td>
              <td className="px-3 py-2.5 font-mono text-ink">{r.meterNo}</td>
              <td className="px-3 py-2.5 font-mono text-ink-sub">{r.elecNo}</td>
              <td className="px-3 py-2.5 font-mono text-ink-sub">{r.fanMac.slice(0, 14)}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink">{r.signal || '—'}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{r.lastLp}</td>
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
                </div>
              </td>
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-ink-mut">
                查無符合條件的電表
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={pageRows.length} total={filtered.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}

      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {infoMeter && <MeterInfoDrawer meter={infoMeter} onClose={() => setInfoMeter(null)} />}
    </div>
  )
}
