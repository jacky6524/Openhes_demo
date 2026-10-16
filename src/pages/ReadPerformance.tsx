import { useMemo, useState } from 'react'
import { Search, CalendarDays } from 'lucide-react'
import { Pagination } from '@/components/table/tableBits'

/**
 * 統計分析 · 讀表效能（Figma 4255:33533，內層 Content 4255:33539）。
 *
 * 熱力圖：每台裝置一列、橫軸一天 48 格（每 30 分鐘），顏色＝該時段的讀表延遲等級：
 *   ≤0／≤30／≤60（愈深愈慢）、查無資料（灰）、超出時間（紅）。
 * 篩選：搜尋裝置（模式＋關鍵字）、資料時間（單日）。底下分頁，一頁 10 台。
 * 設計稿沒標單位，等級門檻（0／30／60）先當「分鐘」。資料全為 mock，用裝置＋日期當種子，
 * 並讓午晚尖峰（17–20 時）與凌晨（02–04 時）紅格較多，貼近設計稿的樣貌。
 */
type Level = 'le0' | 'le30' | 'le60' | 'none' | 'over'
const LEVELS: Array<{ key: Level; label: string; color: string }> = [
  { key: 'le0', label: '≤ 0', color: '#E0E7FF' },
  { key: 'le30', label: '≤ 30', color: '#C7D2FE' },
  { key: 'le60', label: '≤ 60', color: '#818CF8' },
  { key: 'none', label: '查無資料', color: '#F3F4F6' },
  { key: 'over', label: '超出時間', color: '#FF6467' },
]
const COLOR = Object.fromEntries(LEVELS.map((l) => [l.key, l.color])) as Record<Level, string>
const LABEL = Object.fromEntries(LEVELS.map((l) => [l.key, l.label])) as Record<Level, string>

const SLOTS = 48
const DEVICES = Array.from({ length: 100 }, (_, i) => ({
  id: `T${String(i + 1).padStart(3, '0')}`,
  fan: `18BE92FFFF${String(18548 + i).padStart(6, '0')}`,
}))
const MODES = ['FAN MAC', '裝置編號'] as const

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function levelsOf(id: string, date: string): Level[] {
  const r = rng(hash(id + date))
  return Array.from({ length: SLOTS }, (_, s) => {
    const hour = s / 2
    const peak = (hour >= 17 && hour < 20) || (hour >= 2 && hour < 4)
    const x = r()
    if (peak) return x < 0.42 ? 'over' : x < 0.62 ? 'le60' : x < 0.78 ? 'le30' : x < 0.9 ? 'le0' : 'none'
    return x < 0.04 ? 'over' : x < 0.28 ? 'le60' : x < 0.5 ? 'le30' : x < 0.7 ? 'le0' : 'none'
  })
}

/** 一列高度：依視窗高度撐滿熱力圖區（扣掉頂欄、篩選、圖例、軸與分頁約 400px），夾在 36–72px */
const ROW_H = 'clamp(36px, calc((100vh - 400px) / 10), 72px)'

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

export function ReadPerformance() {
  const [mode, setMode] = useState<(typeof MODES)[number]>('FAN MAC')
  const [text, setText] = useState('')
  const [date, setDate] = useState('2025-01-01')
  const [applied, setApplied] = useState({ mode: 'FAN MAC' as string, text: '', date: '2025-01-01' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const apply = () => { setApplied({ mode, text, date }); setPage(1) }
  const clear = () => { setMode('FAN MAC'); setText(''); setDate('2025-01-01'); setApplied({ mode: 'FAN MAC', text: '', date: '2025-01-01' }); setPage(1) }

  const devices = useMemo(() => {
    const t = applied.text.trim().toLowerCase()
    return DEVICES.filter((d) => !t || (applied.mode === 'FAN MAC' ? d.fan : d.id).toLowerCase().includes(t))
  }, [applied])
  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize))
  const safe = Math.min(page, totalPages)
  const pageDevices = devices.slice((safe - 1) * pageSize, safe * pageSize)
  const grid = useMemo(() => pageDevices.map((d) => ({ d, lv: levelsOf(d.id, applied.date) })), [pageDevices, applied.date])

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="px-2 text-[12px] text-ink-sub">搜尋裝置</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as (typeof MODES)[number])} className={`${BOX} w-[144px]`}>
            {MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="搜尋" className={`${BOX} w-[240px] pl-9`} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="px-2 text-[12px] text-ink-sub">資料時間</span>
          <div className="relative">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${BOX} w-[160px] pr-8`} />
            <CalendarDays size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mut" />
          </div>
        </label>
        <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">清除條件</button>
        <button onClick={apply} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">搜尋</button>
      </div>

      <div className="rounded-card bg-surface border border-border shadow-card px-4 py-4">
        {/* 圖例 */}
        <div className="mb-4 flex items-center justify-center gap-4 text-[12px] text-ink-sub">
          {LEVELS.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: l.color }} />{l.label}
            </span>
          ))}
        </div>

        {grid.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-ink-mut">查無符合條件的裝置</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              {grid.map(({ d, lv }) => (
                <div key={d.id} className="flex items-center">
                  <div className="w-[56px] shrink-0 pr-2 text-right text-[12px] font-bold text-ink-sub">{d.id}</div>
                  <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}>
                    {lv.map((l, s) => (
                      <div
                        key={s}
                        style={{ background: COLOR[l], height: ROW_H }}
                        title={`${d.id}｜${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}｜${LABEL[l]}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {/* X 軸：每 2 小時一個刻度 */}
              <div className="mt-2 flex">
                <div className="w-[56px] shrink-0" />
                <div className="relative h-4 flex-1">
                  {Array.from({ length: 13 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute -translate-x-1/2 text-[11px] font-bold text-ink-sub"
                      style={{ left: `${(i / 12) * 100}%` }}
                    >
                      {String(i * 2).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <Pagination page={safe} totalPages={totalPages} onPage={setPage} pageSize={pageSize} onPageSize={(s) => { setPageSize(s); setPage(1) }} />
      </div>
    </div>
  )
}
