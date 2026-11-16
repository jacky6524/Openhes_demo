import { PillTabs } from '@/components/shared/PillTabs'

/**
 * 讀表管理（即時讀表、MDMS上拋）的「對象搜尋」：表號／電號／群組 —— 膠囊頁籤＋多行輸入框（TargetSearchMulti）。
 * 2026-11-04 起兩頁共用同一個版本；原本 MDMS上拋用的單選＋單行版（TargetSearch）已移除。
 */
export const TARGET_MODES = [
  { key: 'meterNo', label: '表號' },
  { key: 'elecNo', label: '電號' },
  { key: 'group', label: '群組' },
] as const
export type TargetMode = (typeof TARGET_MODES)[number]['key']

export const FIELD_BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

/** 多筆輸入框的內容 → 去頭尾空白、去空行、去重複的清單（換行分隔；貼上時夾帶的逗號、Tab 也當分隔） */
export function parseTargets(text: string): string[] {
  return [...new Set(text.split(/[\n\r,\t]+/).map((s) => s.trim()).filter(Boolean))]
}

/**
 * 即時讀表的「對象搜尋」（2026-11-04 業主設計稿「即時讀表01.png」）：
 *   上方膠囊頁籤 表號／電號／群組；
 *   表號、電號 → 多行輸入框，可輸入一筆或貼上多筆（換行分隔），右下角顯示已輸入筆數；
 *   群組 → 由頁面傳入的群組下拉（設計稿沒畫群組模式，沿用下拉）。
 * Ctrl+Enter（⌘+Enter）直接搜尋；單按 Enter 是換行。
 */
export function TargetSearchMulti({
  mode, text, onMode, onText, onSubmit, groupInput,
}: {
  mode: TargetMode
  text: string
  onMode: (m: TargetMode) => void
  onText: (v: string) => void
  onSubmit?: () => void
  groupInput: React.ReactNode
}) {
  const label = TARGET_MODES.find((m) => m.key === mode)?.label ?? ''
  const count = parseTargets(text).length
  return (
    <div className="flex flex-col gap-2">
      <PillTabs tabs={TARGET_MODES} value={mode} onChange={onMode} />
      {mode === 'group' ? (
        groupInput
      ) : (
        <div className="flex items-end gap-2">
          {/* 2026-11-04 業主嫌太大：480px／6 行 → 360px／3 行。
              2026-11-11 業主：預設再縮一半 → 96px → 48px（約兩行）；右下角仍可拖曳拉高，貼多筆時自己拉開。
              高度變矮後「已輸入 N 筆」放進框裡會壓到文字，移到框外右下 */}
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit?.() } }}
            placeholder={`請輸入${label}，可輸入一筆或貼上多筆，以換行分隔。`}
            rows={2}
            className={`${FIELD_BOX} block h-12 min-h-9 w-[360px] resize-y py-1.5 leading-[1.4]`}
          />
          {count > 0 && (
            <span className="whitespace-nowrap pb-1 text-[12px] tabular-nums text-ink-mut">已輸入 {count} 筆</span>
          )}
        </div>
      )}
    </div>
  )
}
