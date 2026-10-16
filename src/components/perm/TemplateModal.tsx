import { useState } from 'react'
import { usePerm } from '@/store/usePerm'
import { Field, INPUT, ModalShell, Panel } from '@/components/perm/PermUi'

/**
 * 儲存為範本（Figma 4038:32228，480 寬：範本名稱輸入框 ＋ 已勾選權限數）。
 * 設計稿註記「勾選完 → 儲存為範本」：把目前右側勾好的權限（含未儲存的變更）存成範本；
 * 與既有範本同名時直接覆寫。
 */
export function TemplateModal({ perms, onSaved, onClose }: {
  perms: string[]
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const templates = usePerm((s) => s.templates)
  const saveTemplate = usePerm((s) => s.saveTemplate)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const exists = templates.some((t) => t.name === name.trim())

  const submit = () => {
    if (!name.trim()) return setErr('請輸入範本名稱')
    if (!perms.length) return setErr('尚未勾選任何權限，無法存成範本')
    onSaved(saveTemplate(name.trim(), perms))
    onClose()
  }

  return (
    <ModalShell title="儲存為範本" onClose={onClose} onSubmit={submit} submitLabel="儲存" width={480}>
      <Field label="範本名稱" required>
        <input
          autoFocus
          className={INPUT}
          value={name}
          onChange={(e) => { setName(e.target.value); setErr('') }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="請輸入"
        />
      </Field>
      <Panel className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-ink-sub">已勾選權限</span>
        <span className="text-[20px] font-semibold tabular-nums text-ink">
          {perms.length}<span className="ml-1 text-[12.5px] font-normal text-ink-mut">項</span>
        </span>
      </Panel>
      {exists && !err && <p className="text-[12.5px] text-ink-mut">已有同名範本，儲存後會覆寫原本的內容。</p>}
      {err && <p className="text-[12.5px] text-brand">{err}</p>}
    </ModalShell>
  )
}
