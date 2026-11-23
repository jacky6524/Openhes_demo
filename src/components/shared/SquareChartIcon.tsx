import type { SVGProps } from 'react'

export function SquareChartIcon({ size = 18, className, ...props }: { size?: number; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 17h18" />
      <path d="M8 17v-6" />
      <path d="M12 17v-10" />
      <path d="M16 17v-8" />
    </svg>
  )
}
