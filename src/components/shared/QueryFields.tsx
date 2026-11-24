import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { FIELD_BOX } from '@/components/shared/TargetSearch'
import { useDeviceGroups, GROUP_KINDS, type GroupKind } from '@/store/useDeviceGroups'

/**
 * 讀表管理（即時讀表、MDMS上拋）共用的查詢欄位 —— 2026-11-04 業主意見：兩頁的輸入欄以即時讀表為準。
 * 原本寫在 pages/InstantRead.tsx，抽出來給 MDMS上拋共用。
 */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">
        {label}
        {hint && <span className="ml-2 text-ink-mut">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

/** 群組下拉：選項＝裝置群組頁的群組（依 DCU群組／電表群組分組）；值為 `${kind}:${群組名}`，'' ＝未選 */
export const groupKey = (k: GroupKind, name: string) => `${k}:${name}`
export function GroupSelect({ value, onChange, className = 'w-[240px]' }: { value: string; onChange: (v: string) => void; className?: string }) {
  const groups = useDeviceGroups((s) => s.groups)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="群組" className={`${FIELD_BOX} h-9 ${className}`}>
      <option value="">請選擇群組</option>
      {GROUP_KINDS.map(({ key, label }) =>
        groups[key].length > 0 && (
          <optgroup key={key} label={label}>
            {groups[key].map((g) => <option key={g.name} value={groupKey(key, g.name)}>{g.name}</option>)}
          </optgroup>
        ),
      )}
    </select>
  )
}

/* 日期時間：原生 datetime-local 的時制跟著作業系統（中文 Windows 會出現上午／下午），分鐘也無法限制成
   15 分一格，所以拆成 日期＋時間 兩個欄位自己組。
   2026-11-04 業主意見：時、分原本是兩個下拉，改成**一個下拉**直接選 00:00、00:15 … 23:45（共 96 個）。
   值的格式維持 'YYYY-MM-DDTHH:mm'（日期輸入框規定的格式），日期部分的顯示跟作業系統走。 */
const timesOf = (step: number) =>
  Array.from({ length: 1440 / step }, (_, i) => `${String(Math.floor((i * step) / 60)).padStart(2, '0')}:${String((i * step) % 60).padStart(2, '0')}`)
const TIMES_BY_STEP: Record<number, string[]> = { 15: timesOf(15), 60: timesOf(60) }

/** 'YYYY-MM-DDTHH:mm' 往前／後推 n 個月（遇到短月份取該月最後一天，例：01-31 → 02-28） */
export function addMonths(v: string, n: number) {
  const [date, time] = v.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, m - 1 + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(Math.min(d, last))}T${time}`
}

/** stepMin：時間下拉的間隔（預設 15 分；2026-11-19 MDMS上拋改整點＝60） */
export function DateTime15({ value, min, max, stepMin = 15, onChange }: { value: string; min?: string; max?: string; stepMin?: 15 | 60; onChange: (v: string) => void }) {
  const TIMES = TIMES_BY_STEP[stepMin]
  const [date = '', rawTime = ''] = value ? value.split('T') : []
  // 外部給的值若不在格上（例如舊預設值），選單顯示時往前取整到最近的一格
  const time = rawTime ? TIMES[Math.floor((Number(rawTime.slice(0, 2)) * 60 + Number(rawTime.slice(3, 5))) / stepMin)] ?? '00:00' : '00:00'
  const inner = 'bg-transparent text-[13px] tabular-nums text-ink focus:outline-none disabled:cursor-not-allowed disabled:text-ink-mut'
  const put = (d: string, t: string) => onChange(d ? `${d}T${t}` : '')
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <input type="date" value={date} min={min?.slice(0, 10)} max={max?.slice(0, 10)} onChange={(e) => put(e.target.value, time)} className={inner} />
      <select value={time} disabled={!date} onChange={(e) => put(date, e.target.value)} aria-label="時間" className={inner}>
        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </span>
  )
}

/** 起訖區間。起訖顛倒、或超過 maxMonths 上限時，會把另一端拉回來（改起點動終點、改終點動起點） */
export function RangeInput({ from, to, maxMonths, stepMin = 15, className = '', onChange }: {
  from: string
  to: string
  maxMonths?: number
  stepMin?: 15 | 60
  className?: string
  onChange: (from: string, to: string) => void
}) {
  const setFrom = (f: string) => {
    let t = to
    if (f && t && t < f) t = f
    if (f && t && maxMonths && t > addMonths(f, maxMonths)) t = addMonths(f, maxMonths)
    onChange(f, t)
  }
  const setTo = (t: string) => {
    let f = from
    if (f && t && f > t) f = t
    if (f && t && maxMonths && f < addMonths(t, -maxMonths)) f = addMonths(t, -maxMonths)
    onChange(f, t)
  }
  return (
    <div className={`${FIELD_BOX} flex h-9 items-center gap-2 py-0 ${className}`}>
      <DateTime15 value={from} stepMin={stepMin} onChange={setFrom} />
      <ArrowRight size={14} className="shrink-0 text-ink-mut" />
      <DateTime15 value={to} stepMin={stepMin} onChange={setTo} />
    </div>
  )
}

/** 清除條件／搜尋兩顆按鈕（兩頁同一組樣式）。與下拉、日期區間同為 36px 高（h-9，2026-11-11） */
export function QueryButtons({ onClear, onSearch }: { onClear: () => void; onSearch: () => void }) {
  return (
    <>
      <button onClick={onClear} className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
        清除條件
      </button>
      <button onClick={onSearch} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white hover:opacity-90">
        搜尋
      </button>
    </>
  )
}

/**
 * 複選下拉（2026-11-04：MDMS上拋的資料類型要能同時比較多種）。
 * 外觀同一般下拉；點開是勾選清單＋「全選」，點外面收起。已選 1 項顯示名稱，多項顯示「名稱、名稱…」或「已選 N 項」。
 */
export function MultiSelect<T extends string>({
  options, value, onChange, placeholder = '請選擇', width = 240,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T[]
  onChange: (v: T[]) => void
  placeholder?: string
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  // 依選項原本的順序輸出，不依勾選先後
  const toggle = (v: T) => onChange(options.map((o) => o.value).filter((x) => (x === v ? !value.includes(x) : value.includes(x))))
  const all = value.length === options.length
  const labels = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  const text = labels.length === 0 ? placeholder : labels.length <= 2 ? labels.join('、') : `已選 ${labels.length} 項`

  return (
    <div ref={boxRef} className="relative" style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={labels.join('、')}
        className={`${FIELD_BOX} flex h-9 w-full items-center justify-between gap-2 py-0 text-left`}
      >
        <span className={`truncate ${labels.length ? '' : 'text-ink-mut'}`}>{text}</span>
        <ChevronDown size={14} className={`shrink-0 text-ink-mut transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-card">
          <label className="flex cursor-pointer items-center gap-2 border-b border-divider px-3 py-2 text-[13px] font-semibold text-ink hover:bg-inset">
            <input
              type="checkbox"
              checked={all}
              ref={(el) => { if (el) el.indeterminate = value.length > 0 && !all }}
              onChange={() => onChange(all ? [] : options.map((o) => o.value))}
              className="size-4 cursor-pointer accent-danger"
            />
            全選
          </label>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] text-ink hover:bg-inset">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="size-4 cursor-pointer accent-danger" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
