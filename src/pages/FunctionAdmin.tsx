import { useMemo, useState } from 'react'
import { Pencil, ShieldCheck } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import type { FuncItem } from '@/data/permissions'
import { Th, SearchHead, FilterHead, MenuItem, SortHead, type SortDir } from '@/components/table/tableBits'
import { EditFunctionModal, NewFunctionModal } from '@/components/perm/FunctionModal'

/**
 * 權限管理 · 功能項目管理 (Figma 3901:30807)。
 * 一列一個頁面：頁面名稱（搜尋）／可執行功能（依功能篩選）／最後更新時間（排序）＋ 編輯。
 * 右上「新增功能」新增的是**可執行功能的名稱**（進入候選池），不是新增頁面。
 */
const ALL = 'ALL'

export function FunctionAdmin() {
  const funcItems = usePerm((s) => s.funcItems)
  const pool = usePerm((s) => s.actionPool)

  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<null | 'page' | 'action'>(null)
  const [actionFilter, setActionFilter] = useState<string>(ALL)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<FuncItem | null>(null)

  const rows = useMemo(() => {
    const list = funcItems.filter(
      (f) =>
        f.page.toLowerCase().includes(q.trim().toLowerCase()) &&
        (actionFilter === ALL || f.actions.includes(actionFilter)),
    )
    return [...list].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a.updatedAt.localeCompare(b.updatedAt))
  }, [funcItems, q, actionFilter, sortDir])

  return (
    <div className="flex h-full min-w-[1080px] flex-col">
      {/* 頁面標題列（2026-09-23 依新版 Figma：標題與「新增功能」在卡片外、頁面最上方） */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-6">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="text-[16px] font-semibold text-ink">功能項目管理</h1>
        <span className="text-[12.5px] tabular-nums text-ink-mut">共 {rows.length} 個頁面</span>
        <span className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-ink px-3 py-1.5 text-[14px] font-semibold text-white hover:opacity-90"
        >
          新增功能
        </button>
      </div>

      <div className="mx-6 mb-6 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface shadow-card">

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13.5px]">
            <thead className="sticky top-0 z-10 bg-surface text-ink-sub">
              <tr className="border-b border-border">
                <Th className="w-[34%]">
                  <SearchHead label="頁面名稱" value={q} open={menu === 'page'}
                    onToggle={() => setMenu(menu === 'page' ? null : 'page')} onChange={setQ} />
                </Th>
                <Th className="w-[36%]">
                  <FilterHead label="可執行功能" open={menu === 'action'} onToggle={() => setMenu(menu === 'action' ? null : 'action')}>
                    <MenuItem active={actionFilter === ALL} onClick={() => { setActionFilter(ALL); setMenu(null) }}>全部</MenuItem>
                    {pool.map((a) => (
                      <MenuItem key={a} active={actionFilter === a} onClick={() => { setActionFilter(a); setMenu(null) }}>{a}</MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th>
                  <SortHead label="最後更新時間" active dir={sortDir} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
                </Th>
                <Th className="w-[70px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5 font-medium text-ink">{f.page}</td>
                  <td className="px-3 py-2.5 text-ink-sub">
                    {f.actions.length ? f.actions.join('、') : <span className="text-ink-mut">—</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-sub">{f.updatedAt}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end">
                      <button onClick={() => setEditing(f)} title="編輯可執行功能" className="text-ink-mut hover:text-brand">
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">查無符合條件的頁面</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-2 text-[11.5px] text-ink-mut">
          這裡勾選的可執行功能，就是「角色權限管理」右側各頁面權限區塊的項目來源。
        </div>
      </div>

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      {adding && <NewFunctionModal onClose={() => setAdding(false)} />}
      {editing && <EditFunctionModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
