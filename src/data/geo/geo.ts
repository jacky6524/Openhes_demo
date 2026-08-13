import type { RegionNode } from '@/types'
import countiesRaw from './tw-counties.geo.json'
import townsRaw from './tw-towns.geo.json'

/* ============================================================
   Geo layers (map drills L1 → L2 → L3, stops at 行政區)
   L2 縣市     — real boundaries (tw-counties, g0v 2010 simplified)
   L3 鄉鎮市區 — real boundaries (MOI TOWN_MOI_1140318, 2025-03-18); this is the
                 deepest layer — no 村里 level.
   ============================================================ */

export interface GeoFeature {
  type: 'Feature'
  properties: Record<string, any> & { rid?: string; rname?: string }
  geometry: any
}
export interface GeoCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

/* ---- winding normaliser ----
   d3-geo (spherical) reads an exterior ring as enclosing whichever side is on
   its LEFT, so exterior rings MUST be clockwise; otherwise the polygon balloons
   to cover the globe. Rewind every ring: exterior CW, holes CCW. */
function ringArea(r: number[][]): number {
  let a = 0
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return a / 2
}
function fixRing(ring: number[][], wantCCW: boolean) {
  if (ringArea(ring) > 0 !== wantCCW) ring.reverse()
}
function fixPolygon(poly: number[][][]) {
  poly.forEach((ring, i) => fixRing(ring, i !== 0)) // exterior CW, holes CCW
}
function normalizeWinding<T extends GeoCollection>(fc: T): T {
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') fixPolygon(g.coordinates)
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(fixPolygon)
  }
  return fc
}

/* ============================================================
   L1 — counties
   ============================================================ */
const counties = normalizeWinding(countiesRaw as unknown as GeoCollection)

export function countiesGeo(countyNodes: RegionNode[]): GeoCollection {
  const byGeoKey = new Map(countyNodes.map((n) => [n.geoKey, n]))
  const features = counties.features
    .map((f) => {
      const name = f.properties.name ?? f.properties.COUNTYNAME
      const node = byGeoKey.get(name)
      if (!node) return null
      return { ...f, properties: { ...f.properties, rid: node.id, rname: node.name } }
    })
    .filter(Boolean) as GeoFeature[]
  return { type: 'FeatureCollection', features }
}

/* ============================================================
   L3 — townships (鄉鎮市區), indexed by county + TOWNCODE
   ============================================================ */
const normCounty = (s: string) => s.replace(/臺/g, '台') // MOI 臺 → our 台

/* ---- 郵遞區號 3 碼合併 ----
   L1~L3 層級以郵遞區號 3 碼切分。部分縣轄市（如嘉義市東區/西區）郵遞區號相同
   (600)，此情況不再切分為兩個可選單位：保留圖示上的地理分割線（仍為兩個
   polygon，邊界照畫），但視為單一 rid，資料合計、L2 無法單獨點選，L3 表頭顯示
   合併名稱「東區＋西區」。
   TODO: 正式版請以 API 的 post_code 欄位動態產生合併群組，而非前端寫死。 */
const POSTCODE_MERGE: { id: string; name: string; codes: string[] }[] = [
  { id: 'CYI-600', name: '東區＋西區', codes: ['10020010', '10020020'] }, // 嘉義市 600
]
const mergeByCode = new Map<string, (typeof POSTCODE_MERGE)[number]>()
POSTCODE_MERGE.forEach((g) => g.codes.forEach((c) => mergeByCode.set(c, g)))

const towns = normalizeWinding(townsRaw as unknown as GeoCollection)
const townsByCounty = new Map<string, GeoFeature[]>()
const townsByRid = new Map<string, GeoFeature[]>() // rid → features (合併群組會有多筆)
for (const f of towns.features) {
  const code = f.properties.TOWNCODE as string
  const name = f.properties.TOWNNAME as string
  const cty = normCounty(f.properties.COUNTYNAME as string)
  const g = mergeByCode.get(code)
  const rid = g ? g.id : code
  const rname = g ? g.name : name
  const tagged: GeoFeature = { ...f, properties: { ...f.properties, rid, rname } }
  if (!townsByCounty.has(cty)) townsByCounty.set(cty, [])
  townsByCounty.get(cty)!.push(tagged)
  if (!townsByRid.has(rid)) townsByRid.set(rid, [])
  townsByRid.get(rid)!.push(tagged)
}

/** single county FeatureCollection by region id — used by the 金門/馬祖 insets */
export function countyGeoById(countyNodes: RegionNode[], id: string): GeoCollection {
  return {
    type: 'FeatureCollection',
    features: countiesGeo(countyNodes).features.filter((f) => f.properties.rid === id),
  }
}

