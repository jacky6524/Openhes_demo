import { useEffect, type ReactNode } from 'react'
import { X, AlertCircle, Check, Minus } from 'lucide-react'
import { status as statusTok } from '@/tokens'

/**
 * 權限管理三頁共用的版面零件（Figma 3892:24129）。
 * 彈窗版式：左上 X ＋ 標題，右上「取消 / 送出」；內容區為淺灰卡片。
 * 另含角色權限管理用的三態勾選框 CheckBox（檔案最下方）。
 */

export const INPUT =
  'w-full rounded-lg border border-border bg-inset/40 px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand focus:bg-surface'

export function ModalShell({
  title, onClose, onSubmit, submitLabel = '送出', width = 520, hideCancel = false, children,
}: {
  title: string
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
  width?: number
  /** 純檢視／管理用彈窗（如範本管理）不顯示右上「取消」 */
  hideCancel?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[88vh] w-full flex-col rounded-2xl border border-border bg-surface shadow-drawer modal-pop"
        style={{ maxWidth: width }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
            <X size={18} />
          </button>
          <h2 className="text-[15.5px] font-semibold text-ink">{title}</h2>
          <span className="flex-1" />
          {!hideCancel && (
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              取消
            </button>
          )}
          {onSubmit && (
            <button onClick={onSubmit} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep">
              {submitLabel}
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

/** 表單欄位（必填時標題前有紅色 *） */
export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[12.5px] text-ink-sub">
        {required && <b className="mr-0.5 font-normal text-brand">*</b>}
        {label}
      </span>
      {children}
    </label>
  )
}

/** 唯讀資訊（編輯帳號的驗證時間、登入時間…） */
export function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[12px] text-ink-mut">{label}</span>
      <span className="truncate text-[13.5px] font-semibold tabular-nums text-ink" title={value}>{value || '-'}</span>
    </div>
  )
}

/** 灰底分區（唯讀資訊、帳號狀態…） */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-inset/50 p-4 ${className}`}>{children}</div>
}

/** 帳號狀態：使用中／停用 */
export function AccountPill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium"
      style={{
        background: active ? statusTok.normal.bg : statusTok.inactive.bg,
        color: active ? statusTok.normal.fg : statusTok.inactive.fg,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? statusTok.normal.fg : statusTok.inactive.fg }} />
      {active ? '使用中' : '停用'}
    </span>
  )
}

/** 刪除確認（Figma 3901:40242） */
export function ConfirmDialog({
  title, message = '該行動無法復原！是否確定刪除？', confirmLabel = '刪除', onCancel, onConfirm,
}: {
  title: string
  message?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl border border-border bg-surface p-5 shadow-drawer modal-pop">
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle size={18} className="text-brand" />
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        </div>
        <p className="mb-5 pl-7 text-[13px] text-ink-sub">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
            取消
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 權限勾選框（Figma 角色權限管理的 Checkbox）—— 14px 方框，勾選時填品牌色。
 * 支援三態：區塊標題的「全選」在部分勾選時顯示「－」。
 */
export function CheckBox({
  checked, indeterminate = false, onChange, label, className = '',
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label?: ReactNode
  className?: string
}) {
  const on = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={onChange}
      className={`group flex min-w-0 items-center gap-1 text-left ${className}`}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        <span
          className={[
            'grid h-3.5 w-3.5 place-items-center rounded-[2px] border transition-colors',
            on ? 'border-brand bg-brand text-white' : 'border-border-strong bg-surface group-hover:border-brand',
          ].join(' ')}
        >
          {indeterminate ? <Minus size={11} strokeWidth={3} /> : checked ? <Check size={11} strokeWidth={3} /> : null}
        </span>
      </span>
      {label != null && <span className="min-w-0 truncate text-[14px] text-ink">{label}</span>}
    </button>
  )
}
