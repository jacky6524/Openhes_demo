import { useEffect } from 'react'
import { X } from 'lucide-react'
import { status as statusTok } from '@/tokens'

/**
 * Generic right-docked attribute drawer (Figma 2941:68507 / 2934:58801).
 * Shared shell for 電表資料 and DCU資料 — an emphasised id on top, then a
 * label/value list. No dimmed backdrop; closes via X, click-away, or Esc.
 */
export function InfoDrawer({
  title,
  emphasisLabel,
  emphasisValue,
  rows,
  footer,
  onClose,
}: {
  title: string
  emphasisLabel: string
  emphasisValue: string
  rows: [string, string][]
  /** 屬性列之後的自由區塊（例如可填寫的備註欄位） */
  footer?: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* transparent click-away catcher (no dimming) */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <aside className="fixed top-0 right-0 z-50 h-full w-[380px] max-w-[92vw] bg-surface border-l border-border shadow-drawer flex flex-col drawer-right">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
              <X size={18} />
            </button>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          </div>
          {/* 裝置設定移至列表齒輪按鈕，抽屜不再提供入口 */}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4">
            <div className="text-[12px] text-ink-mut mb-0.5">{emphasisLabel}</div>
            <div className="text-[20px] font-bold font-mono" style={{ color: statusTok.danger.fg }}>
              {emphasisValue}
            </div>
          </div>

          <dl className="flex flex-col">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
                <dt className="w-[128px] shrink-0 text-[12px] text-ink-sub">{label}</dt>
                <dd className="flex-1 text-[13px] text-ink break-words tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {footer}
        </div>
      </aside>
    </>
  )
}
