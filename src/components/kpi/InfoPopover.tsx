import type { ReactNode } from 'react'

/**
 * Shared hover popover for KPI cards — pure CSS group-hover, pointer-events-none
 * so it never blocks the card's click-to-select. The parent card must carry
 * `relative group` for the hover trigger to work.
 *
 * `align` positions the popover under the card; default centers it.
 */
export function InfoPopover({
  title,
  children,
  align = 'center',
}: {
  title: string
  children: ReactNode
  align?: 'center' | 'left' | 'right'
}) {
  const pos =
    align === 'left'
      ? 'left-2'
      : align === 'right'
        ? 'right-2'
        : 'left-1/2 -translate-x-1/2'
  const arrowPos = align === 'left' ? 'left-6' : align === 'right' ? 'right-6' : 'left-1/2 -translate-x-1/2'
  return (
    // 卡片整體 hover 顯示；但當內部趨勢箭頭 (.trend-trigger) 被 hover 時隱藏，
    // 避免與趨勢說明框同時彈出造成畫面雜亂。
    <div
      className={`pointer-events-none absolute ${pos} top-full mt-2 z-30 w-[240px] opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-has-[.trend-trigger:hover]:!opacity-0 group-has-[.trend-trigger:hover]:!translate-y-1`}
    >
      <div className="rounded-lg bg-surface border border-border shadow-card px-3 py-2.5 text-[12px]">
        <div className="font-semibold text-ink mb-1.5">{title}</div>
        {children}
      </div>
      {/* arrow */}
      <div className={`absolute ${arrowPos} -top-1 h-2 w-2 rotate-45 bg-surface border-l border-t border-border`} />
    </div>
  )
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-ink-sub">{label}</span>
      <b className="text-ink tabular-nums">{value}</b>
    </div>
  )
}

/** free-text note line (no value column) — for update-frequency / rule text */
export function Note({ children }: { children: ReactNode }) {
  return <div className="py-0.5 text-ink-sub leading-snug">{children}</div>
}

export function Formula({ expr, result, color }: { expr: string; result: string; color: string }) {
  return (
    <div className="mt-1.5 pt-1.5 border-t border-divider flex items-center justify-between">
      <span className="font-mono text-ink-sub tabular-nums">{expr}</span>
      <b className="tabular-nums" style={{ color }}>
        ＝ {result}
      </b>
    </div>
  )
}
