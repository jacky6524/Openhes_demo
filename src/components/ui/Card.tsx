import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  active?: boolean
  onClick?: () => void
  title?: string
  /** 告警外框 — 對應前端 .metric-card--alert */
  alert?: boolean
}

/**
 * floating card — 對齊前端 openhes-front 的 `.metric-card` / `.panel`：
 *   border: 0.5px solid #e7dbdd; border-radius: 16px; box-shadow: --boxshadow-cardS
 * 選取狀態沿用 prototype 的品牌外框（前端 dashboard 目前沒有 KPI 選取態，
 * 但地圖著色仍靠它驅動，所以保留並改用 HES 紅）。
 */
export function Card({ children, className = '', active, onClick, title, alert }: CardProps) {
  return (
    <div
      onClick={onClick}
      title={title}
      className={[
        'rounded-card bg-surface border-[0.5px] shadow-card transition-all',
        alert
          ? 'border-card-border-alert'
          : active
            ? 'border-brand ring-1 ring-brand/25'
            : 'border-card-border',
        onClick ? 'cursor-pointer hover:shadow-card-hover' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
