import { RefreshCw } from 'lucide-react'
import { RingGauge } from './RingGauge'
import { InfoPopover, Note } from '@/components/kpi/InfoPopover'
import { fmtInt } from '@/lib/format'
import { text, overview } from '@/tokens'
import type { ModuleStat, RateBlock } from '@/data/systemOverview'
import { CONNECT_WINDOW_MINUTES, connection, lp, meterTotal, UPDATED_AT } from '@/data/systemOverview'

/**
 * 區塊 1：讀表成功數 —— 規格書 §1 參考畫面 1:1。
 *
 *   [1 電表總數] [2 60分鐘連線數 大環] [3 RF/LTE/NB 小環] [4 60分鐘讀表成功數 大環] [5 RF/LTE/NB 小環]
 *
 * 連線 = 時間內 online_info.online=1 的電表數；讀表成功 = 時間內收到 LP 的電表數。
 * 兩者的 60 分鐘視窗來自台達的 Kafka 彙整間隔，見 systemOverview.ts。
 */
export function ReadSuccessBlock() {
  return (
    <section className="relative rounded-card bg-surface border border-border shadow-card px-5 py-4">
      {/* 更新時間（規格書參考畫面右上角的重新整理圖示） */}
      <div className="absolute top-3 right-4 flex items-center gap-1.5 text-[11px] text-ink-mut">
        <RefreshCw size={12} strokeWidth={2} />
        <span className="tabular-nums">{UPDATED_AT}</span>
      </div>

      <div className="flex items-center justify-between gap-4 min-w-0">
        {/* 1 — 電表總數 */}
        <div className="shrink-0 flex flex-col items-center gap-1 pr-1">
          <div className="text-[42px] leading-none font-bold tabular-nums tracking-[-0.5px]" style={{ color: text.primary }}>
            {fmtInt(meterTotal)}
          </div>
          <div className="text-[13px] text-ink-sub">電表總數</div>
        </div>

        {/* 2 + 3 — 連線 */}
        <BigRing
          block={connection}
          color={overview.connect}
          caption={`${CONNECT_WINDOW_MINUTES}分鐘`}
          title="連線數"
          tip={`總計 ${fmtInt(connection.total)} 個啟用電表，其中 ${fmtInt(connection.success)} 個在過去 ${CONNECT_WINDOW_MINUTES} 分鐘內連線成功`}
          note="判定：時間內 online_info.online = 1"
        />
        <ModuleCluster modules={connection.modules} color={overview.connect} />

        {/* 4 + 5 — LP 讀表成功 */}
        <BigRing
          block={lp}
          color={overview.lp}
          caption={`${CONNECT_WINDOW_MINUTES}分鐘`}
          title="讀表成功數"
          tip={`總計 ${fmtInt(lp.total)} 個啟用電表，其中 ${fmtInt(lp.success)} 個在過去 ${CONNECT_WINDOW_MINUTES} 分鐘內LP讀表成功`}
          note="判定：時間內有收到 load_profile"
        />
        <ModuleCluster modules={lp.modules} color={overview.lp} />
      </div>
    </section>
  )
}

/** 大環：上半顯示成功數，下半顯示百分比，中間一道分隔線（比照參考畫面） */
function BigRing({
  block,
  color,
  caption,
  title,
  tip,
  note,
}: {
  block: RateBlock
  color: string
  caption: string
  title: string
  tip: string
  note: string
}) {
  return (
    <div className="relative group shrink-0">
      <RingGauge size={188} stroke={17} rate={block.rate} color={color}>
        <div className="text-[11px] text-ink-mut">{caption}</div>
        <div className="mt-0.5 text-[14px] font-semibold" style={{ color }}>
          {title}
        </div>
        <div className="mt-1.5 text-[27px] font-bold tabular-nums tracking-[-0.3px]" style={{ color }}>
          {fmtInt(block.success)}
        </div>
        <div className="my-1.5 h-px w-[92px] bg-divider" />
        <div className="text-[11px] text-ink-mut">百分比</div>
        <div className="mt-1 text-[23px] font-bold tabular-nums" style={{ color }}>
          {block.rate.toFixed(2)}%
        </div>
      </RingGauge>
      <InfoPopover title={`${caption}${title}`}>
        <Note>{tip}</Note>
        <Note>{note}</Note>
        <Note>分母：狀態為「啟用」的電表數（排除停用）</Note>
      </InfoPopover>
    </div>
  )
}

/** 三個模組小環：RF 置上，LTE / NB-IoT 並列於下（比照參考畫面的三角排列） */
function ModuleCluster({ modules, color }: { modules: ModuleStat[]; color: string }) {
  const [rf, lte, nb] = modules
  return (
    <div className="shrink-0 flex flex-col items-center gap-2">
      <SmallRing stat={rf} color={color} />
      <div className="flex items-start gap-2">
        <SmallRing stat={lte} color={color} />
        <SmallRing stat={nb} color={color} />
      </div>
    </div>
  )
}

/** 小環：模組名 / 成功數 / 應到數(灰) / 百分比 */
function SmallRing({ stat, color }: { stat: ModuleStat; color: string }) {
  return (
    <div className="relative group">
      <RingGauge size={104} stroke={5} rate={stat.rate} color={color}>
        <div className="text-[12px] font-semibold text-ink-sub">{stat.module}</div>
        <div className="mt-1 text-[15px] font-bold tabular-nums" style={{ color }}>
          {fmtInt(stat.success)}
        </div>
        <div className="mt-0.5 h-px w-[52px] bg-divider" />
        <div className="mt-0.5 text-[12px] tabular-nums text-ink-mut">{fmtInt(stat.total)}</div>
        <div className="mt-1 text-[13px] font-semibold tabular-nums" style={{ color }}>
          {stat.rate.toFixed(2)}%
        </div>
      </RingGauge>
      <InfoPopover title={stat.module}>
        <Note>
          {fmtInt(stat.total)} 個啟用 {stat.module} 電表，其中 {fmtInt(stat.success)} 個成功
        </Note>
      </InfoPopover>
    </div>
  )
}
