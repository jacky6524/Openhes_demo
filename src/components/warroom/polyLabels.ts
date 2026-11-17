/**
 * 行政區名標籤的錨點。
 *
 * 不能直接把 symbol 圖層掛在多邊形 source 上：maplibre 對 MultiPolygon 會「每一塊」各放一個
 * 標籤，離島縣市（澎湖、連江…）於是被標成好幾次。改為另建一組「一名一點」的 Point source。
 *
 * 錨點取該名稱最大一塊多邊形的面積加權重心（比 bbox 中心更不容易落在凹形之外）。
 */

interface Ring { pts: number[][] }

function ringsOf(geom: any): number[][][] {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates[0]].filter(Boolean)
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p: number[][][]) => p[0]).filter(Boolean)
  return []
}

/** 多邊形有號面積（正負代表繞向，取絕對值當大小） */
function signedArea(ring: number[][]): number {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** 面積加權重心；退化（面積 0）時回退為頂點平均 */
function centroid(ring: number[][]): [number, number] {
  const a = signedArea(ring)
  if (!a) {
    let sx = 0, sy = 0
    ring.forEach(([x, y]) => { sx += x; sy += y })
    return [sx / ring.length, sy / ring.length]
  }
  let cx = 0, cy = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

/**
 * 由多邊形 FeatureCollection 產生「一個名稱一個點」的標籤 source。
 * nameKey 預設 'name'（故障地圖與關係地圖都已在 properties 補上 name）。
 * 點的 properties 沿用面積最大那塊多邊形的 properties（含 sevColor，供區名依底色配色）。
 */
export function buildLabelPoints(fc: { features: any[] }, nameKey = 'name') {
  const best = new Map<string, { area: number; ring: number[][]; props: any }>()
  for (const f of fc.features) {
    const name = f.properties?.[nameKey]
    if (!name) continue
    for (const ring of ringsOf(f.geometry)) {
      const area = Math.abs(signedArea(ring))
      const cur = best.get(name)
      if (!cur || area > cur.area) best.set(name, { area, ring, props: f.properties })
    }
  }
  return {
    type: 'FeatureCollection' as const,
    features: [...best.entries()].map(([name, { ring, props }]) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: centroid(ring) },
      properties: { ...props, name },
    })),
  }
}
