import { useMemo } from 'react'
import { dcuInfo } from '@/data/dcuInfo'
import { InfoDrawer } from '@/components/dcu/InfoDrawer'
import type { DcuRow } from '@/data/dcuList'

/** DCU資料 side drawer (Figma 2934:58801) — one DCU's attributes. */
export function DcuInfoDrawer({ dcu, onClose }: { dcu: DcuRow; onClose: () => void }) {
  const extra = useMemo(() => dcuInfo(dcu.model), [dcu.model])

  const rows: [string, string][] = [
    ['台電區處代碼', extra.taipowerCode],
    ['DCU編號', dcu.serial],
    ['訊號強度', String(extra.signal)],
    ['IP', extra.ip],
    ['IMSI', extra.imsi],
    ['Cell ID', extra.cellId],
    ['頻道組別／模式', extra.channelMode],
    ['上線最後更新時間', extra.onlineLastTime],
    ['台電圖號座標', extra.taipowerCoord],
    ['經緯度', extra.latlng],
    ['地址', extra.address],
    ['位置類型', extra.locationType],
    ['DCU引電類型', extra.powerType],
    ['連線類型', extra.connType],
    ['韌體版本', extra.firmware],
  ]

  return (
    <>
      <InfoDrawer title="DCU資料" emphasisLabel="DCU" emphasisValue={dcu.model} rows={rows} onClose={onClose} />
    </>
  )
}
