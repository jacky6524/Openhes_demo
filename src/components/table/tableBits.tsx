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
import { fmtDate } from '@/lib/format'

/* Shared table primitives used by the DCU list and DCU detail screens. */

export type SortDir = 'asc' | 'desc'
export const GREEN = statusTok.normal.fg
export const RED = statusTok.danger.fg

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 whitespace-nowrap ${className}`}>{children}</th>
}

/**
 * 時間戳上下兩行（日期／時間）—— 2026-10-01 業主意見日期要帶西元年，
 * 右側窄列表放一行太寬，拆成兩行。輸入 'YYYY/MM/DD HH:mm'（傳入 - 分隔也會轉成斜線，全站統一 2026-11-04）；
 * 沒有空白就原樣顯示。
 */
export function StampLines({ value: raw }: { value: string }) {
  const value = fmtDate(raw)
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

/**
 * 連線狀態標籤。labels 預設「連線／斷線」；DCU清單、電表清單比照正式機用「在線／離線」（2026-11-11 API 欄位文件）。
 * status＝null（後端無法判讀）時顯示中性的「-」，不當成離線。
 */
export const ONLINE_LABELS: [string, string] = ['在線', '離線']
export function StatusPill({ status, labels = ['連線', '斷線'] }: { status: DcuStatus | null; labels?: [string, string] }) {
  if (status === null) return <span className="text-ink-mut">-</span>
  const online = status === 'online'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ background: online ? statusTok.normal.bg : statusTok.danger.bg, color: online ? GREEN : RED }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: online ? GREEN : RED }} />
      {online ? labels[0] : labels[1]}
    </span>
  )
}

/** 詳細資料圖示＋事件數 badge：count > 0 才顯示（正式機 eventCount；0 或缺值不顯示，避免視覺噪音） */
export function EventBadge({ count, children }: { count?: number | null; children: ReactNode }) {
  return (
    <span className="relative inline-grid place-items-center">
      {children}
      {!!count && count > 0 && (
        <span className="absolute -right-2 -top-2 min-w-[15px] rounded-full px-1 text-center text-[10px] font-bold leading-[15px] text-white" style={{ background: RED }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
}

/**
 * 「狀態」欄（啟用／停用）—— DCU清單、電表清單共用（2026-11-04 業主意見：以 DCU清單的呈現為準）。
 * 啟用＝灰字；停用＝灰底標籤，前面不加圓點（圓點留給連線狀態用，避免兩欄長得一樣）。
 */
export function EnabledState({ enabled }: { enabled: boolean }) {
  if (enabled) return <span className="text-ink-sub">啟用</span>
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium" style={{ background: '#EFEFF1', color: '#6B5E62' }}>
      停用
    </span>
  )
}

/**
 * 百分比徽章：≥good 純文字，warn～good 橙、＜warn 紅。
 * 預設 80／50（舊版裝置列表規格）；裝置列表改吃燈號門檻 API 時傳 97／95（config/statusThresholds.ts）。
 */
export function PercentBadge({ percent, good = 80, warn = 50 }: { percent: number; good?: number; warn?: number }) {
  const v = Math.round(percent * 10) / 10
  if (v >= good) return <span className="tabular-nums text-ink">{v}%</span>
  const tone = v < warn ? statusTok.danger : statusTok.warning
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

/**
 * 表頭 hover 說明（單位、計算口徑）：表頭文字加虛線底線，滑過在下方浮出說明框。
 * 包在 SortHead／純文字外面用；表格捲動框會裁掉浮框，所以浮框寬度刻意收窄、只放一兩行。
 */
export function HeadHint({ hint, children }: { hint: ReactNode; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <span className="border-b border-dashed border-border-strong">{children}</span>
      <span className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 w-max max-w-[220px] whitespace-normal rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-normal leading-snug text-ink-sub opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100">
        {hint}
      </span>
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
