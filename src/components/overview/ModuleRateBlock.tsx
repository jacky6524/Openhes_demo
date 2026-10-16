import { InfoPopover, Note } from '@/components/kpi/InfoPopover'
import { fmtInt } from '@/lib/format'
import { chartNeutral, text } from '@/tokens'
import type { RateBlock } from '@/data/systemOverview'

/**
 * 區塊 2 / 3 共用：午夜讀表數 (MN) 與 定時供電品質 (ALT)。
 * 版面比照規格書 §2 / §3 參考畫面：
 *
 *   [ 大數字 + 名稱 ]        [ RF：  458,478  ▮▮▮▮ 97% ]
 *   [ 總百分比長條      ]    [ LTE： 50,204   ▮▮▮  91% ]
 *                            [ NB-IoT：86,646 ▮▮▮  94% ]
 *
 * 兩區塊唯一差別是色彩與判定時點，因此抽成同一個元件。
 */
export function ModuleRateBlock({
  block,
  label,
  color,
  atLabel,
  tip,
  rule,
}: {
  block: RateBlock
  /** 大數字底下的名稱，例如「午夜讀表數」 */
  label: string
  color: string
  /** 判定時點說明，例如「當日 00:00」 */
  atLabel: string
  /** ToolTip 主文（規格書指定句型） */
  tip: string
  /** 判定規則說明 */
  rule: string
}) {
  return (
    <section className="relative group rounded-card bg-surface border border-border shadow-card px-5 py-4">
      <div className="grid grid-cols-[minmax(0,42fr)_minmax(0,58fr)] gap-6 items-center">
        {/* 左：總數 + 總百分比長條 */}
        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1">
            <div
              className="text-[46px] leading-none font-bold tabular-nums tracking-[-0.5px]"
              style={{ color: text.primary }}
            >
              {fmtInt(block.success)}
            </div>
            <div className="text-[13px] text-ink-sub">{label}</div>
          </div>
          <RateBar rate={block.rate} color={color} height={44} textSize={20} />
        </div>

        {/* 右：三個通訊模組 */}
        <div className="min-w-0 flex flex-col gap-2.5">
          {block.modules.map((m) => (
            <div key={m.module} className="grid grid-cols-[62px_minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-3">
              <div className="text-[13px] font-semibold text-ink-sub text-right">{m.module}：</div>
              <div className="text-[16px] font-bold tabular-nums text-ink text-right">{fmtInt(m.success)}</div>
              <RateBar rate={m.rate} color={color} height={34} textSize={15} />
            </div>
          ))}
        </div>
      </div>

      <InfoPopover title={label} align="left">
        <Note>{tip}</Note>
        <Note>判定時點：{atLabel}</Note>
        <Note>{rule}</Note>
        <Note>分母：狀態為「啟用」的電表數（排除停用）</Note>
      </InfoPopover>
    </section>
  )
}

/** 「空容器裝填比率」長條：中性 track + 依比率填色，百分比壓在填色區內 */
function RateBar({ rate, color, height, textSize }: { rate: number; color: string; height: number; textSize: number }) {
  const pct = Math.max(0, Math.min(100, rate))
  return (
    <div
      className="relative w-full rounded-[6px] overflow-hidden"
      style={{ height, background: chartNeutral.track }}
    >
      <div className="h-full rounded-[6px] flex items-center justify-center" style={{ width: `${pct}%`, background: color }}>
        <span
          className="font-bold tabular-nums text-white"
          style={{ fontSize: textSize }}
        >
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  )
}
