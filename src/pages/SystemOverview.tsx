import { RatioCard } from '@/components/kpi/RatioCard'
import { RateKpiCard, EventCountCard } from '@/components/kpi/KpiCard'
import { HealthMap } from '@/components/map/HealthMap'
import { CrossScatter } from '@/components/cross/CrossScatter'
import { SharedMetricCard } from '@/components/shared/SharedMetricCard'
import { MeterDrawer } from '@/components/drawer/MeterDrawer'

/**
 * Layout per Figma 3031-12251 (1920 canvas, content 1680 = left 880 + right 736,
 * gap 16). Two horizontal BANDS so the second-row modules line up across columns:
 *
 *   Band 1 (top KPI cards, ONE equal-height row across both columns):
 *     Left  (880): [ 電表連線率 500 | MN午夜讀表率 364 ]
 *     Right (736): [ ALT讀表率 | LP讀表率 ]
 *     → grid-rows-1 + h-full make all four cards the same height, so Band 2
 *       starts at the SAME y in both columns.
 *
 *   Band 2:
 *     Left  (880): [ 台灣地圖 ]（fills column height）
 *     Right (736): [ DCU連線率 500 | 事件·停電 220 ] → 比對圖 → LP讀表率 shared
 *     → 地圖上緣 ⟷ DCU連線率 / 事件數量 上緣 對齊。
 *
 * The MeterDrawer slides over the right column's scatter when a 行政區 is clicked.
 */
export function SystemOverview() {
  return (
    // 100% 縮放即撐滿版面：以 fr 欄位隨容器寬度縮放，min-width 降到 1080 讓一般
    // 螢幕(含側欄展開)不需水平捲動/拖拽。h-full 撐滿視窗高度，Band2 吸收剩餘高度。
    <div className="h-full p-4 min-w-[1080px] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        {/* Band 1 — all top KPI cards share one equal-height row (固定高) */}
        <div className="shrink-0 grid grid-cols-[880fr_736fr] gap-4 items-stretch">
          <div className="grid grid-cols-[500fr_364fr] grid-rows-1 gap-4 h-full">
            <RatioCard variant="meter" />
            <RateKpiCard metric="midnight" label="MN午夜讀表率(%)" />
          </div>
          <div className="grid grid-cols-2 grid-rows-1 gap-4 h-full">
            <RateKpiCard metric="alt" label="ALT 讀表率(%)" />
            <RateKpiCard metric="lp" label="LP讀表率(%)" />
          </div>
        </div>

        {/* Band 2 — 吸收剩餘視窗高度；地圖與右欄同高，比對圖拉長、概況卡下移不拉長 */}
        <div className="flex-1 min-h-0 grid grid-cols-[880fr_736fr] gap-4 items-stretch">
          {/* Left — Taiwan map, fills the column height */}
          <section className="min-h-[620px] min-w-0">
            <div className="h-full rounded-card bg-surface border border-border shadow-card p-3">
              <HealthMap />
            </div>
          </section>

          {/* Right — DCU/event cards, cross-compare, shared card */}
          <div className="flex flex-col gap-4 min-w-0 min-h-0">
            {/* DCU連線率 縮小 1/8 (500→437.5)，多出空間給 事件/停電數量 (220→282.5) */}
            <div className="shrink-0 grid grid-cols-[437.5fr_282.5fr] grid-rows-1 gap-4 items-stretch">
              <RatioCard variant="dcu" />
              <EventCountCard />
            </div>

            {/* cross-compare 拉長吸收剩餘高度；drawer slides over this region when a 行政區 is clicked */}
            <section className="flex-1 min-h-[360px] min-w-0 relative">
              <CrossScatter />
              <MeterDrawer />
            </section>

            {/* shared master-detail card — 保持原高、不拉長，隨比對圖增高而下移對齊 */}
            <div className="shrink-0">
              <SharedMetricCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
