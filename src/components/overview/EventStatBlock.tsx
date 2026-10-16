import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { InfoPopover, Note } from '@/components/kpi/InfoPopover'
import { fmtInt } from '@/lib/format'
import { status, text } from '@/tokens'
import type { CountStat } from '@/data/systemOverview'
import { events } from '@/data/systemOverview'

/**
 * 區塊 4：事件顯示 —— 規格書 §4 參考畫面。
 * 三張卡並排，每張左側是目前數量、右側是與前一天的差額。
 *
 * 三個指標都是「越少越好」，因此差額上升以告警紅呈現、下降以正常綠呈現
 * （規格書截圖是純黑字，這裡依本專案的顏色法則加上方向色）。
 */
export function EventStatBlock() {
  return (
    <section className="grid grid-cols-3 gap-4">
      <StatCard
        stat={events.outage}
        label="目前停電數"
        tip="由 device_last_event 的事件碼 14 (Primary Power Down) / 15 (Primary Power Up) 判定：只有 14 沒有 15，或 15 的最新時間早於 14，即視為仍在停電中。"
      />
      <StatCard stat={events.disconnected} label="目前斷線數" tip="online_info.online = 0 的電表數量。" />
      <StatCard stat={events.event} label="事件數量" tip="截至目前為止，今天收到的事件數量。" />
    </section>
  )
}

function StatCard({ stat, label, tip }: { stat: CountStat; label: string; tip: string }) {
  return (
    <div className="relative group rounded-card bg-surface border border-border shadow-card px-5 py-4">
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <div
            className="text-[38px] leading-none font-bold tabular-nums tracking-[-0.5px]"
            style={{ color: text.primary }}
          >
            {fmtInt(stat.value)}
          </div>
          <div className="text-[13px] text-ink-sub">{label}</div>
        </div>
        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <DayDelta delta={stat.deltaDay} />
          <div className="text-[13px] text-ink-sub">與前一天比較</div>
        </div>
      </div>

      <InfoPopover title={label}>
        <Note>{tip}</Note>
        <Note>比較基準：前一天的每日統計數據 (daily_statistics)</Note>
      </InfoPopover>
    </div>
  )
}

/** 數量型指標：上升 = 壞 = 紅，下降 = 好 = 綠，持平 = 灰 */
function DayDelta({ delta }: { delta: number }) {
  const color = delta > 0 ? status.danger.fg : delta < 0 ? status.normal.fg : text.tertiary
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
  return (
    <div className="flex items-center gap-1" style={{ color }}>
      <Icon size={22} strokeWidth={2.4} />
      <span className="text-[34px] leading-none font-bold tabular-nums tracking-[-0.5px]">
        {delta > 0 ? '+' : delta < 0 ? '−' : ''}
        {fmtInt(Math.abs(delta))}
      </span>
    </div>
  )
}
