import { ClipboardPen } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * 頁面左上角標題（2026-10-16 業主參考圖「即裝即查 (4).png」）：紅色圖示＋粗體標題。
 * 用於裝置管理的即時查詢（原即裝即查）／註冊衝突／裝置群組／裝置紀錄。
 */
export function PageTitle({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon ?? <ClipboardPen size={20} className="text-brand" />}
      <h1 className="text-[16px] font-semibold text-ink">{title}</h1>
    </div>
  )
}
