import { useCallback, useState, type UIEvent } from 'react'
import { Ban } from 'lucide-react'
import { brand, text as textTok } from '@/tokens'

/*
 * 頁籤與表格的共用標準（2026-08-27 業主定調）：
 *   1. 頁籤不可左右拖拽 —— 容器該放寬就放寬，排不下用換行，不出現橫向捲軸。
 *   2. 欄位下拉時表頭不能動 —— 表格自己是捲動容器，thead 用 sticky 釘住。
 * 新畫面一律沿用這裡的常數與元件，不要各自重寫。
 */

/**
 * 表格自己是捲動容器（而非跟著頁面／modal body 一起捲），表頭才能 sticky 釘住不動。
 * 高度預設搭配 modal 的 max-h-[90vh]；整頁版可用 className 覆蓋 max-h。
 */
export const SCROLL_BOX = 'overflow-auto max-h-[calc(90vh-260px)] min-h-[220px] rounded-lg border border-border'
/** sticky 表頭要自己有不透明底色，否則捲動時會透出下方資料列 */
export const STICKY_TH = 'sticky top-0 z-10 bg-inset border-b border-border'

export interface TabItem<T extends string> {
  key: T
  label: string
  /**
   * 功能暫不啟用：頁籤前加禁止符號，**仍可點開**（內容頁自己用 FeatureNotice 加說明並停用操作）。
   * 2026-09-29 業主意見：原本整個鎖死點不進去，改成可以進去看、但要有說明。
   */
  inactive?: boolean
  /** inactive 時 hover 的說明 */
  hint?: string
}

/** 頂層頁籤：選中項紅字＋下方紅底線。排不下時換行，不做橫向捲動 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex items-end flex-wrap gap-x-1 border-b border-border ${className}`}>
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            title={t.inactive ? t.hint ?? '暫不啟用' : undefined}
            className="relative inline-flex items-center gap-1 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors"
            style={{ color: active ? brand.base : textTok.tertiary, fontWeight: active ? 600 : 500 }}
          >
            {t.inactive && <Ban size={13} strokeWidth={2.4} className={active ? '' : 'opacity-70'} />}
            {t.label}
            {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full" style={{ background: brand.base }} />}
          </button>
        )
      })}
    </div>
  )
}

/** 內層子頁籤：藥丸型，與系統總覽的 segmented control 同一種視覺 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex self-start shrink-0 rounded-full p-1"
      style={{ background: '#F0EDEF', boxShadow: 'inset 0 1px 4px rgba(58,42,48,.08)' }}
    >
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.key)}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium leading-[1.3] whitespace-nowrap transition-colors"
            style={
              active
                ? { background: '#FFF', boxShadow: '0 2px 8px rgba(58,42,48,.12)', color: brand.base, fontWeight: 700 }
                : { color: '#62585C' }
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 無限捲動 —— 業主不要頁碼分頁。回傳目前該顯示的筆數與捲動處理器，
 * 掛在 SCROLL_BOX 那層 div 上；捲到接近底部就多放一批。
 */
export function useInfiniteRows(total: number, step = 30) {
  const [count, setCount] = useState(step)
  const visible = Math.min(count, total)

  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        setCount((c) => (c >= total ? c : c + step))
      }
    },
    [total, step],
  )

  /** 篩選／搜尋條件變動時呼叫，回到第一批 */
  const reset = useCallback(() => setCount(step), [step])

  return { visible, onScroll, reset }
}
