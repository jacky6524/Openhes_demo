import type { ReactNode } from 'react'

/**
 * 統一趨勢 Hover 說明框 —— 所有「上升／下降」趨勢指標共用的單一版式。
 * 精簡版（依 7/24 會議）只保留：計算方式（與前一小時相比），並備註每小時整點計算。
 * 「比對時間區間」已依會議移除。
 *
 *   ┌ 趨勢說明 ──────────────┐
 *   │ 計算方式  與前一小時相比      │
 *   │ 備註      每小時整點計算      │
 *   └────────────────────────┘
 *
 * 趨勢一律「與前一小時比對」（避免使用者連續 refresh 時差值歸零）。
 * up / isBad / value / unit / standard 仍保留於介面供呼叫端沿用，但精簡版不顯示。
 */

export function TrendTip({
  method = '與前一小時相比',
  note = '每小時整點計算',
  align = 'right',
}: {
  up?: boolean
  isBad?: boolean
  value?: string
  unit?: string
  standard?: string
  method?: string // 計算方式文字
  note?: string // 備註（統計時點）
  align?: 'left' | 'right'
}) {
  const alignCls = align === 'left' ? 'left-0' : 'right-0'
  return (
    <span className={`pointer-events-none absolute top-full ${alignCls} mt-2 z-40 w-[212px] opacity-0 translate-y-1 transition-all duration-150 group-hover/trend:opacity-100 group-hover/trend:translate-y-0`}>
      <span className="block rounded-lg bg-surface border border-border shadow-card overflow-hidden text-left">
        <span className="block px-3 py-1.5 border-b border-divider bg-inset/50 text-[11px] font-semibold text-ink-sub">
          趨勢說明
        </span>
        <span className="flex flex-col gap-1.5 px-3 py-2">
          <TipRow label="計算方式">
            <span className="text-ink">{method}</span>
          </TipRow>
          <TipRow label="備註">
            <span className="text-ink-sub">{note}</span>
          </TipRow>
        </span>
      </span>
    </span>
  )
}

/** label／value 兩欄列，維持統一對齊 */
function TipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-2 text-[11px]">
      <span className="w-[64px] shrink-0 text-ink-mut">{label}</span>
      <span className="flex-1">{children}</span>
    </span>
  )
}
