import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { DCU_MODES } from '@/data/dcuListPage'

/**
 * 修改模式 modal (Figma 3808:24018) —— DCU清單右上「修改模式」按鈕開啟。
 * 內容很小：唯讀的 DCU型號 ＋ 一個模式下拉。
 * 一次可套用到多台（清單以核取方塊選取），型號相同時直接顯示，否則標示多型號。
 */
export function DcuModeModal({
  models,
  count,
  onClose,
}: {
  models: string[]
  count: number
  onClose: () => void
}) {
  const [mode, setMode] = useState<string>(DCU_MODES[0])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const uniq = [...new Set(models)]
  const modelLabel = uniq.length === 1 ? uniq[0] : `${uniq.length} 種型號`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(420px,94vw)] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
              <X size={18} />
            </button>
            <h2 className="text-[15px] font-semibold text-ink">修改模式</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              取消
            </button>
            <button onClick={onClose} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep">
              確定
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-ink-mut">DCU型號</span>
            <span className="text-[18px] font-bold font-mono text-ink">{modelLabel}</span>
            {count > 1 && <span className="text-[12px] text-ink-mut">已選取 {count} 台</span>}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-sub">模式</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
            >
              {DCU_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
