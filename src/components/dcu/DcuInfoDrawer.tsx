import { useMemo, useState } from 'react'
import { dcuInfo } from '@/data/dcuInfo'
import { dcuById } from '@/data/dcuFleet'
import { InfoDrawer } from '@/components/dcu/InfoDrawer'
import type { DcuRow } from '@/data/dcuList'

/**
 * DCU詳細資料 side drawer (Figma 2934:58801) — one DCU's attributes.
 * 2026-08-20 依業主意見：標題改「DCU詳細資料」、序號後以 () 標設備型號、
 * 移除「上線最後更新時間」、加上可填寫的備註 1／2。
 */
export function DcuInfoDrawer({ dcu, onClose }: { dcu: DcuRow; onClose: () => void }) {
  const extra = useMemo(() => dcuInfo(dcu.model), [dcu.model])
  // 設備型號來自 fleet（裝置列表頁的 mock DCU 不在 fleet 裡，就不標）
  const model = dcuById.get(dcu.model)?.model ?? ''
  const [notes, setNotes] = useState({ n1: '', n2: '' })

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
          {/* 設備相關的自由文字，demo 僅存在本次開啟期間；上線接 API 後可寫回 */}
          {([['備註1', 'n1'], ['備註2', 'n2']] as const).map(([label, key]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-sub">{label}</span>
              <textarea
                rows={2}
                value={notes[key]}
                onChange={(e) => setNotes((s) => ({ ...s, [key]: e.target.value }))}
                placeholder="可填寫設備相關資訊"
                className="w-full resize-none rounded-lg border border-border bg-inset/40 px-2.5 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
              />
            </label>
          ))}
        </div>
      }
      onClose={onClose}
    />
  )
}
