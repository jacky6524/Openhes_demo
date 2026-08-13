import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  active?: boolean
  onClick?: () => void
  title?: string
}

/** floating card: white, hairline border, lift comes from faint double shadow */
export function Card({ children, className = '', active, onClick, title }: CardProps) {
  return (
    <div
      onClick={onClick}
      title={title}
      className={[
        'rounded-card bg-surface border shadow-card transition-all',
        active ? 'border-brand ring-1 ring-brand/30' : 'border-border',
        onClick ? 'cursor-pointer hover:shadow-[0_2px_4px_rgba(42,33,37,.06),0_10px_26px_rgba(42,33,37,.12)]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
