/**
 * 膠囊頁籤（Figma 裝置群集 3977:32260／裝置紀錄 4182:31485）：灰底 pill，選中項白底紅字。
 * 與 Tabs.tsx 的底線頁籤並存 —— 這兩頁的設計稿用的是膠囊樣式。
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex w-fit rounded-full bg-inset p-1">
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              'rounded-full px-3 py-1 text-[13px] font-semibold transition-colors whitespace-nowrap',
              active ? 'bg-surface text-danger shadow-card' : 'text-ink-sub hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
