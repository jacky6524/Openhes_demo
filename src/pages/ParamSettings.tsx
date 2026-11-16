import { useMemo, useRef, useState } from 'react'
import { RotateCcw, SlidersHorizontal, CircleCheck } from 'lucide-react'
import { Th } from '@/components/table/tableBits'
import { health } from '@/tokens'
import {
  useThresholds, METRICS, LIMIT, DEFAULT_THRESHOLD, validate,
  type ApiMetric, type ApiThreshold, type ChangeLog,
} from '@/config/statusThresholds'

/**
 * 權限管理 · 參數調整（2026-11-04 新增；無設計稿）。
 *
 * 目前只有「燈號門檻」一區：五個指標各一組 良好（綠燈）／注意（黃燈）門檻，低於注意＝警告（紅燈）。
 * 規則照後端 AppConfig 的 status 分類（GET /api/config 實打取得）：
 *   · 值域 50%～100%（後端存 0.5～1），良好必須大於注意
 *   · 改值後「下次使用（≤30 秒）」生效、不需二次確認（confirmRequired=false）
 *   · 每個設定鍵有原廠預設（defaultValue）→ 每列提供「還原預設」
 * 畫面上編輯的是草稿，改了才亮「取消／儲存變更」（同角色權限管理）；有驗證錯誤時不能儲存。
 * demo 只改記憶體（useThresholds），重新整理還原。
 * TODO: 儲存時逐鍵打 PUT /api/config/key/openhes.status.<slug>.good|warning，body { value: '0.97', updatedBy: 'webui:<帳號>' }。
 */
const DEMO_USER = 'webui:admin'

type Draft = Record<ApiMetric, { good: string; warning: string }>
const toDraft = (v: Record<ApiMetric, ApiThreshold>): Draft =>
  Object.fromEntries(METRICS.map((m) => [m.key, { good: String(v[m.key].good), warning: String(v[m.key].warning) }])) as Draft
const parse = (d: { good: string; warning: string }): ApiThreshold => ({ good: Number(d.good), warning: Number(d.warning) })

