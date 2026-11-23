import { Search } from 'lucide-react'

/**
 * DCU清單／電表清單共用的搜尋元件。
 * 2026-09-23 依業主意見：兩頁進來預設不載入清單，要按「搜尋」才查詢。
 */

/** 清除條件／搜尋 按鈕組 */
export function SearchButtons({
  onSearch,
  onReset,
  searchLabel = '搜尋',
  resetLabel = '清除條件',
}: {
  onSearch: () => void
  onReset: () => void
  searchLabel?: string
  resetLabel?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onReset}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-ink hover:bg-inset transition-colors"
      >
        {resetLabel}
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1F2939] px-4 text-[13px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
      >
        {searchLabel}
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
