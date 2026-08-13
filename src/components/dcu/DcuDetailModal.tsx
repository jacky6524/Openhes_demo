import { useEffect } from 'react'
import { X } from 'lucide-react'
import { DcuDetailContent } from '@/pages/DcuDetail'

/**
 * DCU詳細資料 彈窗 —— DCU總覽的「詳細資料」入口用，與電表詳細資料（MeterDetailModal）
 * 同一種彈窗模式（置中 + 遮罩 + X／背景／Esc 關閉），不再整頁跳轉離開總覽。
 * 內容與整頁版（pages/DcuDetail）共用 DcuDetailContent。
 */
export function DcuDetailModal({ model, onClose }: { model: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      {/* 電表表格有 12 欄，視窗放不下就會被擠掉 → 彈窗吃滿版面，表格自己橫向捲動 */}
      <div className="relative z-10 w-[96vw] h-[92vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        {/* header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
          <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
            <X size={18} />
          </button>
          <h2 className="text-[16px] font-semibold text-ink">DCU詳細資料</h2>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          <DcuDetailContent model={model} />
        </div>
      </div>
    </div>
  )
}
