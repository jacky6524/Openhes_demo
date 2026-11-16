import { Search } from 'lucide-react'

/**
 * DCU清單／電表清單共用的搜尋元件。
 * 2026-09-23 依業主意見：兩頁進來預設不載入清單，要按「搜尋」才查詢。
 */

/** 搜尋／重設 */
export function SearchButtons({ onSearch, onReset }: { onSearch: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onSearch}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-[13px] font-medium text-white hover:bg-brand-deep"
      >
        <Search size={14} />搜尋
      </button>
      {/* 兩顆按鈕與輸入框／下拉同為 36px 高（h-9），並排時上下緣對齊 */}
      <button
        onClick={onReset}
        className="h-9 rounded-md border border-border bg-surface px-4 text-[13px] text-ink-sub hover:border-brand hover:text-brand"
      >
        重設
      </button>
    </div>
  )
}

/** 尚未搜尋時的表格空狀態 */
export function NotSearched() {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <Search size={22} className="text-ink-fai" />
      <span>請設定搜尋與篩選條件後按「搜尋」載入清單</span>
    </div>
  )
}
