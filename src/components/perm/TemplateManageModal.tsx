import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { usePerm } from '@/store/usePerm'
import type { PermTemplate } from '@/data/permissions'
import { ConfirmDialog, ModalShell } from '@/components/perm/PermUi'

/**
 * 範本管理（2026-10-16 業主參考圖）：列出所有角色權限範本（名稱＋權限項數），可逐一刪除。
 * 刪除前跳確認；只刪範本本身，已套用過該範本的角色權限不受影響。
 */
export function TemplateManageModal({ onRemoved, onClose }: {
  onRemoved: (id: string) => void
  onClose: () => void
}) {
  const templates = usePerm((s) => s.templates)
  const removeTemplate = usePerm((s) => s.removeTemplate)
  const [removing, setRemoving] = useState<PermTemplate | null>(null)

  return (
    <>
      {/* 確認框開著時，Esc／點背景只關確認框 */}
      <ModalShell title="範本管理" onClose={() => !removing && onClose()} width={480} hideCancel>
        {templates.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-mut">目前沒有範本，可在右側勾好權限後按「儲存為範本」建立</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl bg-inset/50 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-semibold text-ink">{t.name}</span>
                  <span className="text-[12px] text-ink-sub">權限 {t.perms.length} 項</span>
                </div>
                <button
                  onClick={() => setRemoving(t)}
                  title="刪除範本"
                  className="grid h-8 w-8 place-items-center rounded-lg text-brand hover:bg-brand-soft"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalShell>
      {removing && (
        <ConfirmDialog
          title={`刪除範本「${removing.name}」`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { removeTemplate(removing.id); onRemoved(removing.id); setRemoving(null) }}
        />
      )}
    </>
  )
}
