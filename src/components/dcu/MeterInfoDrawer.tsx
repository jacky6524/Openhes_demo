import { useMemo } from 'react'
import { meterInfo } from '@/data/meterInfo'
import { InfoDrawer } from '@/components/dcu/InfoDrawer'
import type { DcuMeterRow } from '@/data/dcuMeters'

/** 電表資料 side drawer (Figma 2941:68507) — one meter's attributes. */
export function MeterInfoDrawer({ meter, onClose }: { meter: DcuMeterRow; onClose: () => void }) {
  const extra = useMemo(() => meterInfo(meter.meterNo), [meter.meterNo])

  const rows: [string, string][] = [
    ['表號', meter.meterNo],
    ['IP', extra.ip],
    ['IMSI', extra.imsi],
    ['Cell ID', extra.cellId],
    ['TOU ID', extra.touId],
    ['PT／CT／功率', extra.ptCt],
    ['回報裝置', meter.reportDevice],
    ['上線狀態更新時間', extra.onlineStatusTime],
    ['上線最後更新時間', extra.onlineLastTime],
    ['金鑰日期', extra.keyDate],
    ['經緯度', extra.latlng],
    ['地址', meter.address],
    ['模組型號', extra.moduleModel],
    ['模組韌體版本', extra.moduleFw],
    ['備註', extra.note],
  ]

  return (
    <>
      <InfoDrawer title="電表資料" emphasisLabel="電號" emphasisValue={meter.elecNo} rows={rows} onClose={onClose} />
    </>
  )
}
