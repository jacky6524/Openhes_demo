import { useEffect, useMemo, useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { topologyOf, type TopologyNode } from '@/data/dcuListPage'

/**
 * 拓樸圖 modal (Figma 3812:33344) —— DCU 底下的電表收容關係。
 *
 * 每一筆電表佔**兩列**：上列是各項數值、下列整排是地址（設計稿如此，
 * 地址太長塞不進欄位）。可再往下掛一層（RF 中繼），以 −／＋ 展開收合。
 */
export function TopologyModal({ serial, onClose }: { serial: string; onClose: () => void }) {
  const { head, nodes } = useMemo(() => topologyOf(serial), [serial])
  // 預設展開第一筆，讓人一眼看出這張表是可展開的
  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes[0]?.children ? [nodes[0].meterNo] : []))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(1360px,96vw)] h-[86vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
          <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
            <X size={18} />
          </button>
          <h2 className="text-[16px] font-semibold text-ink">拓樸圖</h2>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-4">
          {/* DCU 連線摘要 */}
          <div className="grid grid-cols-2 md:grid-cols-6 items-end gap-x-6 gap-y-3 rounded-xl bg-inset/60 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-ink-mut">DCU</span>
              <span className="text-[17px] font-bold font-mono text-ink">{serial}</span>
            </div>
            {(
              [
                ['Telecom', head.telecom],
                ['TX/RX', head.txrx],
                ['RSSI', String(head.rssi)],
                ['Up Time', String(head.upTime)],
                ['Update Time', head.updateTime],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[12px] text-ink-mut">{label}</span>
                <span className="truncate text-[13px] font-semibold text-ink tabular-nums" title={value}>{value}</span>
              </div>
            ))}
          </div>

          {/* 樹狀表 */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[980px] text-[13px] border-collapse">
              <colgroup>
                {['52px', '190px', '200px', '180px', '170px', '110px', '1fr'].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-inset text-ink-sub">
                  <th />
                  {['表號', 'Customer', 'MAC', 'TX/RX', 'LQI', 'Update Time'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <NodeRows key={n.meterNo} node={n} depth={0} open={open} onToggle={toggle} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 一個節點 = 數值列 + 地址列（＋展開時的子節點） */
function NodeRows({
  node,
  depth,
  open,
  onToggle,
}: {
  node: TopologyNode
  depth: number
  open: Set<string>
  onToggle: (id: string) => void
}) {
  const hasKids = !!node.children?.length
  const expanded = open.has(node.meterNo)

  return (
    <>
      <tr className="border-t border-divider">
        <td className="px-2 align-middle">
          {hasKids && (
            <button
              onClick={() => onToggle(node.meterNo)}
              className="grid h-5 w-5 place-items-center rounded border border-border text-ink-sub hover:border-brand hover:text-brand"
              title={expanded ? '收合' : '展開'}
            >
              {expanded ? <Minus size={12} /> : <Plus size={12} />}
            </button>
          )}
        </td>
        <td className="px-3 py-2.5 font-mono text-ink whitespace-nowrap" style={{ paddingLeft: 12 + depth * 20 }}>
          {node.meterNo}
        </td>
        <td className="px-3 py-2.5 font-mono text-ink-sub whitespace-nowrap">{node.customer}</td>
        <td className="px-3 py-2.5 font-mono text-ink-sub whitespace-nowrap">{node.mac}</td>
        <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{node.txrx}</td>
        <td className="px-3 py-2.5 tabular-nums text-ink-sub">{node.lqi}</td>
        <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{node.updateTime}</td>
      </tr>
      {/* 地址獨立一列，橫跨數值欄 */}
      <tr>
        <td />
        <td colSpan={6} className="px-3 pb-2.5 text-ink-sub" style={{ paddingLeft: 12 + depth * 20 }}>
          {node.address}
        </td>
      </tr>
      {expanded &&
        node.children?.map((c) => (
          <NodeRows key={c.meterNo} node={c} depth={depth + 1} open={open} onToggle={onToggle} />
        ))}
    </>
  )
}
