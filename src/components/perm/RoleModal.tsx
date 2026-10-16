import { useState } from 'react'
import { usePerm } from '@/store/usePerm'
import { ALL_CASE_IDS, ALL_REGION_CODES, type Role } from '@/data/permissions'
import { Field, INPUT, ModalShell } from '@/components/perm/PermUi'

/**
 * 新增／編輯角色（Figma 3901:39964、3901:40344）—— 角色代碼 ＋ 角色名稱。
 * 編輯時角色代碼不可改（它是權限表的鍵）。
 */
export function RoleModal({ role, onClose }: { role?: Role; onClose: () => void }) {
  const roles = usePerm((s) => s.roles)
  const addRole = usePerm((s) => s.addRole)
  const updateRole = usePerm((s) => s.updateRole)

  const [code, setCode] = useState(role?.code ?? '')
  const [name, setName] = useState(role?.name ?? '')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!code.trim() || !name.trim()) return setErr('角色代碼與角色名稱為必填')
    if (role) {
      updateRole(role.code, { name: name.trim() })
    } else {
      if (roles.some((r) => r.code === code.trim().toUpperCase())) return setErr('角色代碼已存在')
      // 資料範圍預設全選，建立後在「角色權限管理」右側調整
      addRole({ code: code.trim().toUpperCase(), name: name.trim(), caseIds: ALL_CASE_IDS, regions: ALL_REGION_CODES })
    }
    onClose()
  }

  return (
    <ModalShell title={role ? '編輯角色' : '新增角色'} onClose={onClose} onSubmit={submit}>
      <Field label="角色代碼">
        <input
          className={`${INPUT} ${role ? 'text-ink-mut' : ''}`}
          value={code}
          disabled={!!role}
          onChange={(e) => setCode(e.target.value)}
          placeholder="請輸入"
        />
      </Field>
      <Field label="角色名稱">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="請輸入" />
      </Field>
      {err && <p className="text-[12.5px] text-brand">{err}</p>}
    </ModalShell>
  )
}