/** real township roster for a county (drives the region tree's L3 nodes).
    合併群組（同郵遞區號 3 碼）只回傳一筆，避免 L2 出現可單獨點選的東區/西區。 */
export function townRoster(countyName: string): { code: string; name: string }[] {
  const feats = townsByCounty.get(countyName) ?? []
  const seen = new Set<string>()
  const out: { code: string; name: string }[] = []
  for (const f of feats) {
    const rid = f.properties.rid as string
    if (seen.has(rid)) continue
    seen.add(rid)
    out.push({ code: rid, name: f.properties.rname as string })
  }
  return out
}

/** township FeatureCollection for a county (tagged rid=TOWNCODE) */
function townsFC(countyName: string): GeoCollection {
  return { type: 'FeatureCollection', features: townsByCounty.get(countyName) ?? [] }
}

/** public: township (行政區) boundaries for a county — DCU 戰情室故障地圖用 */
export function townsGeo(countyName: string): GeoCollection {
  return townsFC(countyName)
}

/** public: 全台縣市邊界（tag properties.name＝縣市名）— DCU 戰情室全台層級用 */
export function countiesGeoAll(): GeoCollection {
  return {
    type: 'FeatureCollection',
    features: counties.features.map((f) => {
      const name = (f.properties.name ?? f.properties.COUNTYNAME) as string
      return { ...f, properties: { ...f.properties, name } }
    }),
  }
}

/* ============================================================
   Public: geographies + projection-fit target per drill node
   ============================================================ */

/* 金門(KMN)/馬祖(連江 LJU) 距台灣本島甚遠，若畫在主圖會被投影裁掉或拉遠本島，
   改以左側獨立 inset 小圖呈現 (見 IslandInset)，故主圖 L1 排除這兩者。 */
export const INSET_COUNTY_IDS = ['LJU', 'KMN'] as const // 馬祖(連江) / 金門
const INSET_SET = new Set<string>(INSET_COUNTY_IDS)

/** the FeatureCollection rendered at a given drill node.
    L1/L2 render their children's areas; L3 行政區 is the leaf and renders in
    ISOLATION — only the drilled district is shown (其他行政區隱藏), with the
    DCU detail drawer open alongside. */
export function geoForNode(node: RegionNode, countyNodes: RegionNode[]): GeoCollection {
  if (node.id === 'TW') {
    return {
      type: 'FeatureCollection',
      features: countiesGeo(countyNodes).features.filter((f) => !INSET_SET.has(f.properties.rid as string)),
    }
  }
  if (node.level === 'L2') return townsFC(node.name) // county → real townships
  if (node.level === 'L3') {
    // 合併群組回傳多筆 polygon（保留地理分割線）
    const feats = townsByRid.get(node.id) ?? []
    return { type: 'FeatureCollection', features: feats }
  }
  return { type: 'FeatureCollection', features: [] }
}

/* ---- projection-fit focus ----
   Some 行政區 features are MultiPolygons whose tiny outlying islets (e.g.
   基隆市中正區 → 彭佳嶼) sit far offshore and drag fitExtent out to sea,
   shrinking the county to a corner. For the FIT TARGET ONLY we drop, per
   feature, polygons smaller than 10% of that feature's largest polygon.
   Rendering / click targets still use the full geometry. */
function focusFeature(f: GeoFeature): GeoFeature {
  const g = f.geometry
  if (!g || g.type !== 'MultiPolygon') return f
  const areas = g.coordinates.map((poly: number[][][]) => Math.abs(ringArea(poly[0])))
  const maxA = Math.max(...areas)
  const kept = g.coordinates.filter((_: unknown, i: number) => areas[i] >= maxA * 0.1)
  if (kept.length === g.coordinates.length) return f
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: kept } }
}
function focusFC(fc: GeoCollection): GeoCollection {
  return { type: 'FeatureCollection', features: fc.features.map(focusFeature) }
}

/** geography used to fit/lock the projection at a given node */
export function fitTargetGeo(node: RegionNode, countyNodes: RegionNode[]): GeoCollection {
  if (node.id === 'TW') {
    // converge on the main island (+Penghu); Kinmen(KMN)/Matsu(LJU) sit on the
    // China coast and would drag in mainland & empty sea (§1, §8) → excluded.
    const EXCLUDE = new Set(['KMN', 'LJU'])
    return {
      type: 'FeatureCollection',
      features: countiesGeo(countyNodes).features.filter((f) => !EXCLUDE.has(f.properties.rid as string)),
    }
  }
  if (node.level === 'L2') return focusFC(townsFC(node.name)) // frame the county's townships
  return focusFC(geoForNode(node, countyNodes))
}
