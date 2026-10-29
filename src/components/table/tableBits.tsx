import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Filter,
  Search,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { status as statusTok } from '@/tokens'
import type { DcuStatus } from '@/data/dcuList'

/* Shared table primitives used by the DCU list and DCU detail screens. */

export type SortDir = 'asc' | 'desc'
export const GREEN = statusTok.normal.fg
export const RED = statusTok.danger.fg

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 whitespace-nowrap ${className}`}>{children}</th>
}

/**
 * 時間戳上下兩行（日期／時間）—— 2026-10-01 業主意見日期要帶西元年，
 * 右側窄列表放一行太寬，拆成兩行。輸入 'YYYY-MM-DD HH:mm'；沒有空白就原樣顯示。
 */
export function StampLines({ value }: { value: string }) {
  const i = value.indexOf(' ')
  if (i < 0) return <>{value}</>
  return (
    <span className="inline-flex flex-col leading-tight">
      {/* 日期不在「-」處斷開（業主 2026-10-16：年與月日要同一行） */}
      <span className="whitespace-nowrap">{value.slice(0, i)}</span>
      {/* 時間與日期同字級、同色（業主 2026-10-22：整個系統相似的時間呈現都要比照） */}
      <span className="whitespace-nowrap">{value.slice(i + 1)}</span>
    </span>
  )
}

export function StatusPill({ status }: { status: DcuStatus }) {
  const online = status === 'online'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ background: online ? statusTok.normal.bg : statusTok.danger.bg, color: online ? GREEN : RED }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: online ? GREEN : RED }} />
      {online ? '連線' : '斷線'}
    </span>
  )
}

/** 三態裝置狀態（正常／斷線／停用）—— 樣式與 StatusPill 一致 */
export function StatePill({ state }: { state: 'active' | 'offline' | 'disabled' }) {
  const tone =
    state === 'offline'
      ? { bg: statusTok.danger.bg, fg: RED, label: '斷線' }
      : state === 'disabled'
        ? { bg: '#EFEFF1', fg: '#6B5E62', label: '停用' }
        : { bg: statusTok.normal.bg, fg: GREEN, label: '正常' }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  )
}

/** 讀表百分比：≥80% 純文字，50–80% 橙、＜50% 紅 */
export function PercentBadge({ percent }: { percent: number }) {
  const v = Math.round(percent * 10) / 10
  if (v >= 80) return <span className="tabular-nums text-ink">{v}%</span>
  const tone = v < 50 ? statusTok.danger : statusTok.warning
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-semibold tabular-nums"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {v}%
    </span>
  )
}

export function SortHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink font-semibold' : ''}`}
    >
      {label}
      {active ? (
        dir === 'asc' ? (
          <ArrowUp size={13} />
        ) : (
          <ArrowDown size={13} />
        )
      ) : (
        <ChevronsUpDown size={13} className="text-ink-mut" />
      )}
    </button>
  )
}

export function FilterHead({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <span className="relative inline-flex items-center gap-1">
      {label}
      <button onClick={onToggle} className={`hover:text-ink ${open ? 'text-brand' : 'text-ink-mut'}`}>
        <Filter size={13} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-28 rounded-lg bg-surface border border-border shadow-card py-1">
          {children}
        </div>
      )}
    </span>
  )
}

export function SearchHead({
  label,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  onChange: (v: string) => void
}) {
  return (
    <span className="relative inline-flex items-center gap-1">
      {label}
      <button onClick={onToggle} className={`hover:text-ink ${open || value ? 'text-brand' : 'text-ink-mut'}`}>
        <Search size={13} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-48 rounded-lg bg-surface border border-border shadow-card p-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`搜尋 ${label}`}
            className="w-full text-[12px] px-2 py-1.5 rounded-md border border-border bg-inset/40 focus:outline-none focus:border-brand text-ink"
          />
        </div>
      )}
    </span>
  )
}

