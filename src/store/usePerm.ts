import { create } from 'zustand'
import {
  SEED_ACCOUNTS, SEED_FUNC_ITEMS, SEED_PAGE_SUPPORTED, SEED_ROLES, seedPerms, seedTemplates,
  type Account, type FuncItem, type PermTemplate, type Role,
} from '@/data/permissions'

/**
 * 權限管理三頁的共用狀態（帳號／功能項目／角色權限）。
 * demo 用：新增、編輯、刪除都只改記憶體，重新整理即還原。
 * TODO: 上線改接 API 後，這裡的每個 action 對應一支後端 API。
 */
interface PermState {
  accounts: Account[]
  funcItems: FuncItem[]
  roles: Role[]
  /** 角色代碼 → 已開啟的權限鍵（見 permissions.ts 的 permKey） */
  perms: Record<string, string[]>
  /** 頁面 → 該頁面實際支援的功能（編輯功能項目時左側的「可選功能」；新增功能會加進指定頁面） */
  supported: Record<string, string[]>
  /** 角色權限範本 */
  templates: PermTemplate[]

  addAccount: (a: Omit<Account, 'id'>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  removeAccount: (id: string) => void

  addAction: (page: string, name: string) => void
  setFuncActions: (id: string, actions: string[]) => void

  addRole: (r: Role) => void
  updateRole: (code: string, patch: Partial<Role>) => void
  removeRole: (code: string) => void
  setPerms: (code: string, keys: string[]) => void
  /** 儲存為範本；同名範本直接覆寫。回傳範本 id */
  saveTemplate: (name: string, perms: string[]) => string
}

const now = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const usePerm = create<PermState>((set, get) => ({
  accounts: SEED_ACCOUNTS,
  funcItems: SEED_FUNC_ITEMS,
  roles: SEED_ROLES,
  perms: seedPerms(SEED_ROLES, SEED_FUNC_ITEMS),
  supported: SEED_PAGE_SUPPORTED,
  templates: seedTemplates(SEED_FUNC_ITEMS),

  addAccount: (a) =>
    set((s) => ({ accounts: [{ ...a, id: `ACC-${String(s.accounts.length + 1).padStart(3, '0')}` }, ...s.accounts] })),
  updateAccount: (id, patch) =>
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  removeAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),

  addAction: (page, name) =>
    set((s) => {
      const cur = s.supported[page] ?? []
      return cur.includes(name) ? s : { supported: { ...s.supported, [page]: [...cur, name] } }
    }),
  setFuncActions: (id, actions) =>
    set((s) => ({ funcItems: s.funcItems.map((f) => (f.id === id ? { ...f, actions, updatedAt: now() } : f)) })),

  addRole: (r) => set((s) => ({ roles: [...s.roles, r], perms: { ...s.perms, [r.code]: [] } })),
  updateRole: (code, patch) =>
    set((s) => ({ roles: s.roles.map((r) => (r.code === code ? { ...r, ...patch } : r)) })),
  removeRole: (code) =>
    set((s) => {
      const perms = { ...s.perms }
      delete perms[code]
      return { roles: s.roles.filter((r) => r.code !== code), perms }
    }),
  setPerms: (code, keys) => set((s) => ({ perms: { ...s.perms, [code]: keys } })),
  saveTemplate: (name, perms) => {
    const existing = get().templates.find((t) => t.name === name)
    const id = existing?.id ?? `TPL-${String(get().templates.length + 1).padStart(3, '0')}`
    set((s) => ({
      templates: existing
        ? s.templates.map((t) => (t.id === id ? { ...t, perms: [...perms] } : t))
        : [...s.templates, { id, name, perms: [...perms] }],
    }))
    return id
  },
}))
