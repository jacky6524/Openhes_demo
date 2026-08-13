import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { dcuById, meterById as allMeterById, metersInScope, dcusInScope, type Dcu, type DcuState, type Meter } from '@/data/dcuFleet'
import { dcuRange, dcuStat, misassignedOfDcu } from '@/data/dcuMetrics'
import { townsGeo } from '@/data/geo/geo'
import { addSelectedMeterLayer, setSelectedMeter } from './selectedMeterLayer'
import { registerMap, unregisterMap, pushCamera, pullCamera } from './mapCamera'
import { GROUP_COLORS, DIM_OPACITY, STATE_COLOR, STATE_LABEL, freqColor, pinColor } from './warroomConfig'
import { circleRing, type LngLat } from '@/lib/geoRange'
import { useWarroom } from '@/store/useWarroom'

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
/** 與故障地圖同一組取景常數，兩個頁籤切換時畫面才不會跳 */
const TAIWAN_BOUNDS: [[number, number], [number, number]] = [[120.0, 21.88], [122.05, 25.32]]

function bboxOf(geom: any): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90
  const walk = (c: any) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]) } else c.forEach(walk) }
  walk(geom.coordinates)
  return [w, s, e, n]
}

/** DCU 的「歸屬色」＝其收容電表所用的頻點色（地圖上 DCU／電表／關係線／範圍面同色） */
const affColor = (dcuId: string) => { const d = dcuById.get(dcuId); return d ? freqColor(d.freq) : STATE_COLOR.disabled }

interface DcuRef { dcu: Dcu; cross: boolean; color: string; wrap: HTMLDivElement; shape: HTMLDivElement; marker: maplibregl.Marker }

/**
 * DCU DOM marker builder —— 視覺與 GPU 圓點統一（B1）：一律圓形，
 * 底色＝頻點色（停用＝灰）、紅框＋✕＝斷線、白框＝正常。狀態只有 正常／斷線／停用（A4）。
 */
function dcuElement(state: DcuState, cross: boolean, color: string) {
  const wrap = document.createElement('div')
  wrap.className = 'war-marker'
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer' })
  const shape = document.createElement('div')
  shape.className = 'war-shape'
  Object.assign(shape.style, {
    width: '20px', height: '20px', borderRadius: '9999px',
    background: state === 'disabled' ? STATE_COLOR.disabled : color,
    border: `3px solid ${state === 'offline' ? STATE_COLOR.offline : '#FFFFFF'}`, display: 'grid', placeItems: 'center',
    boxShadow: '0 1px 4px rgba(42,33,37,.35)', outline: cross ? '2px dashed #2A2125' : 'none', outlineOffset: '2px',
  })
  if (state === 'offline') shape.innerHTML = '<span style="color:#fff;font-size:11px;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.45)">✕</span>'
  wrap.appendChild(shape)
  if (cross) {
    const tag = document.createElement('span')
    tag.textContent = '跨區'
    Object.assign(tag.style, { fontSize: '9px', fontWeight: '700', color: '#2A2125', background: '#fff', border: '1px solid #E7DBDD', borderRadius: '4px', padding: '0 3px' })
    wrap.appendChild(tag)
  }
  return { wrap, shape }
}

interface MeterPop { id: string; dcuId: string; freq: number; on: number; color: string; x: number; y: number }
/** DCU hover 卡：序號／編號／地址／頻點／狀態（與故障地圖同一組欄位） */
interface DcuPop { dcu: Dcu; online: number; total: number; readRate: number; mis: number; x: number; y: number }

/**
 * 電表點：默認略弱化（比聚焦小一號）讓 DCU 標記仍是主角，但顏色保持可辨識；
 * 聚焦某台 DCU 時該台放大提亮、無關者淡出。
 */
const METER_RADIUS_SOFT: any = ['interpolate', ['linear'], ['zoom'], 12, 1.7, 14, 2.8, 16, 4.2]
const METER_RADIUS_FOCUS: any = ['interpolate', ['linear'], ['zoom'], 12, 2, 14, 3.4, 16, 5.2]
const METER_OPACITY_SOFT: any = ['case', ['==', ['get', 'on'], 0], 0.45, 0.68]

/** 歸屬錯誤（白名單外收容）的警示色 */
const MIS_COLOR = '#E8862B'

/**
 * DCU 超過這個數量就改用 GPU 圓點（整個縣市約 90–150 台、全台 420 台，
 * DOM marker 到這個量級會拖累拖曳）；單一行政區約 30 台，維持 DOM 方塊保留 ✕／跨區等細節。
 */
const DOM_MARKER_MAX = 60
const EMPTY_FC_DATA = { type: 'FeatureCollection' as const, features: [] as any[] }

/**
 * 電表圖層的最小縮放層級 —— 低於此縮放不載入任何電表點。
 * 百萬級電表時電表只該存在於街道級視野內；這裡先把「縮放層級決定圖層存在與否」這條路鋪好。
 */
const METER_MIN_ZOOM = 13

