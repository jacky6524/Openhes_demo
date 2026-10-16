import { RatioCard } from '@/components/kpi/RatioCard'
import { RateKpiCard, EventCountCard } from '@/components/kpi/KpiCard'
import { HealthMap } from '@/components/map/HealthMap'
import { CrossScatter } from '@/components/cross/CrossScatter'
import { SharedMetricCard } from '@/components/shared/SharedMetricCard'
import { MeterDrawer } from '@/components/drawer/MeterDrawer'

/**
 * 系統總覽 — 版面與前端正式包 `openhes-front` 的
 * `features/DashBoard/components/new/NewDashboard.vue` 逐格對齊。
 *
 * 前端 CSS ⟷ 這裡的對應：
 *   .new-dashboard      → 外層 padding 16 + 玫瑰漸層底 (bg-dashboard)
 *   .dashboard-canvas   → grid rows `minmax(96px,96fr) minmax(736px,856fr)`
 *                          gap 16、min-width 1240
 *   .kpi-row            → cols 880fr / 736fr
 *   .kpi-row-left       → cols 552fr / 312fr（電表連線率 : MN午夜讀表率）
 *   .kpi-row-right      → cols 1fr / 1fr（ALT : LP）
 *   .dashboard-grid     → cols 880fr / 736fr，單列吃滿剩餘高度
 *   .right-column       → rows `96fr / 480fr / 248fr`
 *   .right-top          → cols 500fr / 220fr（DCU連線率 : 事件·停電）
 *
 * 高度較矮的螢幕（前端 @media max-height:943px）壓縮 gap 與 padding，
 * 這裡以 Tailwind arbitrary variant `[@media(max-height:943px)]` 對應。
 *
 * MeterDrawer 在點選行政區時覆蓋右欄的比對圖。
 */
export function SystemOverview() {
  return (
    <div className="h-full min-w-[1272px] overflow-auto bg-dashboard p-4 [@media(max-height:943px)]:p-3">
      <div
        className={[
          'grid h-full min-h-[848px] w-full min-w-[1240px] gap-4',
          'grid-rows-[minmax(96px,96fr)_minmax(736px,856fr)]',
          '[@media(max-height:943px)]:min-h-0 [@media(max-height:943px)]:gap-3',
          '[@media(max-height:943px)]:grid-rows-[84px_minmax(0,1fr)]',
        ].join(' ')}
      >
        {/* .kpi-row — 上排 KPI，四張卡等高共用同一列 */}
        <section className="grid min-h-0 grid-cols-[880fr_736fr] gap-4 [@media(max-height:943px)]:gap-3">
          <div className="grid min-w-0 grid-cols-[552fr_312fr] gap-4 [@media(max-height:943px)]:gap-3">
            <RatioCard variant="meter" />
            <RateKpiCard metric="midnight" label="MN午夜讀表率 (%)" />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-4 [@media(max-height:943px)]:gap-3">
            <RateKpiCard metric="alt" label="ALT 讀表率 (%)" />
            <RateKpiCard metric="lp" label="LP 讀表率 (%)" />
          </div>
        </section>

        {/* .dashboard-grid — 地圖 ｜ 右欄 */}
        <section className="grid min-h-0 grid-cols-[880fr_736fr] grid-rows-[minmax(0,1fr)] items-stretch gap-4 [@media(max-height:943px)]:gap-3">
          {/* .map-panel — 卡片本身不留白，地圖自帶麵包屑與內距 */}
          <article className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border-[0.5px] border-card-border bg-surface shadow-card">
            <HealthMap />
          </article>

          {/* .right-column */}
          <div
            className={[
              'grid min-h-0 min-w-0 gap-4',
              'grid-rows-[minmax(96px,96fr)_minmax(360px,480fr)_minmax(248px,248fr)]',
              '[@media(max-height:943px)]:gap-3',
              '[@media(max-height:943px)]:grid-rows-[minmax(80px,84fr)_minmax(280px,360fr)_minmax(176px,220fr)]',
            ].join(' ')}
          >
            {/* .right-top */}
            <section className="grid min-h-0 grid-cols-[500fr_220fr] items-stretch gap-4 [@media(max-height:943px)]:gap-3">
              <RatioCard variant="dcu" />
              <EventCountCard />
            </section>

            {/* .scatter-panel — 點選行政區時 MeterDrawer 覆蓋於上 */}
            <section className="relative min-h-0 min-w-0">
              <CrossScatter />
              <MeterDrawer />
            </section>

            {/* .trend-panel */}
            <section className="min-h-0 min-w-0">
              <SharedMetricCard />
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
