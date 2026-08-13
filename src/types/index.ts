export type Health = 'good' | 'warning' | 'alert'

export type MetricKey = 'connect' | 'lp' | 'midnight' | 'alt'
/** map drill layers: L1 全台 → L2 縣市 → L3 行政區(鄉鎮市區). 行政區 is the leaf
    (no 村里 drill-down); clicking it opens the meter-detail drawer. */
export type Level = 'L1' | 'L2' | 'L3'

export interface RegionMetrics {
  meterTotal: number
  connected: number // 已連線
  connectRate: number // 連線率 %
  lpRate: number
  midnightRate: number
  altRate: number
  eventCount: number
  dhcDisconnect: number // DHC 斷線數
}

export interface RegionNode {
  id: string
  name: string
  level: Level
  metrics: RegionMetrics
  health: Health // derived from metrics + thresholds (never hard-coded)
  parentId?: string
  geoKey?: string // links L1 node to TopoJSON county name
  children?: RegionNode[]
}

/** deepest-level detail row — DCU-centric (§ review feedback). LP狀態 is derived
    from lpRate against THRESHOLDS.lp, so it matches the map's LP colouring. */
export interface Dcu {
  serial: string // DCU 序號
  connectRate: number // 連線率 %
  lpRate: number // LP 讀表率 %
  meterTotal: number // 電表總數（該 DCU 收容，排除停用）
  connected: number // 連線數
  read: number // 讀表數
}