/** 電表 → GeoJSON（純函式，供地圖事件在元件外重建） */
function meterFeatures(meters: Meter[]) {
  return {
    type: 'FeatureCollection' as const,
    features: meters.map((m) => {
      const d = dcuById.get(m.dcuId)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: { id: m.id, dcuId: m.dcuId, freq: d?.freq ?? 0, on: m.online ? 1 : 0, color: d ? freqColor(d.freq) : STATE_COLOR.disabled },
      }
    }),
  }
}

/** 歸屬範圍圈的顯示時機：關閉 ／ 聚焦時（默認）／ 全部顯示 */
type RangeMode = 'off' | 'focus' | 'all'
const RANGE_MODES: { key: RangeMode; label: string; hint: string }[] = [
  { key: 'off', label: '關閉', hint: '不顯示歸屬範圍' },
  { key: 'focus', label: '聚焦時', hint: '點選或停留在 DCU／電表時，只畫出該 DCU 的歸屬圈；圈內其他頻點的電表維持正常顏色，方便比對' },
  { key: 'all', label: '全部', hint: '同時畫出區內所有 DCU 的歸屬圈（圈相交處即歸屬易跨到鄰近頻點之處）' },
]

export function DcuRelationMap() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const dcuRefs = useRef<Map<string, DcuRef>>(new Map())

  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)
  const pinnedDcuIds = useWarroom((s) => s.pinnedDcuIds)
  const resetNonce = useWarroom((s) => s.resetNonce)
  const refitNonce = useWarroom((s) => s.refitNonce)
  const selectDcu = useWarroom((s) => s.selectDcu)
  const selectMeter = useWarroom((s) => s.selectMeter)
  const active = useWarroom((s) => s.tab) === 'relation' // 目前顯示中的是不是這張
  const activeRef = useRef(active)
  activeRef.current = active

  const [hoverDcu, setHoverDcu] = useState<string | null>(null)
  // A3：右側列表 hover 的 DCU（store 共享）→ 地圖同步高亮
  const listHoverDcu = useWarroom((s) => s.hoverDcuId)
  const [hoverMeter, setHoverMeter] = useState<string | null>(null)
  const [meterPop, setMeterPop] = useState<MeterPop | null>(null)
  const [dcuPop, setDcuPop] = useState<DcuPop | null>(null)
  // 電表圖層是否存在（由縮放層級決定）
  const [metersOn, setMetersOn] = useState(false)
  // 聚焦圈內、屬於別台 DCU 的電表（由 queryRenderedFeatures 算出，只涵蓋畫面上看得到的）
  const [inRange, setInRange] = useState<{ meters: Set<string>; dcus: Set<string> }>({ meters: new Set(), dcus: new Set() })
  // 歸屬範圍顯示時機：一律默認「聚焦時」——沒有聚焦時本來就不畫，所以各層級都適用；
  // 點選/停留在某台 DCU 或電表才畫出該台的歸屬圈
  const [rangeMode, setRangeMode] = useState<RangeMode>('focus')

  // 範圍內「所有」電表 → GPU 圖層，依所屬 DCU 頻點著色（全台＝全部電表）
  const districtMeters = useMemo(() => metersInScope(level, city, district), [level, city, district])
  /**
   * 範圍內「全部」DCU（A4/B5）—— 不再篩「問題 DCU」，狀態一律 正常／斷線／停用。
   * 跨區：DCU 在範圍外、但其收容電表跨界落在範圍內 → 補進來並標示跨區。
   */
  const dcus = useMemo(() => {
    const scoped = dcusInScope(level, city, district)
    const seen = new Set(scoped.map((d) => d.id))
    const out = scoped.map((dcu) => ({ dcu, cross: false }))
    districtMeters.forEach((m) => {
      if (seen.has(m.dcuId)) return
      const d = dcuById.get(m.dcuId)
      if (d) { seen.add(d.id); out.push({ dcu: d, cross: true }) }
    })
    return out
  }, [level, city, district, districtMeters])
  // DCU 太多時（整個縣市／全台）改用 GPU 圓點，避免上百個 DOM marker 拖累拖曳
  const gpuDcus = dcus.length > DOM_MARKER_MAX
  const lookupMeter = (id: string) => allMeterById.get(id) ?? null

  // 電表圖層只在街道級縮放才存在（見 applyMeters）；metersRef 給地圖事件用最新的資料
  const metersRef = useRef<Meter[]>(districtMeters)
  useEffect(() => { metersRef.current = districtMeters })

  /** 組 DCU hover 卡的內容（收容統計向 dcuMetrics 要，有快取） */
  const makeDcuPop = (dcuId: string, x: number, y: number): DcuPop | null => {
    const d = dcuById.get(dcuId)
    if (!d) return null
    const s = dcuStat(dcuId)
    return { dcu: d, online: s.online, total: s.total, readRate: s.readRate, mis: misassignedOfDcu(dcuId).length, x, y }
  }
  const makeDcuPopRef = useRef(makeDcuPop)
  makeDcuPopRef.current = makeDcuPop

  /** DCU GPU 圓點（僅 gpuDcus 模式使用）：底色＝頻點色（停用＝灰），斷線者紅框 —— 與 DOM 圓形標記同一套編碼 */
  const buildDcuPoints = () => ({
    type: 'FeatureCollection' as const,
    features: dcus.map(({ dcu }) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [dcu.lng, dcu.lat] },
      properties: { id: dcu.id, color: dcu.state === 'disabled' ? STATE_COLOR.disabled : freqColor(dcu.freq), off: dcu.state === 'offline' ? 1 : 0 },
    })),
  })

  /* ---- 歸屬範圍圈：以 DCU 為圓心，半徑由收容電表的距離統計得出；圈外電表＝離群 ---- */
  interface Range { dcuId: string; color: string; lng: number; lat: number; radiusM: number; ring: LngLat[] }
  interface Outlier { meterId: string; dcuId: string; lng: number; lat: number; color: string }
  const { ranges, outliers, outlierIds } = useMemo(() => {
    // 半徑／離群一律向 dcuMetrics 要（那層有快取，未來換成 API 欄位時這裡不用動）
    const ids = new Set<string>()
    districtMeters.forEach((m) => ids.add(m.dcuId))
    const ranges: Range[] = []
    const outliers: Outlier[] = []
    ids.forEach((dcuId) => {
      const r = dcuRange(dcuId)
      if (!r) return
      const color = affColor(dcuId)
      r.outliers.forEach((o) => outliers.push({ meterId: o.id, dcuId, lng: o.lng, lat: o.lat, color }))
      ranges.push({ dcuId, color, lng: r.lng, lat: r.lat, radiusM: r.radiusM, ring: circleRing([r.lng, r.lat], r.radiusM) })
    })
    return { ranges, outliers, outlierIds: new Set(outliers.map((o) => o.meterId)) }
  }, [districtMeters])

  /**
   * fo：'on' 聚焦模式下的該台 DCU（實心＋外框）
   *     ／'all-on'、'all-base' 全部模式下的聚焦台與其餘（無外框、更淡，避免整區太雜）。
   * 聚焦時只顯示該 DCU 自己的圈；圈內是否混進其他頻點，改由電表顏色（inRange）判讀。
   * 回傳 null 代表該 DCU 這次不畫。
   */
  const focusKinds = (focusedIds: Set<string>, mode: RangeMode) => {
    if (mode === 'off') return null
    const hasFocus = focusedIds.size > 0
    if (mode === 'focus' && !hasFocus) return null
    return (dcuId: string) => {
      const on = hasFocus && focusedIds.has(dcuId)
      if (mode === 'all') return on ? 'all-on' : 'all-base'
      return on ? 'on' : null
    }
  }

  const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as any[] }

  const buildRangeData = (focusedIds: Set<string>, mode: RangeMode) => {
    const kind = focusKinds(focusedIds, mode)
    if (!kind) return EMPTY_FC
    const feats = ranges
      .map((r) => ({ r, fo: kind(r.dcuId) }))
      .filter((x): x is { r: Range; fo: string } => x.fo !== null)
      .map(({ r, fo }) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [r.ring] },
        properties: { dcuId: r.dcuId, color: r.color, fo },
      }))
    const lift = (fo: string) => (fo === 'on' || fo === 'all-on' ? 1 : 0) // 聚焦者畫在最上層
    feats.sort((a, b) => lift(a.properties.fo) - lift(b.properties.fo))
    return { type: 'FeatureCollection' as const, features: feats }
  }

  /** 離群電表標記：跟著歸屬圈的顯示規則走（圈看得到，它的離群點才標） */
  const buildOutlierData = (focusedIds: Set<string>, mode: RangeMode) => {
    const kind = focusKinds(focusedIds, mode)
    if (!kind) return EMPTY_FC
    return {
      type: 'FeatureCollection' as const,
      features: outliers
        .map((o) => ({ o, fo: kind(o.dcuId) }))
        .filter((x): x is { o: Outlier; fo: string } => x.fo !== null)
        .map(({ o, fo }) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [o.lng, o.lat] },
          properties: { id: o.meterId, dcuId: o.dcuId, color: o.color, fo },
        })),
    }
  }

  /* ---- init map ---- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE, center: [121.5715, 25.0325], zoom: 13.2,
      attributionControl: { compact: true }, dragRotate: false,
    })
    // 右上角讓給地圖頁籤，縮放控制移到右下
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    map.on('load', () => {
      // 歸屬範圍圈（最底層）：同色半透明；初始為空，由下方 effect 依模式/聚焦供資料
      map.addSource('rel-ranges', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'rel-range-fill', type: 'fill', source: 'rel-ranges',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['match', ['get', 'fo'], 'on', 0.24, 'all-on', 0.192, 0.072],
        },
      })
      map.addLayer({
        id: 'rel-range-line', type: 'line', source: 'rel-ranges',
        paint: {
          'line-color': ['get', 'color'],
          // 全部模式（all-*）不畫外框，只留淡淡的色塊
          'line-opacity': ['match', ['get', 'fo'], 'on', 0.9, 0],
          'line-width': ['match', ['get', 'fo'], 'on', 2, 0],
        },
        layout: { 'line-join': 'round' },
      })

      // 電表 GPU 圖層（所有電表，依所屬 DCU 頻點色；斷線者加紅圈）
      // promoteId：讓「落在聚焦圈內的其他頻點電表」可用 feature-state 點亮，免整層重建資料
      map.addSource('rel-meters', { type: 'geojson', data: EMPTY_FC_DATA as any, promoteId: 'id' })
      map.addLayer({
        id: 'rel-meter-dots', type: 'circle', source: 'rel-meters',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': METER_RADIUS_SOFT,
          'circle-opacity': METER_OPACITY_SOFT,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 0,
        },
      })
      // 離群電表標記（最上層）：深色圈 + 白描邊，與斷線紅圈區隔
      map.addSource('rel-outliers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const outlierRadius: any = ['interpolate', ['linear'], ['zoom'], 12, 5, 14, 7, 16, 9.5]
      const outlierOpacity: any = ['match', ['get', 'fo'], 'on', 1, 'all-on', 1, 0.7]
      map.addLayer({
        id: 'rel-outlier-halo', type: 'circle', source: 'rel-outliers',
        paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': outlierRadius, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3, 'circle-stroke-opacity': outlierOpacity },
      })
      map.addLayer({
        id: 'rel-outlier-ring', type: 'circle', source: 'rel-outliers',
        paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': outlierRadius, 'circle-stroke-color': '#2A2125', 'circle-stroke-width': 1.6, 'circle-stroke-opacity': outlierOpacity },
      })

      // 歸屬錯誤（白名單外收容）：警示點＋指向線，選取 DCU 時顯示；不受電表縮放門檻限制，
      // 供裝置設定除錯時任何縮放都看得見「應屬哪台、實際跑去哪」
      map.addSource('rel-mis', { type: 'geojson', data: EMPTY_FC_DATA })
      map.addLayer({
        id: 'rel-mis-line-actual', type: 'line', source: 'rel-mis',
        filter: ['==', ['get', 'kind'], 'actual'],
        paint: { 'line-color': MIS_COLOR, 'line-width': 1.8, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round' },
      })
      map.addLayer({
        id: 'rel-mis-line-expected', type: 'line', source: 'rel-mis',
        filter: ['==', ['get', 'kind'], 'expected'],
        paint: { 'line-color': '#5B4E52', 'line-width': 1.6, 'line-opacity': 0.85, 'line-dasharray': [2, 2] },
        layout: { 'line-cap': 'round' },
      })
      map.addLayer({
        id: 'rel-mis-dot', type: 'circle', source: 'rel-mis',
        filter: ['==', ['get', 'kind'], 'meter'],
        paint: {
          'circle-color': MIS_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 14, 6.5, 16, 8.5],
          'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2,
        },
      })
      map.on('mousemove', 'rel-mis-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'rel-mis-dot', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'rel-mis-dot', (e) => { const f = e.features?.[0]; if (f) selectMeter(f.properties!.id) })

      // DCU GPU 圓點（最上層；DCU 數量大時取代 DOM marker）
      map.addSource('rel-dcus', { type: 'geojson', data: EMPTY_FC_DATA })
      map.addLayer({
        id: 'rel-dcu-dots', type: 'circle', source: 'rel-dcus',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2.6, 10, 4, 13, 6, 16, 9],
          'circle-stroke-width': ['case', ['==', ['get', 'off'], 1], 2.2, 1.4],
          'circle-stroke-color': ['case', ['==', ['get', 'off'], 1], STATE_COLOR.offline, '#FFFFFF'],
        },
      })
      // 選取電表的強化標記（最上層，任何縮放都在）
      addSelectedMeterLayer(map)

      map.on('mousemove', 'rel-dcu-dots', (e) => {
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        const id = f.properties!.id as string
        setHoverDcu(id); setDcuPop(makeDcuPopRef.current(id, e.point.x, e.point.y))
      })
      map.on('mouseleave', 'rel-dcu-dots', () => { map.getCanvas().style.cursor = ''; setHoverDcu(null); setDcuPop(null) })
      map.on('click', 'rel-dcu-dots', (e) => { const f = e.features?.[0]; if (f) selectDcu(f.properties!.id) })

      registerMap('relation', map)
      readyRef.current = true
      buildMarkers()
      // 全台進場時 fitBounds 會把縮放拉到 z7，先建 33k 個點再清掉是白工 → 交給 moveend
      if (level !== 'taiwan') applyMeters(true)
      fitScope()

      // 縮放/平移結束 → 決定電表圖層是否存在、重算圈內比對（兩者都只看可視範圍）、同步鏡頭
      map.on('moveend', () => {
        applyMeters()
        computeInRangeRef.current()
        // 顯示中的那張移動結束 → 把隱藏的那張一起帶過去
        if (activeRef.current) pushCamera('relation')
      })

      // 電表 hover / click（GPU 圖層）
      map.on('mousemove', 'rel-meter-dots', (e) => {
        const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'
        const p = f.properties!
        setHoverMeter(p.id); setMeterPop({ id: p.id, dcuId: p.dcuId, freq: p.freq, on: p.on, color: p.color, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'rel-meter-dots', () => { map.getCanvas().style.cursor = ''; setHoverMeter(null); setMeterPop(null) })
      map.on('click', 'rel-meter-dots', (e) => { const f = e.features?.[0]; if (!f) return; selectMeter(f.properties!.id) })
      // 點空白處（A5）→ 只取消電表選取；DCU 選取與展開的電表列表保留，收合走列表的 ← 鈕
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['rel-meter-dots', 'rel-dcu-dots', 'rel-mis-dot'] })
        if (hits.length) return
        const st = useWarroom.getState()
        if (st.selectedMeterId) st.selectMeter(null)
      })
    })
    return () => { unregisterMap('relation'); map.remove(); mapRef.current = null; readyRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 電表圖層依縮放層級存在與否：z < METER_MIN_ZOOM 直接把 source 清空，
   * 低縮放層級不持有任何電表 feature（百萬級時這是唯一守得住的做法）。
   */
  const meterLayerOnRef = useRef(false)
  const applyMeters = (dataChanged = false) => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('rel-meters') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const on = map.getZoom() >= METER_MIN_ZOOM
    if (on) {
      // B3：縮放門檻擋層級、bbox（外擴 25%）擋視窗 —— 只建可視範圍內的電表 feature。
      // 百萬級時這段 filter 換成 bbox API 查詢，其餘不動。
      const b = map.getBounds()
      const mx = (b.getEast() - b.getWest()) * 0.25, my = (b.getNorth() - b.getSouth()) * 0.25
      const W = b.getWest() - mx, E = b.getEast() + mx, S = b.getSouth() - my, N = b.getNorth() + my
      src.setData(meterFeatures(metersRef.current.filter((m) => m.lng >= W && m.lng <= E && m.lat >= S && m.lat <= N)) as any)
      // setData 後補回聚焦圈內電表的 lit 狀態（feature-state 依實作可能被清）
      litRef.current.forEach((id) => map.setFeatureState({ source: 'rel-meters', id }, { lit: true }))
    } else if (meterLayerOnRef.current || dataChanged) {
      src.setData(EMPTY_FC_DATA as any)
    }
    if (on !== meterLayerOnRef.current) { meterLayerOnRef.current = on; setMetersOn(on) }
  }

  const clearMarkers = () => { dcuRefs.current.forEach((r) => r.marker.remove()); dcuRefs.current.clear() }

  const buildMarkers = () => {
    const map = mapRef.current
    if (!map) return
    clearMarkers()
    ;(map.getSource('rel-dcus') as maplibregl.GeoJSONSource | undefined)?.setData((gpuDcus ? buildDcuPoints() : EMPTY_FC_DATA) as any)
    if (gpuDcus) return // 整個縣市／全台等大範圍：DCU 走 GPU 圖層，不建 DOM marker
    dcus.forEach(({ dcu, cross }) => {
      const color = freqColor(dcu.freq)
      const { wrap, shape } = dcuElement(dcu.state, cross, color)
      wrap.addEventListener('mouseenter', () => {
        setHoverDcu(dcu.id)
        const p = map.project([dcu.lng, dcu.lat])
        setDcuPop(makeDcuPopRef.current(dcu.id, p.x, p.y))
      })
      wrap.addEventListener('mouseleave', () => { setHoverDcu(null); setDcuPop(null) })
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); selectDcu(dcu.id) })
      const marker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([dcu.lng, dcu.lat]).addTo(map)
      dcuRefs.current.set(dcu.id, { dcu, cross, color, wrap, shape, marker })
    })
  }

  /**
   * 與故障地圖同一套範圍邏輯：全台 → 台灣框；縣市（全部行政區）→ 該縣市所有行政區界；
   * 單一行政區 → 該區界。以行政區界為準（而非裝置點範圍），兩個頁籤切換時取景才會一致。
   */
  const fitScope = () => {
    const map = mapRef.current
    if (!map) return
    // 非顯示中的那張不自行取景 —— 鏡頭一律由顯示中的那張決定，切過來時再對齊
    if (!activeRef.current) return
    if (level === 'taiwan') { map.fitBounds(TAIWAN_BOUNDS, { padding: 20, duration: 600 }); return }
    const feats = townsGeo(city).features.filter((f: any) => !district || f.properties.rname === district)
    if (feats.length) {
      let W = 180, S = 90, E = -180, N = -90
      feats.forEach((f: any) => { const [w, s, e, n] = bboxOf(f.geometry); W = Math.min(W, w); S = Math.min(S, s); E = Math.max(E, e); N = Math.max(N, n) })
      map.fitBounds([[W, S], [E, N]], { padding: district ? 60 : 50, duration: 700 })
      return
    }
    // 沒有對應行政區界時退回裝置點範圍
    const pts = [...districtMeters.map((m) => [m.lng, m.lat]), ...dcus.map(({ dcu }) => [dcu.lng, dcu.lat])]
    if (!pts.length) return
    let W = 180, S = 90, E = -180, N = -90
    pts.forEach(([x, y]) => { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y) })
    map.fitBounds([[W, S], [E, N]], { padding: 60, maxZoom: 15.5, duration: 600 })
  }

  // district（資料）變更 → 重建電表圖層 + 標記 + fit
  useEffect(() => {
    if (!readyRef.current) return
    applyMeters(true)
    buildMarkers(); fitScope() // 歸屬圈由下方 focus/ranges effect 一併更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcus, districtMeters])

  // 切換成顯示中的那張 → 對齊另一張的鏡頭（並重算尺寸、補上電表圖層）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !active) return
    map.resize()
    if (!pullCamera('relation')) fitScope() // 沒有另一張可參照才自行取景
    applyMeters()
    computeInRangeRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => { if (readyRef.current) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetNonce])
  useEffect(() => { if (readyRef.current) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refitNonce])

  // 清單/選取 DCU → 取景至該 DCU 的歸屬圈（A2：落點畫面＝這台的地盤＋一點邊，不做固定倍率跳躍）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !activeRef.current || !selectedDcuId) return
    const r = dcuRange(selectedDcuId)
    if (r) {
      const kx = Math.max(0.2, Math.cos((r.lat * Math.PI) / 180))
      const dLat = (r.radiusM * 1.25) / 111_320
      const dLng = (r.radiusM * 1.25) / (111_320 * kx)
      map.fitBounds([[r.lng - dLng, r.lat - dLat], [r.lng + dLng, r.lat + dLat]], { padding: 30, maxZoom: 16.5, duration: 600 })
    } else {
      const d = dcuById.get(selectedDcuId)
      if (d) map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDcuId])
  // 清單/選取電表 → 縮放至該電表並打上強化標記
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    const m = selectedMeterId ? lookupMeter(selectedMeterId) : null
    setSelectedMeter(map, m)
    if (m && activeRef.current) map.easeTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterId])

  /* ---- focus model（用於 DCU 標記高亮與歸屬範圍顯示） ---- */
  const focus = useMemo(() => {
    const groupColor = new Map<string, string>()
    pinnedDcuIds.forEach((id, i) => groupColor.set(id, GROUP_COLORS[i % GROUP_COLORS.length]))
    const transient =
      selectedDcuId ??
      hoverDcu ??
      listHoverDcu ??
      (selectedMeterId ? lookupMeter(selectedMeterId)?.dcuId : null) ??
      (hoverMeter ? lookupMeter(hoverMeter)?.dcuId : null) ?? null
    if (transient && !groupColor.has(transient)) groupColor.set(transient, GROUP_COLORS[0])
    const focusedDcu = new Set(groupColor.keys())
    return { groupColor, focusedDcu, transient, any: focusedDcu.size > 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedDcuIds, selectedDcuId, hoverDcu, listHoverDcu, selectedMeterId, hoverMeter])

  /**
   * 聚焦時落在「聚焦 DCU 歸屬圈內、卻屬於別台 DCU」的電表 —— 這些要維持正常顏色，
   * 才看得出圈內混進了哪些頻點；它們的 DCU 標記也一併保持可辨識。
   *
   * 用 queryRenderedFeatures 對圈的螢幕 bbox 查詢：成本只跟「畫面上看得到幾顆」有關，
   * 與資料總量無關（原本是遍歷整份電表陣列，百萬級時每次 hover 會多花數毫秒）。
   */
  const computeInRange = () => {
    const map = mapRef.current
    const empty = { meters: new Set<string>(), dcus: new Set<string>() }
    if (!map || !readyRef.current || rangeMode === 'off' || !focus.any) return setInRange(empty)
    const centers = ranges.filter((r) => focus.focusedDcu.has(r.dcuId))
    if (!centers.length) return setInRange(empty)
    const meters = new Set<string>()
    const dcus = new Set<string>()
    centers.forEach((c) => {
      const o = map.project([c.lng, c.lat])
      const edge = map.project([c.lng + c.radiusM / (111_320 * Math.max(0.2, Math.cos((c.lat * Math.PI) / 180))), c.lat])
      const rPx = Math.abs(edge.x - o.x)
      if (rPx < 2) return // 縮太遠，圈只有幾個像素，沒有比對意義
      const hits = map.queryRenderedFeatures(
        [[o.x - rPx, o.y - rPx], [o.x + rPx, o.y + rPx]] as any,
        { layers: ['rel-meter-dots'] },
      )
      hits.forEach((f) => {
        const id = f.properties?.id as string
        const dcuId = f.properties?.dcuId as string
        if (!id || meters.has(id) || focus.focusedDcu.has(dcuId)) return
        const g = f.geometry as any
        const p = map.project(g.coordinates)
        if (Math.hypot(p.x - o.x, p.y - o.y) <= rPx) { meters.add(id); dcus.add(dcuId) }
      })
    })
    setInRange({ meters, dcus })
  }
  const computeInRangeRef = useRef(computeInRange)
  useEffect(() => { computeInRangeRef.current = computeInRange })
  useEffect(() => { computeInRange() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [focus, ranges, rangeMode, metersOn])

  /* ---- 以 feature-state 點亮圈內的其他頻點電表（只動異動的那幾顆，不重建整層） ---- */
  const litRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    litRef.current.forEach((id) => { if (!inRange.meters.has(id)) map.removeFeatureState({ source: 'rel-meters', id }, 'lit') })
    inRange.meters.forEach((id) => { if (!litRef.current.has(id)) map.setFeatureState({ source: 'rel-meters', id }, { lit: true }) })
    litRef.current = new Set(inRange.meters)
  }, [inRange])

  /* ---- apply DCU marker styles（底色維持歸屬色；群組以外圈環、斷線以紅框表示） ---- */
  useEffect(() => {
    dcuRefs.current.forEach((r, id) => {
      const ring = pinColor(pinnedDcuIds, id) // 群組環只給「釘選」的 DCU，避免蓋掉歸屬色
      const focused = focus.focusedDcu.has(id)
      const selected = id === selectedDcuId
      // 圈內混進來的電表其所屬 DCU 不全暗，方便追這些電表是誰家的
      r.wrap.style.opacity = !focus.any || focused ? '1' : inRange.dcus.has(id) ? '0.75' : String(DIM_OPACITY)
      r.wrap.style.zIndex = focus.focusedDcu.has(id) ? '5' : '1'
      r.shape.style.borderColor = r.dcu.state === 'offline' ? STATE_COLOR.offline : '#FFFFFF'
      r.shape.style.boxShadow = selected
        ? `0 0 0 2px #fff, 0 0 0 4px ${ring ?? r.color}, 0 2px 8px rgba(42,33,37,.4)`
        : ring
          ? `0 0 0 2.5px ${ring}, 0 1px 4px rgba(42,33,37,.35)`
          : '0 1px 4px rgba(42,33,37,.35)'
      r.shape.style.transform = selected ? 'scale(1.15)' : 'scale(1)'
    })
  }, [focus, selectedDcuId, pinnedDcuIds, inRange])

  /* ---- 歸屬錯誤（白名單外收容）：選取 DCU → 警示點＋兩條指向線（實線=實際收容、虛線=白名單應屬） ---- */
  const misassigned = useMemo(() => (selectedDcuId ? misassignedOfDcu(selectedDcuId) : []), [selectedDcuId])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('rel-mis') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const feats: any[] = []
    misassigned.forEach((m) => {
      const actual = dcuById.get(m.dcuId)
      const expected = dcuById.get(m.expectedDcuId)
      if (actual) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[m.lng, m.lat], [actual.lng, actual.lat]] }, properties: { kind: 'actual' } })
      if (expected) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[m.lng, m.lat], [expected.lng, expected.lat]] }, properties: { kind: 'expected' } })
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.lng, m.lat] }, properties: { kind: 'meter', id: m.id } })
    })
    src.setData({ type: 'FeatureCollection', features: feats } as any)
  }, [misassigned])

  /* ---- 歸屬圈 / 電表隨聚焦淡出（聚焦 DCU 的歸屬圈浮出） ---- */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const ids = [...focus.focusedDcu]
    ;(map.getSource('rel-ranges') as maplibregl.GeoJSONSource | undefined)?.setData(buildRangeData(focus.focusedDcu, rangeMode) as any)
    ;(map.getSource('rel-outliers') as maplibregl.GeoJSONSource | undefined)?.setData(buildOutlierData(focus.focusedDcu, rangeMode) as any)
    if (ids.length) {
      // 聚焦：該 DCU 的電表放大提亮；圈內其他頻點次之；圈外無關者壓到最低
      map.setPaintProperty('rel-meter-dots', 'circle-opacity',
        ['case',
          ['boolean', ['feature-state', 'lit'], false], ['case', ['==', ['get', 'on'], 0], 0.5, 0.85],
          ['match', ['get', 'dcuId'], ids, ['case', ['==', ['get', 'on'], 0], 0.6, 0.95], 0.1],
        ] as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_FOCUS as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', ['case', ['==', ['get', 'on'], 0], 0, 0.6] as any)
      // GPU 模式的 DCU 圓點：非聚焦者淡出（圈內混進來的其他頻點 DCU 保留可辨識度）
      const near = [...inRange.dcus]
      const dcuOp: any = ['case',
        ['match', ['get', 'id'], ids, true, false], 1,
        near.length ? ['match', ['get', 'id'], near, true, false] : false, 0.7,
        DIM_OPACITY]
      map.setPaintProperty('rel-dcu-dots', 'circle-opacity', dcuOp)
      map.setPaintProperty('rel-dcu-dots', 'circle-stroke-opacity', dcuOp)
    } else {
      // 默認：小而淡，地圖以 DCU 為主角
      map.setPaintProperty('rel-meter-dots', 'circle-opacity', METER_OPACITY_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', 0 as any)
      map.setPaintProperty('rel-dcu-dots', 'circle-opacity', 1 as any)
      map.setPaintProperty('rel-dcu-dots', 'circle-stroke-opacity', 1 as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, ranges, rangeMode, inRange])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <RangeModeSwitch mode={rangeMode} onChange={setRangeMode} metersOn={metersOn} />
      {dcuPop && (
        <div className="pointer-events-none absolute z-30 w-[236px] rounded-lg bg-surface border border-border shadow-card p-3" style={{ left: dcuPop.x + 14, top: dcuPop.y + 12 }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[13px] font-semibold text-ink">{dcuPop.dcu.id}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: dcuPop.dcu.state === 'offline' ? STATE_COLOR.offline : dcuPop.dcu.state === 'disabled' ? STATE_COLOR.disabled : '#2A2125' }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: dcuPop.dcu.state === 'offline' ? STATE_COLOR.offline : dcuPop.dcu.state === 'disabled' ? STATE_COLOR.disabled : freqColor(dcuPop.dcu.freq) }} />
              {STATE_LABEL[dcuPop.dcu.state]}
            </span>
          </div>
          <MRow k="序號" v={dcuPop.dcu.serial} />
          <MRow k="編號" v={dcuPop.dcu.code} />
          <MRow k="地址" v={dcuPop.dcu.address} wrap />
          <MRow k="頻點" v={`第 ${dcuPop.dcu.freq} 頻點`} />
          <div className="mt-1 pt-1 border-t border-divider">
            <MRow k="收容電表" v={`${dcuPop.online} / ${dcuPop.total}`} />
            <MRow k="讀表率" v={`${dcuPop.readRate.toFixed(1)}%`} />
          </div>
          {dcuPop.mis > 0 && (
            <div className="mt-1.5 rounded-[4px] px-1.5 py-1 text-[11px] font-semibold" style={{ background: '#FDF1E4', color: MIS_COLOR }}>
              歸屬錯誤電表 {dcuPop.mis} 顆
            </div>
          )}
        </div>
      )}
      {meterPop && (
        <div className="pointer-events-none absolute z-30 w-[196px] rounded-lg bg-surface border border-border shadow-card p-3" style={{ left: meterPop.x + 14, top: meterPop.y + 12 }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[12.5px] font-semibold text-ink">{meterPop.id}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: meterPop.on ? '#2A2125' : STATE_COLOR.offline }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: meterPop.color, outline: meterPop.on ? 'none' : `1.5px solid ${STATE_COLOR.offline}`, outlineOffset: '1px' }} />
              {meterPop.on ? '連線' : '斷線'}
            </span>
          </div>
          <MRow k="收容 DCU" v={meterPop.dcuId} />
          <MRow k="頻點" v={`第 ${meterPop.freq} 頻點`} />
          {(() => { const wl = lookupMeter(meterPop.id)?.expectedDcuId; return wl && wl !== meterPop.dcuId ? (
            <div className="mt-1.5 rounded-[4px] px-1.5 py-1 text-[11px] font-semibold" style={{ background: '#FDF1E4', color: MIS_COLOR }}>
              歸屬錯誤：白名單應屬 {wl}
            </div>
          ) : null })()}
          {outlierIds.has(meterPop.id) && (
            <div className="mt-1.5 rounded-[4px] bg-bg border border-border px-1.5 py-1 text-[11px] text-ink-sub">
              <span className="font-semibold text-ink">離群電表</span>：落在該 DCU 歸屬圈外，僅供輔助判讀
            </div>
          )}
        </div>
      )}
    </div>
  )
}
/* ---- 歸屬範圍顯示模式切換（地圖左上） ---- */
function RangeModeSwitch({ mode, onChange, metersOn }: { mode: RangeMode; onChange: (m: RangeMode) => void; metersOn: boolean }) {
  return (
    <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5 rounded-lg bg-surface/92 backdrop-blur border border-border shadow-card px-2 py-1.5">
        <span className="text-[11px] text-ink-sub">歸屬範圍</span>
        <span className="flex rounded-md border border-border overflow-hidden">
          {RANGE_MODES.map((m) => (
            <button
              key={m.key}
              title={m.hint}
              onClick={() => onChange(m.key)}
              className={`px-2 py-[3px] text-[11px] font-medium transition-colors ${
                mode === m.key ? 'bg-ink text-white' : 'bg-surface text-ink-sub hover:bg-bg'
              }`}
            >
              {m.label}
            </button>
          ))}
        </span>
      </div>
      {!metersOn && (
        <span
          className="rounded-md bg-surface/92 backdrop-blur border border-border shadow-card px-2 py-1 text-[11px] text-ink-mut"
          title={`低於 z${METER_MIN_ZOOM} 不載入電表點，避免大範圍持有大量電表資料`}
        >
          放大以顯示電表
        </span>
      )}
    </div>
  )
}

function MRow({ k, v, wrap }: { k: string; v: string; wrap?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[12px] py-0.5">
      <span className="text-ink-sub shrink-0">{k}</span>
      <span className={`font-medium text-ink text-right ${wrap ? '' : 'font-mono whitespace-nowrap'}`}>{v}</span>
    </div>
  )
}
