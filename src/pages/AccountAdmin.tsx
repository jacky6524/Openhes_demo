import { useMemo, useRef, useState } from 'react'
import { Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import type { Account } from '@/data/permissions'
import {
  Th, SearchHead, FilterHead, MenuItem, SortHead, useInfiniteRows, InfiniteFooter, type SortDir,
} from '@/components/table/tableBits'
import { AccountPill, ConfirmDialog } from '@/components/perm/PermUi'
import { EditAccountModal, NewAccountModal } from '@/components/perm/AccountModal'

/**
 * 權限管理 · 帳號管理 (Figma 3892:24609)。
 * 欄位：帳號（搜尋）／用戶名稱（搜尋）／電子郵件／角色（篩選）／狀態（篩選）＋ 編輯・刪除。
 * 設計稿是頁碼分頁，這裡比照全站改為**無限捲動**（業主已表示不要頁碼）。
 */
type SortKey = 'account' | 'userName' | 'email'
const ALL = 'ALL'

export function AccountAdmin() {
  const accounts = usePerm((s) => s.accounts)
  const roles = usePerm((s) => s.roles)
  const removeAccount = usePerm((s) => s.removeAccount)

  const [q, setQ] = useState({ account: '', userName: '' })
  const [menu, setMenu] = useState<null | 'account' | 'userName' | 'role' | 'state'>(null)
  const [roleFilter, setRoleFilter] = useState<string>(ALL)
  const [stateFilter, setStateFilter] = useState<string>(ALL)
  const [sortKey, setSortKey] = useState<SortKey>('account')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [removing, setRemoving] = useState<Account | null>(null)

  const rows = useMemo(() => {
    const list = accounts.filter(
      (a) =>
        a.account.toLowerCase().includes(q.account.trim().toLowerCase()) &&
        a.userName.toLowerCase().includes(q.userName.trim().toLowerCase()) &&
        (roleFilter === ALL || a.role === roleFilter) &&
        (stateFilter === ALL || a.state === stateFilter),
    )
    return [...list].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortKey].localeCompare(b[sortKey]))
  }, [accounts, q, roleFilter, stateFilter, sortKey, sortDir])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [q, roleFilter, stateFilter, sortKey, sortDir])
  const page = rows.slice(0, visible)

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  return (
    <div className="flex h-full min-w-[1080px] flex-col">
      {/* 頁面標題列（2026-09-23 依新版 Figma：標題與「申請帳號」在卡片外、頁面最上方） */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-6">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="text-[16px] font-semibold text-ink">帳號管理</h1>
        <span className="text-[12.5px] tabular-nums text-ink-mut">共 {rows.length} 個帳號</span>
        <span className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-ink px-3 py-1.5 text-[14px] font-semibold text-white hover:opacity-90"
        >
          申請帳號
        </button>
      </div>

      <div className="mx-6 mb-6 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface shadow-card">

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13.5px]">
            <thead className="sticky top-0 z-10 bg-surface text-ink-sub">
              <tr className="border-b border-border">
                <Th>
                  <SearchHead label="帳號" value={q.account} open={menu === 'account'}
                    onToggle={() => setMenu(menu === 'account' ? null : 'account')}
                    onChange={(v) => setQ((o) => ({ ...o, account: v }))} />
                </Th>
                <Th>
                  <SearchHead label="用戶名稱" value={q.userName} open={menu === 'userName'}
                    onToggle={() => setMenu(menu === 'userName' ? null : 'userName')}
                    onChange={(v) => setQ((o) => ({ ...o, userName: v }))} />
                </Th>
                <Th>
                  <SortHead label="電子郵件" active={sortKey === 'email'} dir={sortDir} onClick={() => toggleSort('email')} />
                </Th>
                <Th>
                  <FilterHead label="角色" open={menu === 'role'} onToggle={() => setMenu(menu === 'role' ? null : 'role')}>
                    <MenuItem active={roleFilter === ALL} onClick={() => { setRoleFilter(ALL); setMenu(null) }}>全部</MenuItem>
                    {roles.map((r) => (
                      <MenuItem key={r.code} active={roleFilter === r.name} onClick={() => { setRoleFilter(r.name); setMenu(null) }}>
                        {r.name}
                      </MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th>
                  <FilterHead label="狀態" open={menu === 'state'} onToggle={() => setMenu(menu === 'state' ? null : 'state')}>
                    {[{ v: ALL, l: '全部' }, { v: 'active', l: '使用中' }, { v: 'disabled', l: '停用' }].map((o) => (
                      <MenuItem key={o.v} active={stateFilter === o.v} onClick={() => { setStateFilter(o.v); setMenu(null) }}>
                        {o.l}
                      </MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th className="w-[92px]" />
              </tr>
            </thead>
            <tbody>
              {page.map((a) => (
                <tr key={a.id} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5 font-mono text-ink">{a.account}</td>
                  <td className="px-3 py-2.5 text-ink">{a.userName}</td>
                  <td className="px-3 py-2.5 text-ink-sub">{a.email}</td>
                  <td className="px-3 py-2.5 text-ink-sub">{a.role}</td>
                  <td className="px-3 py-2.5"><AccountPill active={a.state === 'active'} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setEditing(a)} title="編輯帳號" className="text-ink-mut hover:text-brand"><Pencil size={15} /></button>
                      <button onClick={() => setRemoving(a)} title="刪除帳號" className="text-ink-mut hover:text-brand"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {page.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-mut">查無符合條件的帳號</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>

        <div className="shrink-0">
          <InfiniteFooter loaded={page.length} total={rows.length} hasMore={hasMore}
            onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
        </div>
      </div>

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      {adding && <NewAccountModal onClose={() => setAdding(false)} />}
      {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title={`刪除「${removing.account}」`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { removeAccount(removing.id); setRemoving(null) }}
        />
      )}
    </div>
  )
}
