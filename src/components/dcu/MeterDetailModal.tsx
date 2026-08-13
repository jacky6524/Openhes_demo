import { useEffect, useMemo, useState } from 'react'
import { X, Calendar, ArrowRight } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { meterProfile } from '@/data/meterProfile'
import { Th, SortHead, FilterHead, MenuItem, type SortDir } from '@/components/table/tableBits'
import { neutral, text as textTok } from '@/tokens'

const BLUE = '#2F6BED' // 即時售電量
const GREEN = '#22C55E' // 累計售電量
const DATA_TYPES = ['負載資料(Load profile)', '事件資料(Event log)', '瞬時資料(Instantaneous)']

type SortKey = 'rindex' | 'dataTime' | 'hesTime' | 'mdmsTime' | 'delay'
type LoadFilter = 'all' | '0' | '1'

/**
 * 電表詳細資料 modal (Figma 2956:88148) — opened from the 詳細資料 action on a
 * meter row. Shows the meter's load-profile chart (dual kWh axes) plus the raw
 * reading table. Closes via X, backdrop click, or Esc.
 */
export function MeterDetailModal({ meterNo, onClose }: { meterNo: string; onClose: () => void }) {
  const { chart, rows } = useMemo(() => meterProfile(meterNo), [meterNo])
  const [dataType, setDataType] = useState(DATA_TYPES[0])
  const [loadFilter, setLoadFilter] = useState<LoadFilter>('all')
  const [menu, setMenu] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tableRows = useMemo(() => {
    let r = rows.filter((row) => loadFilter === 'all' || String(row.loadStatus) === loadFilter)
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const d = typeof av === 'number' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? d : -d
      })
    }
    return r
  }, [rows, loadFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(1120px,96vw)] max-h-[90vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        {/* header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
          <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
            <X size={18} />
          </button>
          <h2 className="text-[16px] font-semibold text-ink">電表詳細資料</h2>
        </div>

        {/* body */}
        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {/* device / time-range / data-type */}
          <div className="flex items-end gap-8 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-ink-mut">裝置</span>
              <span className="text-[20px] font-bold text-ink font-mono">{meterNo}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-mut">資料時間</span>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink">
                <span className="tabular-nums">2025-01-01 01:30</span>
                <ArrowRight size={14} className="text-ink-mut" />
                <span className="tabular-nums">2025-01-01 23:30</span>
                <Calendar size={15} className="text-ink-mut ml-1" />
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-mut">資料類型</span>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="w-[240px] rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
              >
                {DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* dual-axis chart */}
          <div className="relative rounded-xl border border-border bg-inset/30 p-3">
            <span className="absolute left-4 top-2 text-[11px] text-ink-mut">kWh</span>
            <span className="absolute right-4 top-2 text-[11px] text-ink-mut">kWh</span>
            <div className="flex items-center justify-center gap-5 mb-1">
              <LegendDot color={BLUE} label="即時售電量" />
              <LegendDot color={GREEN} label="累計售電量" />
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 14, right: 6, bottom: 0, left: -6 }}>
                  <CartesianGrid stroke={neutral.divider} vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: textTok.tertiary }} tickLine={false} axisLine={{ stroke: neutral.border }} interval={0} />
                  <YAxis
                    yAxisId="left"
                    domain={[0, 2500]}
                    ticks={[0, 500, 1000, 1500, 2000, 2500]}
                    tick={{ fontSize: 10, fill: textTok.tertiary }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={['dataMin - 5', 'dataMax + 5']}
                    tick={{ fontSize: 10, fill: textTok.tertiary }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => v.toLocaleString('en-US')}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const inst = payload.find((p) => p.dataKey === 'instant')?.value
                      const cum = payload.find((p) => p.dataKey === 'cumulative')?.value
                      return (
                        <div className="rounded-lg bg-surface border border-border shadow-card px-3 py-2 text-[12px]">
                          <div className="text-ink mb-1">2025-01-01 {label}</div>
                          <TipRow color={BLUE} label="即時售電量" value={inst as number} />
                          <TipRow color={GREEN} label="累計售電量" value={cum as number} />
                        </div>
                      )
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="instant" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: '#fff', stroke: BLUE, strokeWidth: 1.5 }} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={GREEN} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* reading table */}
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="text-ink-sub border-b border-border">
                <Th><SortHead label="rindex" active={sortKey === 'rindex'} dir={sortDir} onClick={() => toggleSort('rindex')} /></Th>
                <Th><SortHead label="資料時間" active={sortKey === 'dataTime'} dir={sortDir} onClick={() => toggleSort('dataTime')} /></Th>
                <Th><SortHead label="HES接收時間" active={sortKey === 'hesTime'} dir={sortDir} onClick={() => toggleSort('hesTime')} /></Th>
                <Th><SortHead label="傳送至MDMS時間" active={sortKey === 'mdmsTime'} dir={sortDir} onClick={() => toggleSort('mdmsTime')} /></Th>
                <Th><SortHead label="延遲" active={sortKey === 'delay'} dir={sortDir} onClick={() => toggleSort('delay')} /></Th>
                <Th>
                  <FilterHead label="負載資料狀態" open={menu} onToggle={() => setMenu(!menu)}>
                    {(['all', '0', '1'] as LoadFilter[]).map((s) => (
                      <MenuItem
                        key={s}
                        active={loadFilter === s}
                        onClick={() => {
                          setLoadFilter(s)
                          setMenu(false)
                        }}
                      >
                        {s === 'all' ? '全部' : s}
                      </MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th>售電總仟瓦小時</Th>
                <Th>總購電kVAh</Th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.rindex} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2 tabular-nums text-ink">{r.rindex}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{r.dataTime}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{r.hesTime}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{r.mdmsTime}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{r.delay}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{r.loadStatus}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{r.kwhTotal}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{r.kvahTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {menu && <div className="fixed inset-0 z-0" onClick={() => setMenu(false)} />}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-[12px] text-ink-sub">{label}</span>
    </div>
  )
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-sub">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <b className="text-ink tabular-nums">{value?.toLocaleString('en-US')}</b>
    </div>
  )
}
