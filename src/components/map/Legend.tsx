import { Info } from 'lucide-react'
import { health, noMeter } from '@/tokens'
import { THRESHOLDS } from '@/config/thresholds'

/**
 * Map health legend: 良好 / 注意 / 警告 + 無智慧電表 (§4.2 bottom-left).
 * The map is coloured by LP 讀表率, so the hover spells out the exact LP bands
 * that drive each colour (reads live from THRESHOLDS.lp so legend ↔ map never
 * drift). 「無智慧電表」是「沒有資料」而非健康狀態，以斜線紋區隔。
 * Popover opens ABOVE the chip since the legend sits at the map's foot.
 */

/** small hatched swatch mirroring the map's noMeterHatch pattern */
function HatchSwatch({ size = 12 }: { size?: number }) {
  return (
    <span
      className="rounded-[3px] border shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: noMeter.stroke,
        backgroundColor: noMeter.fill,
        backgroundImage: `repeating-linear-gradient(45deg, ${noMeter.stroke} 0 1.5px, transparent 1.5px 5px)`,
      }}
    />
  )
}

export function Legend() {
  const { good, warn } = THRESHOLDS.lp
  const rules: Record<'good' | 'warning' | 'alert', string> = {
    good: `LP 讀表率 ≥ ${good}%`,
    warning: `${warn}% ≤ LP 讀表率 < ${good}%`,
    alert: `LP 讀表率 < ${warn}%`,
  }

  return (
    <div className="relative group">
      <div className="flex items-center gap-3 rounded-lg bg-surface/90 backdrop-blur border border-border px-3 py-1.5 shadow-card">
        {(['good', 'warning', 'alert'] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-[3px] border"
              style={{ background: health[k].fill, borderColor: health[k].stroke }}
            />
            <span className="text-[12px] text-ink-sub">{health[k].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <HatchSwatch />
          <span className="text-[12px] text-ink-sub">{noMeter.label}</span>
        </div>
        <Info size={13} className="text-ink-mut" />
      </div>

      {/* hover popover — opens above the chip */}
      <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-30 w-[248px] opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
        <div className="rounded-lg bg-surface border border-border shadow-card px-3 py-2.5 text-[12px]">
          <div className="font-semibold text-ink mb-1.5">讀表率狀態門檻</div>
          {(['good', 'warning', 'alert'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <span
                className="h-2.5 w-2.5 rounded-[2px] border shrink-0"
                style={{ background: health[k].fill, borderColor: health[k].stroke }}
              />
              <span className="text-ink-sub">
                <b className="text-ink">{health[k].label}</b>：{rules[k]}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 py-0.5 mt-1 pt-1.5 border-t border-divider">
            <HatchSwatch size={10} />
            <span className="text-ink-sub">
              <b className="text-ink">{noMeter.label}</b>：該區域尚無智慧電表，不列入讀表率著色
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
