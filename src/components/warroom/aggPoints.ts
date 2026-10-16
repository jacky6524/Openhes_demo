/**
 * 匯總球的座標計算 —— 兩張地圖（DCU 斷線、電表歸屬）共用同一套邏輯。
 *
 * 聚合單位是**行政層級**（L1 一個縣市一顆、L2 一個行政區一顆），不是地理群聚，
 * 所以縮放不會改變分群。位置取該區成員的平均座標，落在問題實際發生的地方。
 *
 * 平均座標會有一個麻煩：台北市被新北市包住，新北市的平均座標幾乎落在台北市頭上，
 * 兩顆球就疊在一起了。因此聚合後再跑一次簡單的互斥推擠，把靠太近的球分開。
 */

export interface AggPoint {
  name: string
  count: number
  lng: number
  lat: number
}

/** 依 key 聚合成「一個行政單位一顆」，位置為成員平均座標 */
export function aggregateByArea<T>(
  items: T[],
  keyOf: (item: T) => string,
  lngOf: (item: T) => number,
  latOf: (item: T) => number,
): AggPoint[] {
  const groups = new Map<string, { n: number; lng: number; lat: number }>()
  items.forEach((it) => {
    const key = keyOf(it)
    const g = groups.get(key) ?? { n: 0, lng: 0, lat: 0 }
    g.n += 1
    g.lng += lngOf(it)
    g.lat += latOf(it)
    groups.set(key, g)
  })
  return [...groups].map(([name, g]) => ({ name, count: g.n, lng: g.lng / g.n, lat: g.lat / g.n }))
}

/**
 * 互斥推擠：任兩顆球的中心距離小於 `minSepDeg` 就沿連線推開。
 * 迭代幾輪即可收斂（球本來就少，一個層級最多幾十顆）。
 *
 * `minSepDeg` 用「度」而非像素 —— 這兩張圖在同一個層級的取景是固定的
 * （全台固定框、縣市固定框），所以度與像素的比例在同層級內是常數，用度就夠。
 */
export function separateAggPoints(points: AggPoint[], minSepDeg: number, iterations = 40): AggPoint[] {
  if (points.length < 2 || minSepDeg <= 0) return points
  const out = points.map((p) => ({ ...p }))
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        let dx = b.lng - a.lng
        let dy = b.lat - a.lat
        let dist = Math.hypot(dx, dy)
        if (dist >= minSepDeg) continue
        // 完全重合時給一個固定方向，避免除以 0
        if (dist < 1e-9) { dx = 1e-6; dy = 0; dist = 1e-6 }
        const push = (minSepDeg - dist) / 2
        const ux = (dx / dist) * push
        const uy = (dy / dist) * push
        a.lng -= ux; a.lat -= uy
        b.lng += ux; b.lat += uy
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

/** 轉成 GeoJSON（兩張圖的匯總球 source 都吃這個形狀：properties = { name, count }） */
export function toAggFeatureCollection(points: AggPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { name: p.name, count: p.count },
    })),
  }
}

/**
 * 各層級的最小間距（度）。全台框約 2.05° 寬對到 ~880px，
 * 球半徑上限 26px → 兩顆相切約需 56px ≈ 0.13°，取 0.16° 留一點空隙。
 * 縣市層級的框小很多，度／像素比也小，因此間距同步縮小。
 */
export const MIN_SEP_DEG = { taiwan: 0.16, city: 0.035 } as const

/**
 * L2（縣市）匯總球的直徑（px）—— 2026-09-29 業主意見「L2 幾乎看不到區域」：
 * 市區的行政區只有十幾 px 寬，L1 那個尺寸的球會把整片區塊蓋掉，L2 改小一號。
 */
export const AGG_DIAMETER_L2 = 22

/**
 * L2 的最小間距（度）—— 縣市大小差很多（新北 vs 嘉義市），固定的度數在大縣市推不開、
 * 在小縣市又推太遠。改由「該縣市框進畫面後 1px 是幾度」換算，間距固定在球的直徑再多一點。
 * 取景與 fitBounds 同一套（縣市 bbox、padding 50），所以換算結果與畫面一致。
 */
export function citySepDeg(
  bounds: [number, number, number, number],
  container: { clientWidth: number; clientHeight: number } | null,
  diameterPx = AGG_DIAMETER_L2,
  padding = 50,
) {
  const w = (container?.clientWidth ?? 0) - padding * 2
  const h = (container?.clientHeight ?? 0) - padding * 2
  if (w <= 0 || h <= 0) return MIN_SEP_DEG.city
  const [W, S, E, N] = bounds
  // 麥卡托下緯度方向會被拉長 1/cos(lat)，換成同一個尺度再比
  const k = 1 / Math.cos((((S + N) / 2) * Math.PI) / 180)
  const degPerPx = Math.max((E - W) / w, ((N - S) * k) / h)
  return degPerPx * diameterPx * 1.15
}
