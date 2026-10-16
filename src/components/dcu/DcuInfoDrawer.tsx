import { useMemo } from 'react'
import { dcuInfo } from '@/data/dcuInfo'
import { dcuById } from '@/data/dcuFleet'
import { InfoDrawer } from '@/components/dcu/InfoDrawer'
import type { DcuRow } from '@/data/dcuList'

/**
 * DCU詳細資料 side drawer (Figma 2934:58801) — one DCU's attributes.
 * 2026-08-20 依業主意見：標題改「DCU詳細資料」、序號後以 () 標設備型號、
 * 移除「上線最後更新時間」、加上備註 1／2。
 * 2026-09-03：備註改為唯讀顯示欄位（原為可填寫的 textarea）。
 */
export function DcuInfoDrawer({ dcu, onClose }: { dcu: DcuRow; onClose: () => void }) {
  const extra = useMemo(() => dcuInfo(dcu.model), [dcu.model])
  // 設備型號來自 fleet（裝置列表頁的 mock DCU 不在 fleet 裡，就不標）
  const model = dcuById.get(dcu.model)?.model ?? ''
  // 備註為唯讀顯示欄位；TODO: 上線後由 API 提供，目前 mock 為空
  const notes = { n1: '', n2: '' }

  const rows: [string, string][] = [
    ['台電區處代碼', extra.taipowerCode],
    ['DCU編號', dcu.serial],
    ['訊號強度', String(extra.signal)],
    ['IP', extra.ip],
    ['IMSI', extra.imsi],
    ['Cell ID', extra.cellId],
    ['頻道組別／模式', extra.channelMode],
    ['台電圖號座標', extra.taipowerCoord],
    ['經緯度', extra.latlng],
    ['地址', extra.address],
    ['位置類型', extra.locationType],
    ['DCU引電類型', extra.powerType],
    ['連線類型', extra.connType],
    ['韌體版本', extra.firmware],
  ]

  return (
    <InfoDrawer
      title="DCU詳細資料"
      emphasisLabel="DCU序號"
      emphasisValue={model ? `${dcu.model}（${model}）` : dcu.model}
      rows={rows}
      footer={
        <div className="mt-4 flex flex-col gap-3">
          {/* 2026-09-03 依業主意見：備註是唯讀的顯示欄位，不是填寫欄位 */}
          {([['備註1', notes.n1], ['備註2', notes.n2]] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-sub">{label}</span>
              <div className="min-h-[38px] w-full whitespace-pre-wrap rounded-lg bg-inset/40 px-2.5 py-2 text-[13px] text-ink">
                {value || <span className="text-ink-mut">—</span>}
              </div>
            </div>
          ))}
        </div>
      }
      onClose={onClose}
    />
  )
}
