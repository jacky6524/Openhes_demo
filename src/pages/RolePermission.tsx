import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import { ALL_CASE_IDS, ALL_REGION_CODES, REGIONS, permGroups, permKey, type Role } from '@/data/permissions'
import { CASES, caseFullName } from '@/store/useCaseFilter'
import { CheckBox, ConfirmDialog } from '@/components/perm/PermUi'
import { RoleModal } from '@/components/perm/RoleModal'
import { TemplateModal } from '@/components/perm/TemplateModal'
import { TemplateManageModal } from '@/components/perm/TemplateManageModal'

/**
 * 權限管理 · 角色權限管理 —— 2026-09-23 依新版 Figma（3901:35929 / 3901:39601）改版。
 *   左：角色列表（搜尋、新增角色；hover 才出現編輯／刪除）
 *   右：
 *     ① 角色權限範本 —— 選範本後「套用範本」一次勾好；目前勾選可「儲存為範本」；「範本管理」可刪除範本
 *     ② 一個頁面一個區塊：標題列有全選框（部分勾選顯示「－」）與「已勾選 x / 共 y 項權限」，
 *        下方平鋪該頁面的可執行功能勾選框。原本的權限關鍵字搜尋、全部展開／收合已移除。
 *   改動（含套用範本）後右上「取消／儲存變更」才會亮起（設計稿註記：預設為 Disabled）。
 *
 * 2026-10-16 業主意見：
 *   · 角色要能依**案別、區處**區分權限 —— 新增「資料範圍」區塊，預設全選，可調成只開部分案別／區處
 *   · 勾選區排版整理：一個頁面一列（左：頁面名稱＋全選＋計數，右：整齊的功能選項格），選中的項目有底色，
 *     不再是浮動換行的零散勾選框
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
  const updateRole = usePerm((s) => s.updateRole)

  const groups = useMemo(() => permGroups(funcItems), [funcItems])

  const [selected, setSelected] = useState<string>(roles[0]?.code ?? '')
  const [roleQ, setRoleQ] = useState('')
  /** 編輯中的權限（未儲存） */
  const [draft, setDraft] = useState<string[]>(perms[selected] ?? [])
  const [templateId, setTemplateId] = useState('')

  const [adding, setAdding] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [managingTemplates, setManagingTemplates] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [removingRole, setRemovingRole] = useState<Role | null>(null)

  const role = roles.find((r) => r.code === selected)
  /** 編輯中的資料範圍（未儲存）：可看的案別／區處 */
  const [draftCases, setDraftCases] = useState<string[]>(role?.caseIds ?? ALL_CASE_IDS)
  const [draftRegions, setDraftRegions] = useState<string[]>(role?.regions ?? ALL_REGION_CODES)

  // 換角色時重新載入該角色的權限與資料範圍
  useEffect(() => {
    setDraft(perms[selected] ?? [])
    const r = roles.find((x) => x.code === selected)
    setDraftCases(r?.caseIds ?? ALL_CASE_IDS)
    setDraftRegions(r?.regions ?? ALL_REGION_CODES)
  }, [selected, perms, roles])

  const sameSet = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|')
  const dirty = useMemo(
    () =>
      !sameSet(perms[selected] ?? [], draft) ||
      !sameSet(role?.caseIds ?? ALL_CASE_IDS, draftCases) ||
      !sameSet(role?.regions ?? ALL_REGION_CODES, draftRegions),
    [perms, selected, draft, role, draftCases, draftRegions],
  )
  const revert = () => {
    setDraft(perms[selected] ?? [])
    setDraftCases(role?.caseIds ?? ALL_CASE_IDS)
    setDraftRegions(role?.regions ?? ALL_REGION_CODES)
  }
  const save = () => {
    setPerms(selected, draft)
    updateRole(selected, { caseIds: draftCases, regions: draftRegions })
  }
  const toggleIn = (set: (f: (cur: string[]) => string[]) => void, v: string) =>
    set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))

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
                  {(r.caseIds.length < ALL_CASE_IDS.length || r.regions.length < ALL_REGION_CODES.length) && (
                    <span className="mr-1 shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand group-hover:hidden" title="資料範圍受限">範圍受限</span>
                  )}
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
              onClick={revert}
              disabled={!dirty}
              className="rounded-lg border-[0.5px] border-border-strong px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-inset disabled:opacity-40 disabled:hover:bg-transparent"
            >
              取消
            </button>
            <button
              onClick={save}
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
                <div className="flex items-center gap-1">
                <button
                  onClick={() => setSavingTemplate(true)}
                  disabled={!role}
                  title="把目前勾選的權限存成範本"
                  className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-surface/70 disabled:opacity-40"
                >
                  儲存為範本
                </button>
                <button
                  onClick={() => setManagingTemplates(true)}
                  title="檢視、刪除已存的範本"
                  className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-surface/70"
                >
                  範本管理
                </button>
                </div>
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

            {/* ② 資料範圍：可看的案別與區處（預設全選） */}
            <div className="flex shrink-0 flex-col gap-4 rounded-xl bg-bg p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-semibold text-ink">資料範圍</h3>
                <span className="text-[12.5px] text-ink-mut">此角色可以看到哪些案別、哪些區處的資料（預設全選）</span>
              </div>
              <ScopeRow
                title="案別"
                total={CASES.length}
                count={draftCases.length}
                allOn={draftCases.length === CASES.length}
                onAll={() => setDraftCases(draftCases.length === CASES.length ? [] : CASES.map((c) => c.id))}
              >
                {CASES.map((c) => (
                  <Chip key={c.id} on={draftCases.includes(c.id)} onClick={() => toggleIn(setDraftCases, c.id)} label={caseFullName(c)} />
                ))}
              </ScopeRow>
              <ScopeRow
                title="區處"
                total={REGIONS.length}
                count={draftRegions.length}
                allOn={draftRegions.length === REGIONS.length}
                onAll={() => setDraftRegions(draftRegions.length === REGIONS.length ? [] : ALL_REGION_CODES)}
              >
                {REGIONS.map((r) => (
                  <Chip key={r.code} on={draftRegions.includes(r.code)} onClick={() => toggleIn(setDraftRegions, r.code)} label={`${r.code} ${r.name}`} />
                ))}
              </ScopeRow>
              {(draftCases.length === 0 || draftRegions.length === 0) && (
                <p className="text-[12.5px] text-brand">案別與區處都至少要選一項，否則這個角色看不到任何資料。</p>
              )}
            </div>

            {/* ③ 功能權限：一個頁面一列，左邊頁面名稱＋全選＋計數，右邊整齊的功能選項格 */}
            <div className="flex shrink-0 flex-col rounded-xl bg-bg">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <h3 className="text-[16px] font-semibold text-ink">功能權限</h3>
                <span className="text-[12.5px] text-ink-mut">各頁面可以執行的功能</span>
              </div>
              {groups.map((g) => {
                const keys = g.actions.map((a) => permKey(g.key, a))
                const onCount = keys.filter(has).length
                const allOn = keys.length > 0 && onCount === keys.length
                return (
                  <div key={g.key} className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4 border-t border-divider px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <CheckBox
                          checked={allOn}
                          indeterminate={onCount > 0 && !allOn}
                          onChange={() => keys.length && toggleGroup(keys, allOn)}
                        />
                        <h4 className="text-[15px] font-semibold text-ink">{g.label}</h4>
                      </div>
                      <span className="pl-7 text-[12px] tabular-nums text-ink-mut">已勾選 {onCount} / {keys.length} 項</span>
                    </div>
                    {keys.length ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                        {g.actions.map((a) => {
                          const k = permKey(g.key, a)
                          return <Chip key={k} on={has(k)} onClick={() => toggle(k)} label={a} />
                        })}
                      </div>
                    ) : (
                      <span className="py-1.5 text-[12.5px] text-ink-mut">此頁面尚未設定可執行功能（到「功能項目管理」設定）</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {adding && <RoleModal onClose={() => setAdding(false)} />}
      {savingTemplate && (
        <TemplateModal perms={draft} onSaved={setTemplateId} onClose={() => setSavingTemplate(false)} />
      )}
      {managingTemplates && (
        <TemplateManageModal
          onRemoved={(id) => setTemplateId((cur) => (cur === id ? '' : cur))}
          onClose={() => setManagingTemplates(false)}
        />
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

/** 可選項目格 —— 整格可點；選中時主色底與邊框，一眼分得出勾與沒勾 */
function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={[
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors',
        on ? 'border-brand/40 bg-brand-soft text-ink' : 'border-border bg-surface text-ink-sub hover:border-brand',
      ].join(' ')}
    >
      <span
        className={[
          'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[2px] border',
          on ? 'border-brand bg-brand text-white' : 'border-border-strong bg-surface',
        ].join(' ')}
      >
        {on && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

/** 資料範圍的一列：標題＋全選＋計數，下面接選項格 */
function ScopeRow({
  title, total, count, allOn, onAll, children,
}: { title: string; total: number; count: number; allOn: boolean; onAll: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <CheckBox checked={allOn} indeterminate={count > 0 && !allOn} onChange={onAll} />
        <h4 className="text-[15px] font-semibold text-ink">{title}</h4>
        <span className="ml-1 text-[12px] tabular-nums text-ink-mut">已選 {count} / {total}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2 pl-7">{children}</div>
    </div>
  )
}
