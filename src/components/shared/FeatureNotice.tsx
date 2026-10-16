import type { ReactNode } from 'react'
import { Ban } from 'lucide-react'

/**
 * 暫不啟用的功能 —— 2026-09-29 業主意見：頁面**照樣可以點開瀏覽**，只是最上方加說明，
 * 且頁面裡的操作一律停用（不能執行）。原本做法是整個頁籤／按鈕鎖死點不進去，業主不要。
 *
 * 用法：<FeatureNotice text="…">{整個功能畫面}</FeatureNotice>
 * 內容包在 disabled 的 <fieldset> 裡，按鈕、輸入框、下拉全部停用；捲動與閱讀不受影響。
 */
export function FeatureNotice({ text = '此功能暫不啟用，畫面僅供瀏覽，無法執行操作。', children }: { text?: string; children: ReactNode }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-inset px-4 py-2.5 text-[13px] text-ink-sub">
        <Ban size={15} className="shrink-0 text-ink-mut" />
        <span>
          <b className="font-semibold text-ink">暫不啟用</b>
          <span className="mx-1.5 text-ink-fai">｜</span>
          {text}
        </span>
      </div>
      <fieldset
        disabled
        className="m-0 min-w-0 border-0 p-0 contents [&_button]:!cursor-not-allowed [&_input]:!cursor-not-allowed [&_select]:!cursor-not-allowed [&_label]:!cursor-not-allowed"
      >
        {children}
      </fieldset>
    </>
  )
}
