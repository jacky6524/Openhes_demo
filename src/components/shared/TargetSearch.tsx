import { Search } from 'lucide-react'

/**
 * 讀表管理兩頁共用的「對象搜尋」：表號／電號／群組 單選＋輸入框
 * （設計稿「即時讀表-1」「MDMS上拋-1」左上角；標題一個叫「搜尋模式」、一個叫「重新上傳MDMS」）。
 */
export const TARGET_MODES = [
  { key: 'meterNo', label: '表號' },
  { key: 'elecNo', label: '電號' },
  { key: 'group', label: '群組' },
] as const
export type TargetMode = (typeof TARGET_MODES)[number]['key']

export const FIELD_BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

export function TargetSearch({
  label,
  mode,
  text,
  onMode,
  onText,
  onEnter,
}: {
  label: string
  mode: TargetMode
  text: string
  onMode: (m: TargetMode) => void
  onText: (v: string) => void
  onEnter?: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex h-[38px] items-center gap-3 px-2">
          {TARGET_MODES.map((m) => (
            <label key={m.key} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input
                type="radio"
                name={`target-${label}`}
                checked={mode === m.key}
                onChange={() => onMode(m.key)}
                className="size-4 cursor-pointer accent-danger"
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
          <input
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
            placeholder="請輸入"
            className={`${FIELD_BOX} w-[240px] pl-9`}
          />
        </div>
      </div>
    </div>
  )
}
