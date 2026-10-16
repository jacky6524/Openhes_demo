import { health, noMeter } from '@/tokens'
import { THRESHOLDS } from '@/config/thresholds'

/**
 * 地圖圖例 — 對齊前端 MapLibreDashboardMap.vue：
 *   `.map-legend`      白底膠囊，12px #6f6267，色塊 20×12 / radius 4
 *   `.swatch--stripe`  「無電表」用 3px 虛線條，不用實心色塊
 *   `.map-legend-help` hover 說明浮框（246px，14px 標題）
 *
 * 地圖著色綁 LP 讀表率，門檻直接讀 THRESHOLDS.lp，圖例與地圖不會走鐘。
 */

/** 狀態色塊 — 前端 `.swatch`（20×12 / radius 4）；`stripe` 為「無電表」虛線條 */
export function Swatch({ kind }: { kind: 'good' | 'warning' | 'alert' | 'muted' }) {
  if (kind === 'muted') {
    return (
      <i
        className="inline-block h-[3px] w-5 shrink-0 rounded-full"
        style={{ background: 'repeating-linear-gradient(to right, #CFD3DA 0 5px, transparent 5px 8px)' }}
      />
    )
  }
  return <i className="inline-block h-3 w-5 shrink-0 rounded" style={{ background: health[kind].fill }} />
}

const ORDER = ['good', 'warning', 'alert'] as const

export function Legend() {
  const { good, warn } = THRESHOLDS.lp
  const rules: Record<'good' | 'warning' | 'alert', string> = {
    good: `LP 讀表率 ≥ ${good}%`,
    warning: `${warn}% ≤ LP 讀表率 < ${good}%`,
    alert: `LP 讀表率 < ${warn}%`,
  }

  return (
    <div className="group relative">
      {/* .map-legend */}
      <div
        className="inline-flex items-center gap-3 rounded-lg border px-2.5 py-2 text-[12px]"
        style={{
          borderColor: '#EADFE1',
          background: 'rgba(255,255,255,.95)',
          boxShadow: '0 8px 20px rgba(58,42,48,.12)',
          color: '#6F6267',
        }}
        tabIndex={0}
        aria-label="查看讀表率狀態說明"
      >
        {ORDER.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <Swatch kind={k} />
            {health[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Swatch kind="muted" />
          {noMeter.label}
        </span>
      </div>

      {/* .map-legend-help — 開在圖例上方 */}
      <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[246px] translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div
          className="rounded-[9px] border px-3.5 py-3 text-[12px]"
          style={{
            borderColor: '#EADFE1',
            background: 'rgba(255,255,255,.98)',
            boxShadow: '0 10px 24px rgba(58,42,48,.16)',
            color: '#3D3438',
          }}
        >
          <strong className="mb-2.5 block text-[14px]" style={{ color: '#2D2629' }}>
            讀表率狀態
          </strong>
          <dl className="m-0 grid gap-[9px]">
            {ORDER.map((k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5">
                  <Swatch kind={k} />
                  {health[k].label}
                </dt>
                <dd className="m-0 text-right">{rules[k]}</dd>
              </div>
            ))}
            <div className="flex items-start justify-between gap-3">
              <dt className="inline-flex shrink-0 items-center gap-1.5 pt-1">
                <Swatch kind="muted" />
                {noMeter.label}
              </dt>
              <dd className="m-0 text-right leading-snug">該區域尚無智慧電表，不列入讀表率著色</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
