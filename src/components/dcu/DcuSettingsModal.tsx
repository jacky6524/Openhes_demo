import { useEffect, useMemo, useState } from 'react'
import { X, ArrowLeftRight, Pencil, Cog, Trash2, Monitor } from 'lucide-react'
import { metersForDcu } from '@/data/dcuMeters'
import type { DcuRow } from '@/data/dcuList'
import { Th, SortHead, Pagination, type SortDir } from '@/components/table/tableBits'

/**
 * DCU裝置設定 modal (Figma 2958:9080) — opened from 裝置設定 in the DCU資料
 * drawer. Active tab 轉移電表: pick meters on the left, they collect into the
 * 轉移DCU panel on the right. Other tabs are stubbed for the demo.
 */
const TABS = [
  { key: 'transfer', label: '轉移電表', icon: ArrowLeftRight },
  { key: 'modify', label: '修改裝置', icon: Pencil },
  { key: 'remote', label: '遠端設定', icon: Cog },
  { key: 'delete', label: '刪除', icon: Trash2 },
  { key: 'online', label: '線上操作', icon: Monitor },
] as const

const PAGE_SIZE = 9

export function DcuSettingsModal({ dcu, onClose }: { dcu: DcuRow; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('transfer')
  const all = useMemo(() => metersForDcu(dcu.model), [dcu.model])
  const [selected, setSelected] = useState<Set<number>>(() => new Set([0, 1, 2, 3]))
  const [target, setTarget] = useState('AE1092D0020')
  const [sortAsc, setSortAsc] = useState<SortDir | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const indexed = useMemo(() => {
    const arr = all.map((row, idx) => ({ row, idx }))
    if (sortAsc) arr.sort((a, b) => (sortAsc === 'asc' ? 1 : -1) * a.row.lastLp.localeCompare(b.row.lastLp))
    return arr
  }, [all, sortAsc])

  const totalPages = Math.max(1, Math.ceil(indexed.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = indexed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageIdx = pageItems.map((it) => it.idx)
  const allChecked = pageIdx.length > 0 && pageIdx.every((i) => selected.has(i))

  const toggle = (idx: number) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(idx) ? n.delete(idx) : n.add(idx)
      return n
    })
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (allChecked) pageIdx.forEach((i) => n.delete(i))
      else pageIdx.forEach((i) => n.add(i))
      return n
    })

  const selectedList = [...selected].sort((a, b) => a - b).map((i) => all[i])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(1180px,96vw)] max-h-[92vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
              <X size={18} />
            </button>
            <h2 className="text-[16px] font-semibold text-ink">DCU裝置設定</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              取消
            </button>
            <button onClick={onClose} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep">
              確定
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 shrink-0">
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] border transition-colors',
                  active ? 'bg-brand-soft text-brand border-brand/30 font-medium' : 'text-ink-sub border-border hover:bg-inset',
                ].join(' ')}
              >
                <Icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* body */}
        <div className="overflow-y-auto p-5">
          {tab !== 'transfer' ? (
            <div className="py-16 text-center text-ink-mut text-[13px]">「{TABS.find((t) => t.key === tab)?.label}」功能示意（demo）</div>
          ) : (
            <div className="grid grid-cols-[1fr_290px] gap-5">
              {/* left: meter picker */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px] font-semibold text-ink">DCU: {dcu.model}</span>
                  <span className="text-[12px] text-ink-mut">({selected.size}/{all.length})</span>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <LabeledSelect label="資料類型" />
                  <LabeledSelect label="資料類型" />
                  <button className="rounded-lg bg-inset text-ink-sub hover:text-ink px-4 py-2 text-[13px] border border-border">搜尋</button>
                </div>

                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="text-ink-sub border-b border-border">
                      <Th className="w-[44px]">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand h-3.5 w-3.5 align-middle" />
                      </Th>
                      <Th>電號</Th>
                      <Th>表號</Th>
                      <Th>
                        <SortHead label="更新時間" active={sortAsc != null} dir={sortAsc ?? 'desc'} onClick={() => setSortAsc((d) => (d === 'asc' ? 'desc' : 'asc'))} />
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(({ row, idx }) => (
                      <tr key={idx} className="border-b border-divider hover:bg-inset/40 cursor-pointer" onClick={() => toggle(idx)}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={selected.has(idx)} onChange={() => toggle(idx)} onClick={(e) => e.stopPropagation()} className="accent-brand h-3.5 w-3.5 align-middle" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-ink">{row.elecNo}</td>
                        <td className="px-3 py-2.5 font-mono text-ink-sub">{row.meterNo}</td>
                        <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{row.lastLp.slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Pagination page={safePage} totalPages={totalPages} onPage={setPage} totalCount={all.length} />
              </div>

              {/* right: transfer panel */}
              <div className="rounded-xl border border-border bg-inset/30 p-4 flex flex-col gap-3">
                <div className="text-[14px] font-semibold text-ink">轉移DCU</div>
                <div>
                  <div className="text-[12px] text-ink-mut mb-0.5">原DCU</div>
                  <div className="text-[13px] font-mono text-ink">{dcu.model}</div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-ink-mut">轉移至DCU</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
                  >
                    {['AE1092D0020', 'AE1092D0031', 'AE1092D0045', 'AE1092D0102'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1 min-h-0">
                  <span className="text-[12px] text-ink-mut">已選取表號</span>
                  <div className="rounded-lg border border-border bg-surface h-[280px] overflow-y-auto p-2 flex flex-col gap-0.5">
                    {selectedList.length === 0 ? (
                      <div className="text-[12px] text-ink-mut px-1 py-2">尚未選取</div>
                    ) : (
                      selectedList.map((m, i) => (
                        <div key={i} className="text-[13px] font-mono text-ink px-1.5 py-1 rounded hover:bg-inset">
                          {m.meterNo}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LabeledSelect({ label }: { label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      <select className="w-[200px] rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand">
        <option>電表資料(Meter list)</option>
        <option>事件資料(Event list)</option>
      </select>
    </label>
  )
}
