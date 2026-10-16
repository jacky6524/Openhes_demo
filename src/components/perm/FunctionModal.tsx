import { useState } from 'react'
import { ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft, GripVertical } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import type { FuncItem } from '@/data/permissions'
import { Field, INPUT, ModalShell } from '@/components/perm/PermUi'

/**
 * 新增可執行功能（Figma 3901:34779）—— 2026-10-16 起要先指定**適用頁面**，再填功能名稱：
 * 功能是掛在頁面底下的（每頁只列自己支援的功能），不再丟進全系統共用的大清單。
 */
export function NewFunctionModal({ onClose }: { onClose: () => void }) {
  const addAction = usePerm((s) => s.addAction)
  const funcItems = usePerm((s) => s.funcItems)
  const [page, setPage] = useState(funcItems[0]?.page ?? '')
  const [name, setName] = useState('')
  return (
    <ModalShell
      title="新增可執行功能"
      onClose={onClose}
      onSubmit={() => { if (page && name.trim()) { addAction(page, name.trim()); onClose() } }}
    >
      <Field label="適用頁面">
        <select className={INPUT} value={page} onChange={(e) => setPage(e.target.value)}>
          {funcItems.map((f) => <option key={f.id} value={f.page}>{f.page}</option>)}
        </select>
      </Field>
      <Field label="功能名稱">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="請輸入" />
      </Field>
      <p className="text-[12px] text-ink-mut">新增後會出現在該頁面「編輯可執行功能」左側的可選功能中，再拖拉到右側開放。</p>
    </ModalShell>
  )
}

/**
 * 編輯可執行功能 —— 2026-10-16 業主意見改版（原為 Figma 3901:35801 的勾選清單）：
 *   · 左右拖拉：左邊＝該頁面支援、但尚未開放的功能，右邊＝已開放的功能；
 *     可以把項目拖到另一邊，也可點項目、或用中間的箭頭按鈕移動（不方便拖拉時用）。
 *   · 左邊**只列該頁面實際支援的功能**，不再顯示整個系統的功能。
 */
export function EditFunctionModal({ item, onClose }: { item: FuncItem; onClose: () => void }) {
  const supported = usePerm((s) => s.supported)
  const setFuncActions = usePerm((s) => s.setFuncActions)

  // 該頁面支援的功能；萬一現有開放項目不在支援清單裡（舊資料），也併進來才不會憑空消失
  const universe = [...new Set([...(supported[item.page] ?? []), ...item.actions])]
  const [on, setOn] = useState<string[]>(item.actions)
  const off = universe.filter((a) => !on.includes(a))

  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<'off' | 'on' | null>(null)

  const move = (a: string, to: 'off' | 'on') =>
    setOn((cur) => (to === 'on' ? (cur.includes(a) ? cur : [...cur, a]) : cur.filter((x) => x !== a)))

  const drop = (to: 'off' | 'on') => {
    if (dragging) move(dragging, to)
    setDragging(null)
    setOver(null)
  }

  const column = (side: 'off' | 'on', list: string[]) => (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(side) }}
      onDragLeave={() => setOver((o) => (o === side ? null : o))}
      onDrop={() => drop(side)}
      className={[
        'flex min-h-[260px] flex-1 flex-col rounded-xl border-2 border-dashed p-3 transition-colors',
        over === side ? 'border-brand bg-brand-soft' : 'border-border bg-inset/50',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13.5px] font-semibold text-ink">{side === 'off' ? '可選功能' : '已開放功能'}</span>
        <span className="text-[12.5px] tabular-nums text-ink-mut">{list.length} 項</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {list.map((a) => (
          <div
            key={a}
            draggable
            onDragStart={() => setDragging(a)}
            onDragEnd={() => { setDragging(null); setOver(null) }}
            onDoubleClick={() => move(a, side === 'off' ? 'on' : 'off')}
            title="拖拉到另一邊，或雙擊移動"
            className={[
              'flex cursor-grab items-center gap-2 rounded-lg border bg-surface px-3 py-2.5 text-[13.5px] text-ink active:cursor-grabbing',
              side === 'on' ? 'border-brand/40' : 'border-border',
              dragging === a ? 'opacity-40' : 'hover:border-brand',
            ].join(' ')}
          >
            <GripVertical size={14} className="shrink-0 text-ink-fai" />
            <span className="flex-1">{a}</span>
            <button
              type="button"
              onClick={() => move(a, side === 'off' ? 'on' : 'off')}
              title={side === 'off' ? '開放' : '取消開放'}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-mut hover:bg-inset hover:text-brand"
            >
              {side === 'off' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="grid flex-1 place-items-center text-[12.5px] text-ink-fai">
            {side === 'off' ? '此頁面所有功能都已開放' : '尚未開放任何功能，從左邊拖拉過來'}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <ModalShell
      title="編輯可執行功能"
      width={760}
      onClose={onClose}
      onSubmit={() => { setFuncActions(item.id, universe.filter((a) => on.includes(a))); onClose() }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">頁面名稱</span>
        <span className="text-[19px] font-bold text-ink">{item.page}</span>
        <span className="text-[12px] text-ink-mut">僅列出此頁面實際支援的功能</span>
      </div>

      <div className="flex items-stretch gap-3">
        {column('off', off)}
        <div className="flex shrink-0 flex-col items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setOn(universe)}
            disabled={!off.length}
            title="全部開放"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-ink-sub hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ChevronsRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOn([])}
            disabled={!on.length}
            title="全部取消"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-ink-sub hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ChevronsLeft size={16} />
          </button>
        </div>
        {column('on', on)}
      </div>
    </ModalShell>
  )
}