export function ParamSettings() {
  const values = useThresholds((s) => s.values)
  const log = useThresholds((s) => s.log)
  const saveAll = useThresholds((s) => s.save)
  const [draft, setDraft] = useState<Draft>(() => toDraft(values))
  const [notice, setNotice] = useState('')

  const parsed = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, parse(draft[m.key])])) as Record<ApiMetric, ApiThreshold>,
    [draft],
  )
  const errors = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, validate(parsed[m.key])])) as Record<ApiMetric, string | null>,
    [parsed],
  )
  const changed = METRICS.filter((m) => parsed[m.key].good !== values[m.key].good || parsed[m.key].warning !== values[m.key].warning)
  const dirty = changed.length > 0
  const hasError = METRICS.some((m) => errors[m.key])

  const set = (k: ApiMetric, side: 'good' | 'warning', v: string) => {
    setNotice('')
    setDraft((d) => ({ ...d, [k]: { ...d[k], [side]: v } }))
  }
  const resetRow = (k: ApiMetric) => {
    setNotice('')
    setDraft((d) => ({ ...d, [k]: { good: String(DEFAULT_THRESHOLD.good), warning: String(DEFAULT_THRESHOLD.warning) } }))
  }
  const revert = () => { setDraft(toDraft(values)); setNotice('') }
  const save = () => {
    if (!dirty || hasError) return
    saveAll(parsed, DEMO_USER)
    setNotice(`已儲存 ${changed.length} 個指標的門檻，約 30 秒內生效`)
  }

  return (
    <div className="flex h-full min-w-[1180px] flex-col">
      {/* 頁面標題列（同權限管理其他頁） */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-6">
        <SlidersHorizontal size={20} className="text-brand" />
        <h1 className="text-[16px] font-semibold text-ink">參數調整</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
          <div className="flex shrink-0 items-center gap-3 border-b border-divider px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold text-ink">燈號門檻</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-sub">
                比率達到<b className="text-ink">良好門檻</b>顯示綠燈；介於注意與良好之間顯示黃燈；低於<b className="text-ink">注意門檻</b>顯示紅燈。
                可設定範圍 {LIMIT.min}%～{LIMIT.max}%，良好必須大於注意。儲存後約 30 秒內生效。
              </p>
            </div>
            {notice && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: health.good.stroke }}>
                <CircleCheck size={16} />{notice}
              </span>
            )}
            <button
              onClick={revert}
              disabled={!dirty}
              className="rounded-lg border-[0.5px] border-border-strong px-3 py-1.5 text-[14px] font-semibold text-ink-sub hover:bg-inset disabled:opacity-40 disabled:hover:bg-transparent"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={!dirty || hasError}
              title={hasError ? '請先修正標紅的欄位' : undefined}
              className="rounded-lg bg-brand px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40 disabled:hover:bg-brand"
            >
              儲存變更{dirty && ` (${changed.length})`}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed text-[13px] border-collapse">
              <colgroup>
                <col style={{ width: '17%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '96px' }} />
              </colgroup>
              <thead>
                <tr className="text-ink-sub">
                  <Th className="sticky top-0 z-10 bg-inset">指標</Th>
                  <Th className="sticky top-0 z-10 bg-inset">良好門檻（≥）</Th>
                  <Th className="sticky top-0 z-10 bg-inset">注意門檻（≥）</Th>
                  <Th className="sticky top-0 z-10 bg-inset">燈號預覽</Th>
                  <Th className="sticky top-0 z-10 bg-inset">套用畫面</Th>
                  <Th className="sticky top-0 z-10 bg-inset">最後修改</Th>
                  <Th className="sticky top-0 z-10 bg-inset" />
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const err = errors[m.key]
                  const t = parsed[m.key]
                  const rowChanged = changed.includes(m)
                  const isDefault = t.good === DEFAULT_THRESHOLD.good && t.warning === DEFAULT_THRESHOLD.warning
                  return (
                    <tr key={m.key} className={`border-b border-divider align-top ${rowChanged ? 'bg-brand-soft/40' : ''}`}>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-ink">{m.label}</div>
                        <div className="mt-0.5 break-all font-mono text-[11px] text-ink-mut">openhes.status.{m.slug}.*</div>
                      </td>
                      <td className="px-3 py-3">
                        <PctInput value={draft[m.key].good} invalid={!!err} onChange={(v) => set(m.key, 'good', v)} />
                      </td>
                      <td className="px-3 py-3">
                        <PctInput value={draft[m.key].warning} invalid={!!err} onChange={(v) => set(m.key, 'warning', v)} />
                        {err && <div className="mt-1 text-[12px]" style={{ color: health.alert.stroke }}>{err}</div>}
                      </td>
                      <td className="px-3 py-3">{err ? <span className="text-[12px] text-ink-mut">—</span> : <LightBar t={t} onChange={(side, v) => set(m.key, side, String(v))} />}</td>
                      <td className="px-3 py-3 text-ink-sub">{m.usedBy}</td>
                      <td className="px-3 py-3 text-[12px] leading-snug text-ink-sub">
                        <LogLine side="良好" log={log[m.key].good} />
                        <LogLine side="注意" log={log[m.key].warning} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => resetRow(m.key)}
                          disabled={isDefault}
                          title={`還原為原廠預設（良好 ${DEFAULT_THRESHOLD.good}%／注意 ${DEFAULT_THRESHOLD.warning}%）`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-sub hover:bg-inset hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <RotateCcw size={13} />還原預設
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[12px] leading-relaxed text-ink-mut">
              「套用畫面」為 prototype 目前接上這組門檻的畫面。系統總覽與 DCU總覽仍使用各自的門檻設定，尚未改接這裡。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PctInput({ value, invalid, onChange }: { value: string; invalid: boolean; onChange: (v: string) => void }) {
  return (
    <div className="relative w-[110px]">
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        min={LIMIT.min}
        max={LIMIT.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border bg-surface py-1.5 pl-3 pr-7 text-[14px] tabular-nums text-ink focus:outline-none ${invalid ? 'border-danger focus:border-danger' : 'border-border focus:border-brand'}`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-mut">%</span>
    </div>
  )
}

type Side = 'good' | 'warning'
const STEP = 0.1
const MIN_GAP = STEP // 良好必須大於注意：拖曳時至少差一格
const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * 50%～100% 的色帶：紅（< 注意）／黃（注意～良好）／綠（≥ 良好），下方標出兩個門檻。
 * 2026-11-11：色帶上方兩個箭頭可拖動調整門檻（同步回左邊輸入框）。
 *   · 拖箭頭，或在色帶任一處按下 → 最近的那個箭頭跳過去並跟著拖
 *   · 每格 0.1%；兩個箭頭不能交叉（良好至少比注意大 0.1）
 *   · 箭頭可用鍵盤：Tab 選到後 ←／→ 調 0.1，Shift＋←／→ 調 1
 */
function LightBar({ t, onChange }: { t: ApiThreshold; onChange?: (side: Side, v: number) => void }) {
  const span = LIMIT.max - LIMIT.min
  const at = (v: number) => ((v - LIMIT.min) / span) * 100
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Side | null>(null)

  /** 依另一端限制範圍，回傳合法值 */
  const clampSide = (side: Side, v: number) =>
    side === 'warning'
      ? round1(Math.min(Math.max(v, LIMIT.min), t.good - MIN_GAP))
      : round1(Math.max(Math.min(v, LIMIT.max), t.warning + MIN_GAP))
  const valueAt = (clientX: number) => {
    const box = trackRef.current!.getBoundingClientRect()
    return LIMIT.min + ((clientX - box.left) / box.width) * span
  }
  const move = (side: Side, v: number) => {
    const nv = clampSide(side, v)
    if (nv !== t[side]) onChange?.(side, nv)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>, forced?: Side) => {
    if (!onChange || e.button !== 0) return
    e.preventDefault()
    const v = valueAt(e.clientX)
    // 按在色帶上：比良好還右邊→良好、比注意還左邊→注意，夾在中間取較近的
    const side: Side = forced ?? (v >= t.good ? 'good' : v <= t.warning ? 'warning' : v - t.warning < t.good - v ? 'warning' : 'good')
    trackRef.current!.setPointerCapture(e.pointerId)
    setDragging(side)
    // 直接抓箭頭時不跳值（避免按下的瞬間因為沒對準箭頭中心就變動）；按在色帶上才跳過去
    if (!forced) move(side, v)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) move(dragging, valueAt(e.clientX))
  }
  const onKey = (side: Side) => (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
    if (!d) return
    e.preventDefault()
    move(side, t[side] + d * (e.shiftKey ? 1 : STEP))
  }

  const handle = (side: Side) => {
    const active = dragging === side
    const color = side === 'good' ? health.good.stroke : health.warning.stroke
    return (
      <button
        type="button"
        role="slider"
        aria-label={side === 'good' ? '良好門檻' : '注意門檻'}
        aria-valuemin={LIMIT.min}
        aria-valuemax={LIMIT.max}
        aria-valuenow={t[side]}
        title={`${side === 'good' ? '良好' : '注意'}門檻 ${t[side]}%（拖曳調整；←→ 微調 0.1，Shift 加速）`}
        onKeyDown={onKey(side)}
        onPointerDown={(e) => { e.stopPropagation(); onDown(e as unknown as React.PointerEvent<HTMLDivElement>, side) }}
        className="absolute top-0 -translate-x-1/2 cursor-ew-resize rounded-sm px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        // 良好在右、注意在左：兩個很靠近時，良好的箭頭疊在上面
        style={{ left: `${at(t[side])}%`, zIndex: side === 'good' ? 2 : 1 }}
      >
        <svg width="12" height="9" viewBox="0 0 12 9" className={active ? 'scale-125' : ''} style={{ transition: 'transform .1s' }}>
          <path d="M1 1h10L6 8z" fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  return (
    <div className="pt-1">
      {/* 拖曳範圍＝箭頭列＋色帶 */}
      <div
        ref={trackRef}
        className={`relative pt-[11px] ${onChange ? 'cursor-pointer touch-none select-none' : ''}`}
        onPointerDown={(e) => onDown(e)}
        onPointerMove={onMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {onChange && handle('warning')}
        {onChange && handle('good')}
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <span style={{ width: `${at(t.warning)}%`, background: health.alert.fill }} />
        <span style={{ width: `${at(t.good) - at(t.warning)}%`, background: health.warning.fill }} />
        <span className="flex-1" style={{ background: health.good.fill }} />
      </div>
      </div>
      {/* 兩個門檻常常很近（95／97）：注意的數字靠在刻度左邊、良好靠在右邊；離兩端太近就不畫 50／100 */}
      <div className="relative mt-1 h-4 text-[11px] tabular-nums text-ink-mut">
        {at(t.warning) > 14 && <span className="absolute left-0">{LIMIT.min}</span>}
        <span className="absolute -translate-x-full pr-0.5 font-semibold text-ink-sub" style={{ left: `${at(t.warning)}%` }}>{t.warning}</span>
        <span className="absolute pl-0.5 font-semibold text-ink-sub" style={{ left: `${at(t.good)}%` }}>{t.good}</span>
        {at(t.good) < 80 && <span className="absolute right-0">{LIMIT.max}</span>}
      </div>
    </div>
  )
}

function LogLine({ side, log }: { side: string; log: ChangeLog | null }) {
  return (
    <div>
      <span className="text-ink-mut">{side}：</span>
      {log ? <span className="tabular-nums">{log.at}・{log.by}</span> : <span className="text-ink-mut">系統預設</span>}
    </div>
  )
}
