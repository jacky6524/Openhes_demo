import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Maximize2, Minus, Plus, ScanSearch } from 'lucide-react'
import {
  BLOCK_MHZ, LANES, laneColor, SPECTRUM_MAX, SPECTRUM_MIN, rowKey, type ChannelRow, type Lane,
} from '@/data/channelPlan'

/**
 * 頻譜使用圖（2026-11-11 業主意見）—— 頻點常擠在一小段，整段 839～847 MHz 攤開會又擠又空，
 * 所以做成像剪輯軟體時間軸的「可拉伸」檢視：
 *   · 下方總覽條＝全頻段縮圖，中間的框＝目前檢視範圍：拖框身平移、拖左右把手拉伸／壓縮
 *   · 主圖：滾輪＝以游標為中心縮放；按住拖曳＝平移；雙擊＝對焦已用頻段
 *   · 右上按鈕：對焦已用頻段／全頻段／放大／縮小
 * 刻度間距隨縮放自動調整（1 → 0.5 → 0.2 → 0.1 → 0.05 MHz）；色塊夠寬才標 HES 設定與頻率。
 * 一個 Lane 一列（DELTA 依案別分兩列）；同一列同一頻點有多組設定時合成一塊，標成 O/sO。
 * 2026-11-19 業主意見：同廠商頻點不分色（主副頻道不再分深淺）；「組別」用點選時的動態框表示 ——
 *   點色塊＝框出該組 HES 設定的所有頻點（色塊含多組時，再點一次換下一組，輪完取消）；點表格列也可以。
 * 同日追加：廠商按顏色、頻點按文字（HES 後加 ¹／²＝頻點1／頻點2）；hover 色塊或表格列時，
 *   同步用同一個動態框框出一致的頻點（同組 HES 設定的所有色塊），表格對應列也一起反白。
 */
const SUP = { 1: '¹', 2: '²' } as const

const MIN_SPAN = 0.4
const FULL_SPAN = SPECTRUM_MAX - SPECTRUM_MIN
const LANE_W = 128 // 左側列名欄寬（px）

interface Use { key: string; hes: string; cases: string[]; which: 1 | 2; ch: number; suspect?: number }
interface Block { lane: Lane; f: number; uses: Use[] }
/** 色塊上的組別鍵（去重、保持順序） */
const groupsOf = (b: Block) => [...new Set(b.uses.map((u) => u.key))]