export function MenuItem({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 text-[12px] hover:bg-inset ${
        active ? 'text-brand font-semibold' : 'text-ink-sub'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * 無限捲動（取代分頁器）—— 捲到底自動追加一批，避免「上百頁」的頁碼操作。
 * 回傳可見筆數與哨兵 ref；把 <div ref={sentinelRef} /> 放在表格末端即可。
 * 大資料量時只有捲過的列會進 DOM，未捲到的不建立。
 *
 * @param total  目前篩選後的總筆數
 * @param deps   篩選／排序條件；變動時重置回第一批
 */
export function useInfiniteRows(total: number, deps: unknown[], chunk = 30) {
  const [visible, setVisible] = useState(chunk)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const depKey = JSON.stringify(deps)

  useEffect(() => { setVisible(chunk) }, [depKey, chunk])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || visible >= total) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setVisible((v) => Math.min(total, v + chunk)) },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible, total, chunk])

  /** 需要讓某個索引可見時（例如地圖點選的列在未載入的區段）呼叫 */
  const revealIndex = useCallback((i: number) => {
    if (i >= 0) setVisible((v) => (i < v ? v : Math.min(total, i + chunk)))
  }, [total, chunk])

  return { visible: Math.min(visible, total), sentinelRef, revealIndex, hasMore: visible < total }
}

/** 無限捲動列表的頁尾：已載入進度 + 回到頂端 */
export function InfiniteFooter({
  loaded, total, hasMore, onTop,
}: { loaded: number; total: number; hasMore: boolean; onTop?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11.5px] text-ink-mut border-t border-border">
      <span className="tabular-nums">
        已顯示 <b className="text-ink-sub">{loaded}</b> / 共 <b className="text-ink-sub">{total}</b> 筆
        {hasMore && <span className="ml-1.5 text-ink-mut">· 向下捲動載入更多</span>}
      </span>
      {onTop && loaded > 30 && (
        <button onClick={onTop} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-inset hover:text-ink">
          <ArrowUp size={12} />回到頂端
        </button>
      )}
    </div>
  )
}

/**
 * Pager with 跳頁. Footer right side is either a page-size select
 * (pass pageSize + onPageSize) or a total-count label (pass totalCount).
 */
export function Pagination({
  page,
  totalPages,
  onPage,
  pageSize,
  onPageSize,
  totalCount,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
  pageSize?: number
  onPageSize?: (s: number) => void
  totalCount?: number
}) {
  const [jump, setJump] = useState('')
  const pages = pageWindow(page, totalPages)

  const doJump = () => {
    const n = parseInt(jump, 10)
    if (!Number.isNaN(n)) onPage(Math.min(totalPages, Math.max(1, n)))
    setJump('')
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mt-3 pt-1 text-[13px]">
      <div className="flex items-center gap-1">
        <PagerBtn disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} />
        </PagerBtn>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-ink-mut">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={[
                'h-7 min-w-7 px-2 rounded-lg text-[13px] tabular-nums',
                p === page ? 'border border-brand text-brand font-semibold' : 'text-ink-sub hover:bg-inset',
              ].join(' ')}
            >
              {p}
            </button>
          ),
        )}
        <PagerBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={15} />
        </PagerBtn>
      </div>

      <div className="flex items-center gap-3 text-ink-sub">
        {pageSize != null && onPageSize ? (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(parseInt(e.target.value, 10))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-ink focus:outline-none"
          >
            {[10, 20, 50].map((s) => (
              <option key={s} value={s}>
                {s} 條/頁
              </option>
            ))}
          </select>
        ) : totalCount != null ? (
          <span className="tabular-nums">共 {totalCount} 筆資料</span>
        ) : null}
        <div className="flex items-center gap-1.5">
          <span>跳頁</span>
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && doJump()}
            onBlur={doJump}
            className="w-12 rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-ink text-center focus:outline-none focus:border-brand"
          />
        </div>
      </div>
    </div>
  )
}

function PagerBtn({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** page-number window with ellipses, e.g. 1 2 3 4 5 … 10 */
export function pageWindow(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = []
  if (page <= 4) {
    for (let i = 1; i <= 5; i++) out.push(i)
    out.push('…', total)
  } else if (page >= total - 3) {
    out.push(1, '…')
    for (let i = total - 4; i <= total; i++) out.push(i)
  } else {
    out.push(1, '…')
    for (let i = page - 1; i <= page + 1; i++) out.push(i)
    out.push('…', total)
  }
  return out
}
