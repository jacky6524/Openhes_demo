import { useState } from 'react'
import { usePerm } from '@/store/usePerm'
import type { FuncItem } from '@/data/permissions'
import { Field, INPUT, ModalShell } from '@/components/perm/PermUi'

/** 新增可執行功能（Figma 3901:34779）—— 只有一個「功能名稱」欄位 */
export function NewFunctionModal({ onClose }: { onClose: () => void }) {
  const addAction = usePerm((s) => s.addAction)
  const [name, setName] = useState('')
  return (
    <ModalShell
      title="新增可執行功能"
      onClose={onClose}
      onSubmit={() => { if (name.trim()) { addAction(name.trim()); onClose() } }}
    >
      <Field label="功能名稱">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="請輸入" />
      </Field>
      <p className="text-[12px] text-ink-mut">新增後會出現在各頁面的「編輯可執行功能」清單中，供勾選。</p>
    </ModalShell>
  )
}

/**
 * 編輯可執行功能（Figma 3901:35801）—— 上方全選（右側顯示已選 / 總數），
 * 下方是候選功能的勾選清單。
 */
export function EditFunctionModal({ item, onClose }: { item: FuncItem; onClose: () => void }) {
  const pool = usePerm((s) => s.actionPool)
  const setFuncActions = usePerm((s) => s.setFuncActions)
  const [picked, setPicked] = useState<string[]>(item.actions)

  const toggle = (a: string) =>
    setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))
  const allOn = picked.length === pool.length

  return (
    <ModalShell title="編輯可執行功能" onClose={onClose} onSubmit={() => { setFuncActions(item.id, picked); onClose() }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">頁面名稱</span>
        <span className="text-[19px] font-bold text-ink">{item.page}</span>
      </div>

      <div className="rounded-xl bg-inset/50 p-2">
        <label className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-surface/70">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand"
            checked={allOn}
            onChange={() => setPicked(allOn ? [] : [...pool])}
          />
          <span className="text-[13.5px] text-ink">全選</span>
          <span className="flex-1" />
          <span className="text-[12.5px] tabular-nums text-ink-mut">
            （<b className="text-brand">{picked.length}</b>/{pool.length}）
          </span>
        </label>
        <div className="mt-1 border-t border-divider pt-1">
          {pool.map((a) => (
            <label key={a} className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-surface/70">
              <input type="checkbox" className="h-3.5 w-3.5 accent-brand" checked={picked.includes(a)} onChange={() => toggle(a)} />
              <span className="text-[13.5px] text-ink">{a}</span>
            </label>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}