function buildBlocks(rows: ChannelRow[]): Block[] {
  const map = new Map<string, Block>()
  const put = (r: ChannelRow, f: number, which: 1 | 2, ch: number) => {
    const k = `${r.lane}@${f}`
    if (!map.has(k)) map.set(k, { lane: r.lane, f, uses: [] })
    const suspect = r.suspect?.field === (which === 1 ? 'f1' : 'f2') ? r.suspect.expected : undefined
    map.get(k)!.uses.push({ key: rowKey(r), hes: r.hes, cases: r.cases, which, ch, suspect })
  }
  for (const r of rows) {
    put(r, r.f1, 1, r.ch1)
    if (r.f2 !== null && r.ch2 !== null) put(r, r.f2, 2, r.ch2)
  }
  return [...map.values()]
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** 把 [lo, hi] 限制在全頻段內、寬度不小於 MIN_SPAN */
function fit(lo: number, hi: number): [number, number] {
  let span = clamp(hi - lo, MIN_SPAN, FULL_SPAN)
  const l = clamp(lo, SPECTRUM_MIN, SPECTRUM_MAX - span)
  span = Math.min(span, SPECTRUM_MAX - l)
  return [l, l + span]
}
function tickStep(span: number) {
  for (const s of [0.05, 0.1, 0.2, 0.5, 1]) if (span / s <= 14) return s
  return 1
}
const fmtF = (f: number) => (Math.round(f * 100) / 100).toFixed(2)

export function SpectrumChart({ rows, focus, highlight, onHover, selected, onSelect }: {
  rows: ChannelRow[]
  focus: Lane | null
  /** hover 中的組別（表格列或色塊），頻譜圖上以動態框框出 */
  highlight: string[]
  onHover: (keys: string[]) => void
  /** 點選中的組別（rowKey），頻譜圖上框出該組所有頻點 */
  selected: string | null
  onSelect: (key: string | null) => void
}) {
  const blocks = useMemo(() => buildBlocks(rows), [rows])
  const selRow = selected ? rows.find((r) => rowKey(r) === selected) : undefined
  /** 點色塊：不含目前組別 → 選第一組；含 → 換下一組，最後一組再點＝取消 */
  const clickBlock = (b: Block) => {
    const gs = groupsOf(b)
    const i = selected ? gs.indexOf(selected) : -1
    onSelect(i < 0 ? gs[0] : (gs[i + 1] ?? null))
  }
  const usedRange = useMemo<[number, number]>(() => {
    const fs = blocks.map((b) => b.f)
    return fit(Math.min(...fs) - BLOCK_MHZ, Math.max(...fs) + BLOCK_MHZ)
  }, [blocks])

  // 預設就對焦已用頻段（頻點集中在 840～843，整段攤開太擠）
  const [view, setView] = useState<[number, number]>(usedRange)
  const [lo, hi] = view
  const span = hi - lo

  const plotRef = useRef<HTMLDivElement>(null)
  const [plotW, setPlotW] = useState(800)
  useLayoutEffect(() => {
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPlotW(el.clientWidth))
    ro.observe(el)
    setPlotW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const pos = (f: number) => ((f - lo) / span) * 100
  const pxPerMHz = plotW / span
  const blockPx = BLOCK_MHZ * pxPerMHz

  /* ── 縮放／平移 ── */
  const zoomAt = (center: number, factor: number) =>
    setView(([l, h]) => {
      const s = clamp((h - l) * factor, MIN_SPAN, FULL_SPAN)
      const ratio = (center - l) / (h - l)
      return fit(center - s * ratio, center - s * ratio + s)
    })
  const pan = (dMHz: number) => setView(([l, h]) => fit(l + dMHz, h + dMHz))

  // 滾輪：React 的 onWheel 是 passive，攔不住頁面捲動，改用原生監聽
  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      setView(([l, h]) => {
        const s = h - l
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const d = ((e.shiftKey ? e.deltaY : e.deltaX) / box.width) * s
          return fit(l + d, h + d)
        }
        const center = l + ((e.clientX - box.left) / box.width) * s
        const ns = clamp(s * (e.deltaY > 0 ? 1.18 : 1 / 1.18), MIN_SPAN, FULL_SPAN)
        const ratio = (center - l) / s
        return fit(center - ns * ratio, center - ns * ratio + ns)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 主圖拖曳平移
  const drag = useRef<{ x: number; view: [number, number] } | null>(null)
  const moved = useRef(false)
  const onPlotDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setTip(null)
    drag.current = { x: e.clientX, view }
    moved.current = false
  }
  const onPlotMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) > 3) moved.current = true
    const [l, h] = d.view
    const dm = -((e.clientX - d.x) / plotW) * (h - l)
    setView(fit(l + dm, h + dm))
  }
  const onPlotUp = () => { drag.current = null }

  /* ── tooltip ── */
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ b: Block; x: number; y: number } | null>(null)

  const step = tickStep(span)
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
  const tickDigits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2

  const usedCount = new Set(blocks.map((b) => b.f)).size

  return (
    <div className="shrink-0 rounded-card border border-border bg-surface p-4 shadow-card">
      {/* 標題列 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="h-4 w-[3px] self-center rounded-full bg-danger" />
          <h2 className="text-[15px] font-semibold text-ink">頻譜使用圖</h2>
          <span className="text-[12px] tabular-nums text-ink-mut">
            檢視 {lo.toFixed(2)}～{hi.toFixed(2)} MHz（{span.toFixed(2)} MHz）· 共使用 {usedCount} 個頻點
          </span>
          {selRow && (
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-0.5 text-[12px] text-brand">
              已框選 {selRow.lane} · HES {selRow.hes}：{fmtF(selRow.f1)}{selRow.f2 !== null && ` / ${fmtF(selRow.f2)}`} MHz
              <button type="button" onClick={() => onSelect(null)} className="font-semibold hover:text-ink" title="取消框選">×</button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ToolBtn onClick={() => setView(usedRange)} title="對焦已用頻段（雙擊主圖也可以）"><ScanSearch size={14} />對焦已用頻段</ToolBtn>
          <ToolBtn onClick={() => setView([SPECTRUM_MIN, SPECTRUM_MAX])} title={`全頻段 ${SPECTRUM_MIN}～${SPECTRUM_MAX} MHz`}><Maximize2 size={14} />全頻段</ToolBtn>
          <ToolBtn onClick={() => zoomAt((lo + hi) / 2, 1 / 1.5)} title="放大" disabled={span <= MIN_SPAN + 1e-6}><Plus size={14} /></ToolBtn>
          <ToolBtn onClick={() => zoomAt((lo + hi) / 2, 1.5)} title="縮小" disabled={span >= FULL_SPAN - 1e-6}><Minus size={14} /></ToolBtn>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-3" onMouseLeave={() => setTip(null)}>
        <div className="flex">
          {/* 案別欄 */}
          <div className="shrink-0" style={{ width: LANE_W }}>
            {LANES.map((c) => (
              <div key={c} className="flex h-12 items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-ink" style={{ opacity: focus && focus !== c ? 0.3 : 1 }}>
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: laneColor(c) }} />{c}
              </div>
            ))}
          </div>

          {/* 主圖 */}
          <div
            ref={plotRef}
            className="relative flex-1 cursor-grab touch-none select-none overflow-hidden rounded bg-inset active:cursor-grabbing"
            onPointerDown={onPlotDown}
            onPointerMove={onPlotMove}
            onPointerUp={onPlotUp}
            onPointerCancel={onPlotUp}
            onDoubleClick={() => setView(usedRange)}
          >
            {/* 刻度格線 */}
            {ticks.map((t) => (
              <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pos(t)}%` }} />
            ))}
            {LANES.map((c) => (
              <div key={c} className="relative h-12 border-b border-surface last:border-b-0" style={{ opacity: focus && focus !== c ? 0.3 : 1 }}>
                {blocks.filter((b) => b.lane === c).map((b) => {
                  const left = pos(b.f - BLOCK_MHZ / 2)
                  if (left > 100 || left + (BLOCK_MHZ / span) * 100 < 0) return null
                  const suspect = b.uses.some((u) => u.suspect !== undefined)
                  const picked = b.uses.some((u) => u.key === selected || highlight.includes(u.key))
                  const hesList = [...new Set(b.uses.map((u) => u.hes))]
                  // 頻點按文字：O¹＝O 的頻點1、R²＝R 的頻點2；同一塊都是同一個頻點時只標一次（O/sO¹）
                  const whichs = new Set(b.uses.map((u) => u.which))
                  const label = whichs.size === 1
                    ? hesList.join('/') + SUP[b.uses[0].which]
                    : [...new Set(b.uses.map((u) => u.hes + SUP[u.which]))].join('/')
                  // 估字寬：粗體英數 11px 約 6px、10px 約 5.4px，上標約 3.5px；放不下 11px 就縮成 10px
                  const sups = (label.match(/[¹²]/g) ?? []).length
                  const est = (w: number) => (label.length - sups) * w + sups * 3.5 + 4
                  const labelSize = blockPx >= est(6) ? 11 : blockPx >= est(5.4) ? 10 : 0
                  const showLabel = labelSize > 0
                  const showFreq = blockPx >= 52
                  return (
                    <span
                      key={b.f}
                      onPointerEnter={(e) => {
                        const box = wrapRef.current?.getBoundingClientRect()
                        const me = e.currentTarget.getBoundingClientRect()
                        if (box) setTip({ b, x: me.left - box.left + me.width / 2, y: me.top - box.top })
                        if (!drag.current) onHover(groupsOf(b))
                      }}
                      onPointerLeave={() => { setTip(null); onHover([]) }}
                      onClick={() => { if (!moved.current) clickBlock(b) }}
                      className={`${picked ? 'spectrum-pick ' : ''}absolute inset-y-1 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[3px] leading-tight text-white`}
                      style={{
                        left: `${left}%`,
                        width: `max(${blockPx - 1}px, 2px)`,
                        background: laneColor(c),
                        // 點選中的色塊外框交給 .spectrum-pick（動畫要用 box-shadow，這裡不能蓋掉）
                        boxShadow: picked ? undefined : suspect ? 'inset 0 0 0 2px #F59E0B' : undefined,
                        zIndex: picked ? 2 : undefined,
                      }}
                    >
                      {showLabel ? (
                        <span className="whitespace-nowrap font-bold" style={{ fontSize: labelSize }}>{label}</span>
                      ) : hesList.length > 1 && blockPx >= 14 ? (
                        <span className="text-[10px] font-bold">{hesList.length}</span>
                      ) : null}
                      {showFreq && <span className="text-[10px] tabular-nums opacity-90">{fmtF(b.f)}</span>}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 頻率刻度 */}
        <div className="flex">
          <span className="shrink-0" style={{ width: LANE_W }} />
          <div className="relative h-5 flex-1 overflow-hidden text-[11px] tabular-nums text-ink-mut">
            {ticks.map((t) => (
              <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(t)}%` }}>{t.toFixed(tickDigits)}</span>
            ))}
          </div>
        </div>

        {/* 總覽條（拉伸檢視範圍） */}
        <div className="mt-2 flex items-center">
          <span className="shrink-0 text-[12px] text-ink-mut" style={{ width: LANE_W }}>全頻段</span>
          <Navigator blocks={blocks} view={view} onChange={(l, h) => setView(fit(l, h))} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 pl-[128px] text-[12px] text-ink-sub">
          <span>顏色＝廠商 · 文字 ¹／²＝頻點1／頻點2</span>
          <span className="flex items-center gap-1.5"><span className="spectrum-pick h-2.5 w-4 rounded-sm" />滑過＝框出同一組 HES 設定的頻點，點選＝固定框選（色塊含多組時再點換下一組）</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ boxShadow: 'inset 0 0 0 2px #F59E0B' }} />頻點與 Channel 對不上（待確認）</span>
          <span className="text-ink-mut">滾輪縮放 · 拖曳平移 · 雙擊對焦 · 拖動下方框的左右把手拉伸範圍</span>
        </div>

        {tip && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card"
            style={{ left: tip.x, top: tip.y - 6 }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <span className="size-2 rounded-sm" style={{ background: laneColor(tip.b.lane) }} />
              {tip.b.lane} · {fmtF(tip.b.f)} MHz
            </div>
            {tip.b.uses.map((u) => (
              <div key={`${u.key}-${u.which}`} className="mt-0.5 whitespace-nowrap tabular-nums text-ink-sub">
                HES {u.hes}（{u.cases.join('/')}）· Channel{u.which} = {u.ch}
                {u.suspect !== undefined && <span className="ml-1 text-[#B45309]">（依 Channel 換算應為 {fmtF(u.suspect)}，待確認）</span>}
              </div>
            ))}
            <div className="mt-1 text-[11px] text-ink-mut">點一下框出這組頻點</div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 總覽條：全頻段縮圖（每列一條細線標出頻點位置），框住目前檢視範圍。
 * 拖框身＝平移；拖左右把手＝拉伸／壓縮；點框外空白＝把框移到那裡。
 */
function Navigator({ blocks, view, onChange }: { blocks: Block[]; view: [number, number]; onChange: (lo: number, hi: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'move' | 'l' | 'r'; x: number; view: [number, number] } | null>(null)
  const pct = (f: number) => ((f - SPECTRUM_MIN) / FULL_SPAN) * 100
  const toMHz = (px: number) => (px / (ref.current?.clientWidth || 1)) * FULL_SPAN

  const start = (mode: 'move' | 'l' | 'r') => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation()
    ref.current?.setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, view }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dm = toMHz(e.clientX - d.x)
    const [l, h] = d.view
    if (d.mode === 'move') onChange(l + dm, h + dm)
    // 拉伸時另一端固定不動：先夾在全頻段內，fit() 才不會為了保持寬度去推另一端
    else if (d.mode === 'l') onChange(clamp(l + dm, SPECTRUM_MIN, h - MIN_SPAN), h)
    else onChange(l, clamp(h + dm, l + MIN_SPAN, SPECTRUM_MAX))
  }
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    // 點框外：框的中心移到點擊處
    const box = ref.current!.getBoundingClientRect()
    const c = SPECTRUM_MIN + ((e.clientX - box.left) / box.width) * FULL_SPAN
    const s = view[1] - view[0]
    onChange(c - s / 2, c + s / 2)
    ref.current?.setPointerCapture(e.pointerId)
    drag.current = { mode: 'move', x: e.clientX, view: [c - s / 2, c + s / 2] }
  }

  const ticks = Array.from({ length: FULL_SPAN + 1 }, (_, i) => SPECTRUM_MIN + i)

  return (
    <div className="flex-1">
      <div
        ref={ref}
        className="relative h-10 cursor-pointer touch-none select-none rounded bg-inset"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      >
        {ticks.slice(1, -1).map((t) => <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pct(t)}%` }} />)}
        {/* 每列一條細線，畫出頻點位置 → 一眼看出集中在哪 */}
        {LANES.map((c, i) => (
          <div key={c} className="absolute inset-x-0" style={{ top: 3 + i * 7, height: 5 }}>
            {blocks.filter((b) => b.lane === c).map((b) => (
              <span key={b.f} className="absolute inset-y-0 rounded-[1px]" style={{ left: `${pct(b.f - BLOCK_MHZ / 2)}%`, width: `${(BLOCK_MHZ / FULL_SPAN) * 100}%`, background: laneColor(c) }} />
            ))}
          </div>
        ))}
        {/* 框外變暗 */}
        <span className="pointer-events-none absolute inset-y-0 left-0" style={{ background: 'rgba(17,24,39,.08)', width: `${pct(view[0])}%` }} />
        <span className="pointer-events-none absolute inset-y-0 right-0" style={{ background: 'rgba(17,24,39,.08)', width: `${100 - pct(view[1])}%` }} />
        {/* 檢視框 */}
        <div
          className="absolute inset-y-0 cursor-grab rounded border-2 border-brand active:cursor-grabbing"
          style={{ left: `${pct(view[0])}%`, width: `${pct(view[1]) - pct(view[0])}%` }}
          onPointerDown={start('move')}
        >
          <span onPointerDown={start('l')} className="absolute -left-[5px] top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-brand" title="拖曳拉伸左端" />
          <span onPointerDown={start('r')} className="absolute -right-[5px] top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-brand" title="拖曳拉伸右端" />
        </div>
      </div>
      <div className="relative h-4 text-[11px] tabular-nums text-ink-mut">
        {ticks.map((t, i) => (
          <span key={t} className="absolute top-0.5" style={{ left: `${pct(t)}%`, transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{t}</span>
        ))}
      </div>
    </div>
  )
}

function ToolBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink-sub hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink-sub"
    >
      {children}
    </button>
  )
}
