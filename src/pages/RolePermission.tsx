import { useEffect, useMemo, useState } from 'react'
import { Pencil, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import { permGroups, permKey, type Role } from '@/data/permissions'
import { CheckBox, ConfirmDialog } from '@/components/perm/PermUi'
import { RoleModal } from '@/components/perm/RoleModal'
import { TemplateModal } from '@/components/perm/TemplateModal'

/**
 * 權限管理 · 角色權限管理 —— 2026-09-23 依新版 Figma（3901:35929 / 3901:39601）改版。
 *   左：角色列表（搜尋、新增角色；hover 才出現編輯／刪除）
 *   右：
 *     ① 角色權限範本 —— 選範本後「套用範本」一次勾好；目前勾選可「儲存為範本」
 *     ② 一個頁面一個區塊：標題列有全選框（部分勾選顯示「－」）與「已勾選 x / 共 y 項權限」，
 *        下方平鋪該頁面的可執行功能勾選框。原本的權限關鍵字搜尋、全部展開／收合已移除。
 *   改動（含套用範本）後右上「取消／儲存變更」才會亮起（設計稿註記：預設為 Disabled）。
 *
 * 設計稿是藍色系；這裡對應到專案的品牌 token（選取底色 brand-soft、勾選與主要按鈕 brand）。
 */
export function RolePermission() {
  const roles = usePerm((s) => s.roles)
  const funcItems = usePerm((s) => s.funcItems)
  const perms = usePerm((s) => s.perms)
  const templates = usePerm((s) => s.templates)
  const setPerms = usePerm((s) => s.setPerms)
  const removeRole = usePerm((s) => s.removeRole)

  const groups = useMemo(() => permGroups(funcItems), [funcItems])

  const [selected, setSelected] = useState<string>(roles[0]?.code ?? '')
  const [roleQ, setRoleQ] = useState('')
  /** 編輯中的權限（未儲存） */
  const [draft, setDraft] = useState<string[]>(perms[selected] ?? [])
  const [templateId, setTemplateId] = useState('')

  const [adding, setAdding] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [removingRole, setRemovingRole] = useState<Role | null>(null)

  // 換角色時重新載入該角色的權限
  useEffect(() => { setDraft(perms[selected] ?? []) }, [selected, perms])

  const role = roles.find((r) => r.code === selected)
  const dirty = useMemo(() => {
    const a = [...(perms[selected] ?? [])].sort().join('|')
    const b = [...draft].sort().join('|')
    return a !== b
  }, [perms, selected, draft])

  const shownRoles = roles.filter((r) => (r.name + r.code).toLowerCase().includes(roleQ.trim().toLowerCase()))

  const has = (k: string) => draft.includes(k)
  const toggle = (k: string) => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))
  /** 區塊全選：全勾 → 全取消；其他情況 → 全勾 */
  const toggleGroup = (keys: string[], allOn: boolean) =>
    setDraft((d) => (allOn ? d.filter((k) => !keys.includes(k)) : [...new Set([...d, ...keys])]))

  const applyTemplate = () => {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    // 只套用目前仍存在的權限（功能項目可能在範本存好之後被調整過）
    const valid = new Set(groups.flatMap((g) => g.actions.map((a) => permKey(g.key, a))))
    setDraft(t.perms.filter((k) => valid.has(k)))
  }

  const pickRole = (code: string) => {
    if (code === selected) return
    if (dirty && !window.confirm('這個角色的權限尚未儲存，要放棄變更嗎？')) return
    setSelected(code)
  }

  return (
    <div className="flex h-full min-w-[1180px] flex-col">
      {/* 頁面標題列 */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-6">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="text-[16px] font-semibold text-ink">角色權限管理</h1>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6 pt-3">
        {/* 左：角色列表 */}
        <div className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-divider px-4">
            <h2 className="flex-1 text-[16px] font-semibold text-ink">角色列表</h2>
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg bg-brand-soft px-3 py-1.5 text-[14px] font-semibold text-brand hover:bg-brand-soft-hover"
            >
              新增角色
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex shrink-0 items-center gap-1 rounded-md bg-bg py-2.5 pl-3 pr-2">
              <Search size={16} className="shrink-0 text-ink-mut" />
              <input
                value={roleQ}
                onChange={(e) => setRoleQ(e.target.value)}
                placeholder="搜尋"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mut"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              {shownRoles.map((r) => (
                <div
                  key={r.code}
                  onClick={() => pickRole(r.code)}
                  className={[
                    'group relative flex h-10 shrink-0 cursor-pointer items-center rounded-md px-4 text-[16px] font-medium text-ink',
                    r.code === selected ? 'bg-brand-soft' : 'hover:bg-inset',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1 truncate" title={`${r.name}（${r.code}）`}>{r.name}</span>
                  {/* 設計稿註記 HOVER：編輯／刪除平常隱藏，滑過才出現 */}
                  <span className="hidden items-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingRole(r)} title="編輯角色" className="grid h-6 w-6 place-items-center rounded-xl text-ink-sub hover:text-brand">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setRemovingRole(r)} title="刪除角色" className="grid h-6 w-6 place-items-center rounded-xl text-ink-sub hover:text-brand">
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              ))}
              {shownRoles.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-ink-mut">查無角色</p>}
            </div>
          </div>
        </div>

        {/* 右：角色權限 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-divider px-4">
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">{role?.name ?? '未選取角色'}</h2>
            <button
              onClick={() => setDraft(perms[selected] ?? [])}
              disabled={!dirty}
              className="rounded-lg border-[0.5px] border-border-strong px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-inset disabled:opacity-40 disabled:hover:bg-transparent"
            >
              取消
            </button>
            <button
              onClick={() => setPerms(selected, draft)}
              disabled={!dirty}
              className="rounded-lg bg-brand px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40 disabled:hover:bg-brand"
            >
              儲存變更
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            {/* ① 角色權限範本 */}
            <div className="flex shrink-0 flex-col gap-4 rounded-xl bg-brand-soft p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold text-ink">角色權限範本</h3>
                <button
                  onClick={() => setSavingTemplate(true)}
                  disabled={!role}
                  title="把目前勾選的權限存成範本"
                  className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-surface/70 disabled:opacity-40"
                >
                  儲存為範本
                </button>
              </div>
              <div className="flex items-end gap-3">
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={`w-[240px] rounded-md bg-surface py-2.5 pl-3 pr-2 text-[14px] outline-none focus:ring-1 focus:ring-brand ${templateId ? 'text-ink' : 'text-ink-mut'}`}
                >
                  <option value="">請選擇範本</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} className="text-ink">{t.name}（{t.perms.length} 項）</option>
                  ))}
                </select>
                <button
                  onClick={applyTemplate}
                  disabled={!templateId || !role}
                  title={templateId ? '套用後仍需按「儲存變更」才會生效' : '請先選擇範本'}
                  className="rounded-lg bg-ink px-3 py-1.5 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  套用範本
                </button>
              </div>
            </div>

            {/* ② 一個頁面一個區塊 */}
            {groups.map((g) => {
              const keys = g.actions.map((a) => permKey(g.key, a))
              const onCount = keys.filter(has).length
              const allOn = keys.length > 0 && onCount === keys.length
              return (
                <div key={g.key} className="flex shrink-0 flex-col gap-3 rounded-xl bg-bg p-4">
                  <div className="flex items-center gap-1">
                    <CheckBox
                      checked={allOn}
                      indeterminate={onCount > 0 && !allOn}
                      onChange={() => keys.length && toggleGroup(keys, allOn)}
                    />
                    <h3 className="text-[16px] font-semibold text-ink">{g.label}</h3>
                    <span className="ml-1 rounded px-1 py-0.5 text-[12px] tabular-nums text-ink-mut">
                      已勾選 {onCount} / 共 {keys.length} 項權限
                    </span>
                  </div>
                  {keys.length ? (
                    <div className="flex flex-wrap gap-2">
                      {g.actions.map((a) => {
                        const k = permKey(g.key, a)
                        return <CheckBox key={k} checked={has(k)} onChange={() => toggle(k)} label={a} className="w-[112px]" />
                      })}
                    </div>
                  ) : (
                    <span className="pl-7 text-[12.5px] text-ink-mut">此頁面尚未設定可執行功能（到「功能項目管理」設定）</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {adding && <RoleModal onClose={() => setAdding(false)} />}
      {savingTemplate && (
        <TemplateModal perms={draft} onSaved={setTemplateId} onClose={() => setSavingTemplate(false)} />
      )}
      {editingRole && <RoleModal role={editingRole} onClose={() => setEditingRole(null)} />}
      {removingRole && (
        <ConfirmDialog
          title={`刪除「${removingRole.name}」`}
          onCancel={() => setRemovingRole(null)}
          onConfirm={() => {
            removeRole(removingRole.code)
            if (removingRole.code === selected) setSelected(roles.find((r) => r.code !== removingRole.code)?.code ?? '')
            setRemovingRole(null)
          }}
        />
      )}
    </div>
  )
}
