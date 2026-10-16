import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** 小型彈窗外框（樣式比照 DcuModeModal）：標題、右上動作列、Esc／點背景關閉 */
export function SimpleModal({
  title,
  onClose,
  actions,
  width = 420,
  children,
}: {
  title: string
  onClose: () => void
  actions?: ReactNode
  width?: number
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[90vh] flex-col rounded-2xl border border-border bg-surface shadow-drawer modal-pop"
        style={{ width: `min(${width}px, 94vw)` }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onClose} title="關閉" className="grid h-7 w-7 place-items-center rounded-lg text-ink-sub hover:bg-inset hover:text-ink">
              <X size={18} />
            </button>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}

export const BTN_GHOST = 'rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-sub hover:bg-inset'
export const BTN_PRIMARY = 'rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-40'
