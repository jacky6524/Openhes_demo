import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { metersForDcu } from '@/data/dcuMeters'
import { DCU_LIST_ROWS } from '@/data/dcuListPage'
import { Th, SearchHead } from '@/components/table/tableBits'
import { SCROLL_BOX, STICKY_TH, useInfiniteRows } from '@/components/shared/Tabs'

/**
 * 轉移電表 (Figma 3569:40323) —— 把這台 DCU 底下的電表改掛到另一台 DCU。
 *
 * 原本是「DCU裝置設定」的一個頁籤，2026-08-28 依業主意見從那裡移除；
 * 2026-09-07 依業主意見改放進 **DCU詳細資料**——這裡本來就是在看某一台 DCU 的
 * 電表清單，要挑哪幾顆搬走，在同一個脈絡下判斷才合理。
 *
 * 左邊挑電表、右邊顯示轉移目標與已選清單；兩邊即時連動。
 */
export function MeterTransferPanel({ model }: { model: string }) {
  const all = useMemo(() => metersForDcu(model), [model])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [target, setTarget] = useState('')

  // 轉移目標：2026-11-11 依業主意見由下拉改成直接輸入 DCU 編號（DCU 數量多，下拉找不到）。
  // 輸入後即時檢查：不能轉給自己、要是系統裡存在的 DCU。
  const known = useMemo(() => new Set(DCU_LIST_ROWS.map((d) => d.serial.toUpperCase())), [])
  const t = target.trim().toUpperCase()
  const targetErr = !t ? '' : t === model.toUpperCase() ? '不能轉移至原 DCU' : !known.has(t) ? '查無此 DCU 編號' : ''
  const targetOk = !!t && !targetErr
  // 換一台 DCU 就重來，避免把上一台的選取帶過去
  useEffect(() => { setPicked(new Set()); setTarget('') }, [model])

  const rows = useMemo(
    () => all.filter((m) => m.meterNo.toLowerCase().includes(q.trim().toLowerCase())),
    [all, q],
  )
  const { visible, onScroll, reset } = useInfiniteRows(rows.length)
  useEffect(reset, [q, reset])
  const pageRows = rows.slice(0, visible)
  const allChecked = pageRows.length > 0 && pageRows.every((m) => picked.has(m.meterNo))

  const toggle = (meterNo: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(meterNo) ? n.delete(meterNo) : n.add(meterNo)
      return n
    })
  const toggleAll = () =>
    setPicked((s) => {
      const n = new Set(s)
      if (allChecked) pageRows.forEach((m) => n.delete(m.meterNo))
      else pageRows.forEach((m) => n.add(m.meterNo))
      return n
    })

  const pickedList = all.filter((m) => picked.has(m.meterNo))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* 左：挑電表 */}
      <div className="rounded-card bg-surface border border-border shadow-card p-4 min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">DCU: <span className="font-mono">{model}</span></span>
          <span className="text-[12.5px] text-ink-mut tabular-nums">（{picked.size}/{all.length}）</span>
        </div>

        <div className={`${SCROLL_BOX} max-h-[calc(100vh-380px)]`} onScroll={onScroll}>
          <table className="w-full min-w-[640px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                <Th className={`${STICKY_TH} w-[44px]`}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand h-3.5 w-3.5 align-middle" />
                </Th>
                <Th className={STICKY_TH}>電號</Th>
                <Th className={`${STICKY_TH} !z-20`}>
                  <SearchHead label="表號" value={q} open={menu} onToggle={() => setMenu(!menu)} onChange={setQ} />
                </Th>
                <Th className={STICKY_TH}>地址</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => (
                <tr
                  key={m.meterNo}
                  onClick={() => toggle(m.meterNo)}
                  className="border-b border-divider cursor-pointer hover:bg-inset/40"
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.has(m.meterNo)}
                      onChange={() => toggle(m.meterNo)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-brand h-3.5 w-3.5 align-middle"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-ink">{m.elecNo}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub">{m.meterNo}</td>
                  <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{m.address}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">查無符合條件的電表</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />}
      </div>

      {/* 右：轉移目標與已選清單 */}
      <div className="rounded-card bg-surface border border-border shadow-card p-4 flex flex-col gap-3">
        <div className="text-[14px] font-semibold text-ink">轉移DCU</div>

        <div>
          <div className="text-[12px] text-ink-mut mb-0.5">原DCU</div>
          <div className="text-[13px] font-mono text-ink">{model}</div>
        </div>

        <div className="flex items-center gap-2 text-ink-mut">
          <ArrowRight size={15} />
          <span className="h-px flex-1 bg-divider" />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-mut">轉移至DCU</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="請輸入 DCU 編號"
            className={`rounded-lg border bg-surface px-3 py-2 text-[13px] font-mono text-ink placeholder:font-sans placeholder:text-ink-mut focus:outline-none ${
              targetErr ? 'border-brand' : 'border-border focus:border-brand'
            }`}
          />
          {targetErr && <span className="text-[12px] text-brand">{targetErr}</span>}
        </label>

        <div className="flex min-h-0 flex-col gap-1">
          <span className="text-[12px] text-ink-mut">已選取表號</span>
          <div className="flex h-[300px] flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-inset/30 p-2">
            {pickedList.length === 0 ? (
              <div className="px-1 py-2 text-[12.5px] text-ink-mut">尚未選取</div>
            ) : (
              pickedList.map((m) => (
                <div key={m.meterNo} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-surface">
                  <span className="font-mono text-[13px] text-ink">{m.meterNo}</span>
                  <button onClick={() => toggle(m.meterNo)} className="text-ink-mut hover:text-brand" title="移除">
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPicked(new Set())}
            disabled={!picked.size}
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-sub hover:bg-inset disabled:opacity-40"
          >
            清除
          </button>
          <button
            disabled={!picked.size || !targetOk}
            title={!picked.size ? '請先選取要轉移的電表' : !targetOk ? '請輸入有效的目標 DCU 編號' : `將 ${picked.size} 顆電表轉移至 ${t}`}
            className="flex-1 rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-40"
          >
            確定轉移
          </button>
        </div>
      </div>
    </div>
  )
}
