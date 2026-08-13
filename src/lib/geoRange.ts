/**
 * DCU 歸屬範圍（輔助判讀用）—— 以 DCU 為圓心的一個圓，取代凸包。
 * 只做距離統計，O(n)＋一次排序取中位數；正式的歸屬正確與否以白名單為準。
 * 規則：離群＝距離 > 中位距離 × kMedian；半徑＝其餘電表的最遠距離（留 6% 邊）。
 */

export type LngLat = [number, number]

/** 每緯度 1 度的公尺數（球面近似，範圍尺度下誤差可忽略） */
const M_PER_DEG = 111_320

export interface RangeResult {
  /** 圓半徑（公尺） */
  radiusM: number
  /** 離群點在輸入陣列中的索引（落在圓外者） */
  outliers: number[]
}

/**
 * 由圓心與點集算出範圍半徑與離群點。
 * kMedian 1.9 是對 mock 調出來的：均勻分布幾乎不誤判，跨區收容的電表 100% 落在圓外。
 */
export function meterRange(
  center: LngLat,
  pts: LngLat[],
  { kMedian = 1.9, pad = 1.06, minRadiusM = 60 }: { kMedian?: number; pad?: number; minRadiusM?: number } = {},
): RangeResult {
  if (!pts.length) return { radiusM: minRadiusM, outliers: [] }
  const kx = Math.max(0.2, Math.cos((center[1] * Math.PI) / 180))
  const d = pts.map((p) => Math.hypot((p[0] - center[0]) * kx, p[1] - center[1]) * M_PER_DEG)
  const sorted = d.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const medD = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const cut = medD * kMedian
  const outliers: number[] = []
  let inner = 0
  d.forEach((x, i) => { if (x > cut) outliers.push(i); else if (x > inner) inner = x })
  return { radiusM: Math.max(minRadiusM, inner * pad), outliers }
}

/** 圓 → GeoJSON Polygon 外環（首尾相接）；seg 段數，36 段肉眼已看不出折角 */
export function circleRing(center: LngLat, radiusM: number, seg = 36): LngLat[] {
  const rLat = radiusM / M_PER_DEG
  const rLng = rLat / Math.max(0.2, Math.cos((center[1] * Math.PI) / 180))
  const ring: LngLat[] = []
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2
    ring.push([center[0] + Math.cos(t) * rLng, center[1] + Math.sin(t) * rLat])
  }
  return ring
}
