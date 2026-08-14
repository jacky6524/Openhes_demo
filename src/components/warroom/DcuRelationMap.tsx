import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  dcuById, meterById as allMeterById, metersInScope, dcusInScope,
  MISASSIGNED_METERS, misassignedInCity, CITIES,
  type Dcu, type DcuState, type Meter,
} from '@/data/dcuFleet'
import { dcuStat, misassignedIn, misassignedOut, MIS_DIR_LABEL, type MisDir } from '@/data/dcuMetrics'
import { townsGeo, countiesGeoAll } from '@/data/geo/geo'
import { addSelectedMeterLayer, setSelectedMeter } from './selectedMeterLayer'
import { registerMap, unregisterMap, pushCamera, pullCamera, pushHistory, popHistory, clearHistory } from './mapCamera'
import { GROUP_COLORS, DIM_OPACITY, STATE_COLOR, STATE_LABEL, freqColor, pinColor, MIS_COLOR } from './warroomConfig'
import { registerMarkerIcons, ICON_MIS_METER, ICON_DCU_OFFLINE } from './markerIcons'
import { buildLabelPoints } from './polyLabels'
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

interface DcuRef { dcu: Dcu; cross: boolean; color: string; wrap: HTMLDivElement; shape: HTMLDivElement; marker: maplibregl.Marker }

/**
 * DCU DOM marker builder —— 與故障地圖同一套編碼（依業主意見「故障 DCU 一律方形畫叉」）：
 *   斷線 → 較大的紅色圓角方塊 + 白色 ✕（形狀本身就是編碼，不只靠顏色）
 *   正常／停用 → 圓形，底色＝頻點色（停用＝灰）
 */
function dcuElement(state: DcuState, cross: boolean, color: string) {
  const off = state === 'offline'
  const wrap = document.createElement('div')
  wrap.className = 'war-marker'
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer' })
  const shape = document.createElement('div')
  shape.className = 'war-shape'
  Object.assign(shape.style, {
    width: off ? '26px' : '20px', height: off ? '26px' : '20px',
    borderRadius: off ? '6px' : '9999px',
    background: off ? STATE_COLOR.offline : state === 'disabled' ? STATE_COLOR.disabled : color,
    border: '3px solid #FFFFFF', display: 'grid', placeItems: 'center',
    boxShadow: '0 1px 4px rgba(42,33,37,.35)', outline: cross ? '2px dashed #2A2125' : 'none', outlineOffset: '2px',
  })
  if (off) shape.innerHTML = '<span style="color:#fff;font-size:15px;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.45)">✕</span>'
  wrap.appendChild(shape)
  if (cross) {
    const tag = document.createElement('span')
    tag.textContent = '跨區'
    Object.assign(tag.style, { fontSize: '9px', fontWeight: '700', color: '#2A2125', background: '#fff', border: '1px solid #E7DBDD', borderRadius: '4px', padding: '0 3px' })
    wrap.appendChild(tag)
  }
  return { wrap, shape }
}

/** 歸屬錯誤電表的 hover 卡（只有歸屬錯誤的電表才有 hover） */
interface MisPop { id: string; dir: MisDir | ''; actualId: string; expectedId: string; on: number; x: number; y: number }
/** DCU hover 卡：序號／編號／地址／頻點／狀態（與故障地圖同一組欄位） */
interface DcuPop { dcu: Dcu; online: number; total: number; readRate: number; misIn: number; misOut: number; x: number; y: number }

/**
 * 電表點：默認略弱化（比聚焦小一號）讓 DCU 標記仍是主角，但顏色保持可辨識；
 * 聚焦某台 DCU 時該台放大提亮、無關者淡出。
 */
const METER_RADIUS_SOFT: any = ['interpolate', ['linear'], ['zoom'], 12, 1.7, 14, 2.8, 16, 4.2]
const METER_RADIUS_FOCUS: any = ['interpolate', ['linear'], ['zoom'], 12, 2, 14, 3.4, 16, 5.2]
const METER_OPACITY_SOFT: any = ['case', ['==', ['get', 'on'], 0], 0.45, 0.68]
/** 透明命中圈：視覺仍是小點，但滑鼠有合理的可點範圍 */
const METER_HIT_RADIUS: any = ['interpolate', ['linear'], ['zoom'], 12, 6, 14, 8, 16, 11]
const DCU_HIT_RADIUS: any = ['interpolate', ['linear'], ['zoom'], 7, 8, 10, 10, 13, 13, 16, 16]

/**
 * DCU 超過這個數量就改用 GPU 圓點（整個縣市約 90–150 台、全台 420 台，
 * DOM marker 到這個量級會拖累拖曳）；單一行政區約 30 台，維持 DOM 標記保留 ✕／跨區等細節。
 */
const DOM_MARKER_MAX = 60
const EMPTY_FC_DATA = { type: 'FeatureCollection' as const, features: [] as any[] }

/**
 * 電表圖層的最小縮放層級 —— 低於此縮放不載入任何電表點。
 * 百萬級電表時電表只該存在於街道級視野內；這裡先把「縮放層級決定圖層存在與否」這條路鋪好。
 */
const METER_MIN_ZOOM = 13

/** 可點擊的裝置圖層（命中圈＋歸屬錯誤圖示）—— 空白處判定與雙擊退回都用這組 */
const DEVICE_LAYERS = ['rel-meter-hit', 'rel-dcu-hit', 'rel-mis-dot'] as const

/** 電表 → GeoJSON（純函式，供地圖事件在元件外重建） */
function meterFeatures(meters: Meter[]) {
  return {
    type: 'FeatureCollection' as const,
    features: meters.map((m) => {
      const d = dcuById.get(m.dcuId)
      const mis = m.dcuId !== m.expectedDcuId
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: {
          id: m.id, dcuId: m.dcuId, freq: d?.freq ?? 0, on: m.online ? 1 : 0,
          color: d ? freqColor(d.freq) : STATE_COLOR.disabled,
          mis: mis ? 1 : 0,
        },
      }
    }),
  }
}

export function DcuRelationMap() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const dcuRefs = useRef<Map<string, DcuRef>>(new Map())
  const polyFC = useRef<any>(null)

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
  const setCity = useWarroom((s) => s.setCity)
  const setDistrict = useWarroom((s) => s.setDistrict)
  const active = useWarroom((s) => s.tab) === 'relation' // 目前顯示中的是不是這張
  const activeRef = useRef(active)
  activeRef.current = active

  /**
   * 區域選取模式（L1 全台 / L2 縣市未指定行政區）—— 比照故障地圖：畫行政區色塊、點選下鑽，
   * 不進入電表視圖。選到行政區（L3）才切換成動態拖曳 + 電表的關係視圖。
   */
  const pickMode = level === 'taiwan' || !district
  const pickModeRef = useRef(pickMode)
  pickModeRef.current = pickMode

  const [hoverDcu, setHoverDcu] = useState<string | null>(null)
  // 右側列表 hover 的 DCU（store 共享）→ 地圖同步高亮
  const listHoverDcu = useWarroom((s) => s.hoverDcuId)
  const [misPop, setMisPop] = useState<MisPop | null>(null)
  const [dcuPop, setDcuPop] = useState<DcuPop | null>(null)
  const [polyHover, setPolyHover] = useState<{ name: string; x: number; y: number } | null>(null)
  // 電表圖層是否存在（由縮放層級決定）
  const [metersOn, setMetersOn] = useState(false)
  /** 「只顯示歸屬錯誤」圖層：獨立呈現歸屬錯誤電表與其相關 DCU（取代原本的歸屬範圍圈） */
  const [misOnly, setMisOnly] = useState(false)
  const misOnlyRef = useRef(misOnly)
  misOnlyRef.current = misOnly

  // 範圍內「所有」電表 → GPU 圖層，依所屬 DCU 頻點著色
  const districtMeters = useMemo(() => (pickMode ? [] : metersInScope(level, city, district)), [level, city, district, pickMode])

  /** 範圍內的歸屬錯誤電表（不受縮放門檻限制，數量本來就少） */
  const scopeMis = useMemo(
    () => (level === 'taiwan' ? MISASSIGNED_METERS : misassignedInCity(city, district)),
    [level, city, district],
  )

  /**
   * 範圍內「全部」DCU —— 狀態一律 正常／斷線／停用。
   * 跨區：DCU 在範圍外、但其收容電表跨界落在範圍內 → 補進來並標示跨區。
   */
  const dcus = useMemo(() => {
    if (pickMode) return [] as { dcu: Dcu; cross: boolean }[]
    const scoped = dcusInScope(level, city, district)
    const seen = new Set(scoped.map((d) => d.id))
    const out = scoped.map((dcu) => ({ dcu, cross: false }))
    districtMeters.forEach((m) => {
      if (seen.has(m.dcuId)) return
      const d = dcuById.get(m.dcuId)
      if (d) { seen.add(d.id); out.push({ dcu: d, cross: true }) }
    })
    return out
  }, [level, city, district, districtMeters, pickMode])

  /** 只顯示歸屬錯誤時，地圖上要出現的 DCU＝這些電表的「實際收容」與「白名單應屬」兩端 */
  const misRelatedDcus = useMemo(() => {
    const ids = new Set<string>()
    scopeMis.forEach((m) => { ids.add(m.dcuId); ids.add(m.expectedDcuId) })
    return [...ids].map((id) => dcuById.get(id)).filter(Boolean) as Dcu[]
  }, [scopeMis])

  // DCU 太多時（整個縣市）改用 GPU 圓點，避免上百個 DOM marker 拖累拖曳
  const gpuDcus = misOnly ? misRelatedDcus.length > DOM_MARKER_MAX : dcus.length > DOM_MARKER_MAX
  const lookupMeter = (id: string) => allMeterById.get(id) ?? null

  // 電表圖層只在街道級縮放才存在（見 applyMeters）；metersRef 給地圖事件用最新的資料
  const metersRef = useRef<Meter[]>(districtMeters)
  useEffect(() => { metersRef.current = districtMeters })

  /** 組 DCU hover 卡的內容（收容統計向 dcuMetrics 要，有快取） */
  const makeDcuPop = (dcuId: string, x: number, y: number): DcuPop | null => {
    const d = dcuById.get(dcuId)
    if (!d) return null
    const s = dcuStat(dcuId)
    return { dcu: d, online: s.online, total: s.total, readRate: s.readRate, misIn: misassignedIn(dcuId).length, misOut: misassignedOut(dcuId).length, x, y }
  }
  const makeDcuPopRef = useRef(makeDcuPop)
  makeDcuPopRef.current = makeDcuPop

  /** DCU GPU 圓點：底色＝頻點色（停用＝灰），斷線者紅框 —— 與 DOM 圓形標記同一套編碼 */
  const buildDcuPoints = () => {
    const list = misOnly ? misRelatedDcus.map((dcu) => ({ dcu })) : dcus
    return {
      type: 'FeatureCollection' as const,
      features: list.map(({ dcu }) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [dcu.lng, dcu.lat] },
        properties: { id: dcu.id, color: dcu.state === 'disabled' ? STATE_COLOR.disabled : freqColor(dcu.freq), off: dcu.state === 'offline' ? 1 : 0 },
      })),
    }
  }

  /* ---- 行政區色塊（L1／L2 的選取模式，與故障地圖同一套下鑽） ---- */
  const buildPoly = () => {
    if (level === 'taiwan') {
      return ({ type: 'FeatureCollection' as const, features: countiesGeoAll().features.map((f: any) => ({ ...f, properties: { ...f.properties, name: f.properties.name } })) })
    }
    return ({ type: 'FeatureCollection' as const, features: townsGeo(city).features.map((f: any) => ({ ...f, properties: { ...f.properties, name: f.properties.rname } })) })
  }

  /* ---- init map ---- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE, center: [121.5715, 25.0325], zoom: 13.2,
      attributionControl: { compact: true }, dragRotate: false,
      // 雙擊改成「退回上一個視角」，關掉內建的雙擊放大以免兩者互搶
      // （內建 handler 早於使用者監聽器執行，光靠 preventDefault() 攔不住）
      doubleClickZoom: false,
    })
    // 右上角讓給地圖頁籤，縮放控制移到右下
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    map.on('load', () => {
      registerMarkerIcons(map)

      // 行政區選取層（L1／L2）—— 疊在街道底圖上，關係地圖保留底圖不變
      polyFC.current = buildPoly()
      map.addSource('rel-poly', { type: 'geojson', data: polyFC.current })
      map.addLayer({ id: 'rel-poly-fill', type: 'fill', source: 'rel-poly', paint: { 'fill-color': '#5B6BE8', 'fill-opacity': 0.1 } })
      map.addLayer({ id: 'rel-poly-line', type: 'line', source: 'rel-poly', paint: { 'line-color': '#5B6BE8', 'line-width': 1.2, 'line-opacity': 0.55 } })
      // 區名另用「一名一點」的 source（直接掛多邊形會讓離島各標一次）
      map.addSource('rel-poly-labels', { type: 'geojson', data: buildLabelPoints(polyFC.current) as any })
      map.addLayer({
        id: 'rel-poly-label', type: 'symbol', source: 'rel-poly-labels',
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Regular'] },
        paint: { 'text-color': '#3A2F33', 'text-halo-color': '#fff', 'text-halo-width': 1.4 },
      })

      // 電表 GPU 圖層（所有電表，依所屬 DCU 頻點色）
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
      // 透明的加大命中範圍 —— 電表點在 z14 只有 2.8px 半徑，實際上很難點到。
      // 視覺維持小點（密度圖需要），只把可點擊的範圍放大。
      map.addLayer({
        id: 'rel-meter-hit', type: 'circle', source: 'rel-meters',
        paint: { 'circle-color': '#000', 'circle-opacity': 0, 'circle-radius': METER_HIT_RADIUS },
      })

      // 歸屬錯誤：指向線 + 灰色圓圈✕圖示。不受電表縮放門檻限制，
      // 任何縮放都看得見「應屬哪台、實際跑去哪」
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
        paint: { 'line-color': '#9AA0A6', 'line-width': 1.6, 'line-opacity': 0.9, 'line-dasharray': [2, 2] },
        layout: { 'line-cap': 'round' },
      })

      // DCU GPU 圓點（DCU 數量大時取代 DOM marker）
      map.addSource('rel-dcus', { type: 'geojson', data: EMPTY_FC_DATA })
      map.addLayer({
        id: 'rel-dcu-dots', type: 'circle', source: 'rel-dcus',
        filter: ['!=', ['get', 'off'], 1], // 斷線者改由方形 ✕ 圖示呈現
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2.6, 10, 4, 13, 6, 16, 9],
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#FFFFFF',
        },
      })
      // 斷線 DCU：與故障地圖同一個方形 ✕ 圖示
      map.addLayer({
        id: 'rel-dcu-off', type: 'symbol', source: 'rel-dcus',
        filter: ['==', ['get', 'off'], 1],
        layout: {
          'icon-image': ICON_DCU_OFFLINE,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.85, 16, 1.1],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      })

      // DCU 的透明命中圈（疊在電表命中圈之上，DCU 優先被點到）
      map.addLayer({
        id: 'rel-dcu-hit', type: 'circle', source: 'rel-dcus',
        paint: { 'circle-color': '#000', 'circle-opacity': 0, 'circle-radius': DCU_HIT_RADIUS },
      })

      // 歸屬錯誤電表圖示畫在 DCU 之上（它是這張圖要凸顯的主角）
      map.addLayer({
        id: 'rel-mis-dot', type: 'symbol', source: 'rel-mis',
        filter: ['==', ['get', 'kind'], 'meter'],
        layout: {
          'icon-image': ICON_MIS_METER,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.65, 14, 0.9, 16, 1.15],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      })

      // 選取電表的強化標記（最上層，任何縮放都在）
      addSelectedMeterLayer(map)

      /* ---- 行政區選取（L1／L2） ---- */
      map.on('mousemove', 'rel-poly-fill', (e) => {
        if (!pickModeRef.current) return
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        setPolyHover({ name: f.properties!.name as string, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'rel-poly-fill', () => { map.getCanvas().style.cursor = ''; setPolyHover(null) })
      map.on('click', 'rel-poly-fill', (e) => {
        if (!pickModeRef.current) return
        const f = e.features?.[0]; if (!f) return
        const name = f.properties!.name as string
        setPolyHover(null)
        if (useWarroom.getState().level === 'taiwan') { if (CITIES.some((c) => c.name === name)) setCity(name) }
        else setDistrict(name)
      })

      // 事件掛在透明命中圈上（涵蓋正常圓點與斷線方形圖示的所有 DCU）
      map.on('mousemove', 'rel-dcu-hit', (e) => {
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        const id = f.properties!.id as string
        setHoverDcu(id); setDcuPop(makeDcuPopRef.current(id, e.point.x, e.point.y))
      })
      map.on('mouseleave', 'rel-dcu-hit', () => { map.getCanvas().style.cursor = ''; setHoverDcu(null); setDcuPop(null) })
      map.on('click', 'rel-dcu-hit', (e) => { const f = e.features?.[0]; if (f) selectDcu(f.properties!.id) })

      registerMap('relation', map)
      readyRef.current = true
      buildMarkers()
      if (!pickModeRef.current) applyMeters(true)
      fitScope()

      // 縮放/平移結束 → 決定電表圖層是否存在、同步鏡頭
      map.on('moveend', () => {
        applyMeters()
        if (activeRef.current) pushCamera('relation')
      })

      /* ---- 歸屬錯誤電表：只有它有 hover（一般電表不再彈卡） ---- */
      map.on('mousemove', 'rel-mis-dot', (e) => {
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        const p = f.properties!
        setMisPop({ id: p.id, dir: p.dir, actualId: p.actualId, expectedId: p.expectedId, on: p.on, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'rel-mis-dot', () => { map.getCanvas().style.cursor = ''; setMisPop(null) })
      map.on('click', 'rel-mis-dot', (e) => { const f = e.features?.[0]; if (f) selectMeter(f.properties!.id) })

      // 一般電表：可點選（命中圈），但不再有 hover 卡（依業主意見只有歸屬錯誤的才 hover）
      map.on('click', 'rel-meter-hit', (e) => { const f = e.features?.[0]; if (!f) return; selectMeter(f.properties!.id) })
      map.on('mousemove', 'rel-meter-hit', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'rel-meter-hit', () => { map.getCanvas().style.cursor = '' })

      /**
       * 雙擊 → 退回上一個視角。
       * 掛在整張地圖而不是裝置圖層：第一下點擊會把鏡頭移到該裝置並拉近，裝置因此
       * 從游標底下滑走，第二下往往就落空了。改成整張地圖接手，雙擊必定生效。
       * 沒有可退的視角時就什麼都不做（內建雙擊放大已於 constructor 關閉）。
       */
      map.on('dblclick', () => { popHistory('relation') })

      // 點空白處 → 只取消電表選取；DCU 選取與展開的電表列表保留，收合走列表的 ← 鈕
      map.on('click', (e) => {
        const layers = [...DEVICE_LAYERS].filter((l) => map.getLayer(l))
        if (map.queryRenderedFeatures(e.point, { layers }).length) return
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
   * 選取模式（L1／L2）與「只顯示歸屬錯誤」時一律不畫一般電表。
   */
  const meterLayerOnRef = useRef(false)
  const applyMeters = (dataChanged = false) => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('rel-meters') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const on = !pickModeRef.current && !misOnlyRef.current && map.getZoom() >= METER_MIN_ZOOM
    if (on) {
      // 縮放門檻擋層級、bbox（外擴 25%）擋視窗 —— 只建可視範圍內的電表 feature。
      const b = map.getBounds()
      const mx = (b.getEast() - b.getWest()) * 0.25, my = (b.getNorth() - b.getSouth()) * 0.25
      const W = b.getWest() - mx, E = b.getEast() + mx, S = b.getSouth() - my, N = b.getNorth() + my
      src.setData(meterFeatures(metersRef.current.filter((m) => m.lng >= W && m.lng <= E && m.lat >= S && m.lat <= N)) as any)
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
    // 選取模式不畫任何 DCU —— 該層級只做區域下鑽
    if (pickMode) {
      ;(map.getSource('rel-dcus') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY_FC_DATA as any)
      return
    }
    ;(map.getSource('rel-dcus') as maplibregl.GeoJSONSource | undefined)?.setData((gpuDcus ? buildDcuPoints() : EMPTY_FC_DATA) as any)
    if (gpuDcus) return // 大範圍：DCU 走 GPU 圖層，不建 DOM marker
    const list = misOnly ? misRelatedDcus.map((dcu) => ({ dcu, cross: false })) : dcus
    list.forEach(({ dcu, cross }) => {
      const color = freqColor(dcu.freq)
      const { wrap, shape } = dcuElement(dcu.state, cross, color)
      wrap.addEventListener('mouseenter', () => {
        setHoverDcu(dcu.id)
        const p = map.project([dcu.lng, dcu.lat])
        setDcuPop(makeDcuPopRef.current(dcu.id, p.x, p.y))
      })
      wrap.addEventListener('mouseleave', () => { setHoverDcu(null); setDcuPop(null) })
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); selectDcu(dcu.id) })
      // DOM marker 不走 maplibre 的圖層事件，雙擊退回要自己掛
      wrap.addEventListener('dblclick', (ev) => { ev.stopPropagation(); ev.preventDefault(); popHistory('relation') })
      const marker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([dcu.lng, dcu.lat]).addTo(map)
      dcuRefs.current.set(dcu.id, { dcu, cross, color, wrap, shape, marker })
    })
  }

  /** 選取模式的圖層可見性：色塊只在 L1／L2 出現 */
  const applyPickMode = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const vis = pickMode ? 'visible' : 'none'
    ;['rel-poly-fill', 'rel-poly-line', 'rel-poly-label'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    })
    if (pickMode) {
      polyFC.current = buildPoly()
      ;(map.getSource('rel-poly') as maplibregl.GeoJSONSource | undefined)?.setData(polyFC.current)
      ;(map.getSource('rel-poly-labels') as maplibregl.GeoJSONSource | undefined)?.setData(buildLabelPoints(polyFC.current) as any)
    }
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
    const pts = [...districtMeters.map((m) => [m.lng, m.lat]), ...dcus.map(({ dcu }) => [dcu.lng, dcu.lat])]
    if (!pts.length) return
    let W = 180, S = 90, E = -180, N = -90
    pts.forEach(([x, y]) => { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y) })
    map.fitBounds([[W, S], [E, N]], { padding: 60, maxZoom: 15.5, duration: 600 })
  }

  // 資料範圍 / 模式變更 → 重建圖層 + fit（換了範圍，舊視角就沒有意義了）
  useEffect(() => {
    if (!readyRef.current) return
    clearHistory('relation')
    applyPickMode()
    applyMeters(true)
    buildMarkers()
    fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcus, districtMeters, pickMode, misOnly, misRelatedDcus])

  // 切換成顯示中的那張 → 對齊另一張的鏡頭（並重算尺寸、補上電表圖層）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !active) return
    map.resize()
    if (!pullCamera('relation')) fitScope() // 沒有另一張可參照才自行取景
    applyMeters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => { if (readyRef.current) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetNonce])
  useEffect(() => { if (readyRef.current) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refitNonce])

  // 清單/選取 DCU → 取景至該 DCU（先記下目前視角，雙擊裝置可退回）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !activeRef.current || !selectedDcuId) return
    const d = dcuById.get(selectedDcuId)
    if (d) {
      pushHistory('relation')
      map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDcuId])
  // 清單/選取電表 → 縮放至該電表並打上強化標記
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    const m = selectedMeterId ? lookupMeter(selectedMeterId) : null
    setSelectedMeter(map, m)
    if (m && activeRef.current) {
      pushHistory('relation')
      map.easeTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterId])

  /* ---- focus model（用於 DCU 標記高亮） ---- */
  const focus = useMemo(() => {
    const groupColor = new Map<string, string>()
    pinnedDcuIds.forEach((id, i) => groupColor.set(id, GROUP_COLORS[i % GROUP_COLORS.length]))
    const transient =
      selectedDcuId ??
      hoverDcu ??
      listHoverDcu ??
      (selectedMeterId ? lookupMeter(selectedMeterId)?.dcuId : null) ?? null
    if (transient && !groupColor.has(transient)) groupColor.set(transient, GROUP_COLORS[0])
    const focusedDcu = new Set(groupColor.keys())
    return { groupColor, focusedDcu, transient, any: focusedDcu.size > 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedDcuIds, selectedDcuId, hoverDcu, listHoverDcu, selectedMeterId])

  /* ---- apply DCU marker styles（底色維持頻點色；群組以外圈環、斷線以紅框表示） ---- */
  useEffect(() => {
    dcuRefs.current.forEach((r, id) => {
      const ring = pinColor(pinnedDcuIds, id) // 群組環只給「釘選」的 DCU，避免蓋掉頻點色
      const focused = focus.focusedDcu.has(id)
      const selected = id === selectedDcuId
      r.wrap.style.opacity = !focus.any || focused ? '1' : String(DIM_OPACITY)
      r.wrap.style.zIndex = focused ? '5' : '1'
      r.shape.style.borderColor = r.dcu.state === 'offline' ? STATE_COLOR.offline : '#FFFFFF'
      r.shape.style.boxShadow = selected
        ? `0 0 0 2px #fff, 0 0 0 4px ${ring ?? r.color}, 0 2px 8px rgba(42,33,37,.4)`
        : ring
          ? `0 0 0 2.5px ${ring}, 0 1px 4px rgba(42,33,37,.35)`
          : '0 1px 4px rgba(42,33,37,.35)'
      r.shape.style.transform = selected ? 'scale(1.15)' : 'scale(1)'
    })
  }, [focus, selectedDcuId, pinnedDcuIds])

  /**
   * 歸屬錯誤圖層資料：
   *   misOnly 開 → 範圍內全部歸屬錯誤電表（獨立檢視）
   *   misOnly 關 → 只畫選取 DCU 相關的（兩個方向：他台連入 / 連入他台）
   * 每顆電表配兩條線：實線＝實際收容、虛線＝白名單應屬。
   */
  const misMeters = useMemo((): { meter: Meter; dir: MisDir | '' }[] => {
    if (misOnly) {
      // 獨立圖層沒有「本台」可參照 —— 有選取 DCU 時才標得出方向，否則只標歸屬錯誤
      return scopeMis.map((meter) => ({
        meter,
        dir: !selectedDcuId ? ''
          : meter.dcuId === selectedDcuId ? 'in'
            : meter.expectedDcuId === selectedDcuId ? 'out'
              : '',
      }))
    }
    if (!selectedDcuId) return []
    return [
      ...misassignedIn(selectedDcuId).map((meter) => ({ meter, dir: 'in' as MisDir })),
      ...misassignedOut(selectedDcuId).map((meter) => ({ meter, dir: 'out' as MisDir })),
    ]
  }, [misOnly, scopeMis, selectedDcuId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('rel-mis') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const feats: any[] = []
    misMeters.forEach(({ meter: m, dir }) => {
      const actual = dcuById.get(m.dcuId)
      const expected = dcuById.get(m.expectedDcuId)
      if (actual) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[m.lng, m.lat], [actual.lng, actual.lat]] }, properties: { kind: 'actual' } })
      if (expected) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[m.lng, m.lat], [expected.lng, expected.lat]] }, properties: { kind: 'expected' } })
      feats.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
        properties: { kind: 'meter', id: m.id, dir, actualId: m.dcuId, expectedId: m.expectedDcuId, on: m.online ? 1 : 0 },
      })
    })
    src.setData({ type: 'FeatureCollection', features: feats } as any)
  }, [misMeters])

  /* ---- 電表隨聚焦淡出（聚焦 DCU 的電表浮出） ---- */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer('rel-meter-dots')) return
    const ids = [...focus.focusedDcu]
    if (ids.length) {
      map.setPaintProperty('rel-meter-dots', 'circle-opacity',
        ['match', ['get', 'dcuId'], ids, ['case', ['==', ['get', 'on'], 0], 0.6, 0.95], 0.1] as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_FOCUS as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', ['case', ['==', ['get', 'on'], 0], 0, 0.6] as any)
      const dcuOp: any = ['case', ['match', ['get', 'id'], ids, true, false], 1, DIM_OPACITY]
      map.setPaintProperty('rel-dcu-dots', 'circle-opacity', dcuOp)
      map.setPaintProperty('rel-dcu-dots', 'circle-stroke-opacity', dcuOp)
      if (map.getLayer('rel-dcu-off')) map.setPaintProperty('rel-dcu-off', 'icon-opacity', dcuOp)
    } else {
      map.setPaintProperty('rel-meter-dots', 'circle-opacity', METER_OPACITY_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', 0 as any)
      map.setPaintProperty('rel-dcu-dots', 'circle-opacity', 1 as any)
      map.setPaintProperty('rel-dcu-dots', 'circle-stroke-opacity', 1 as any)
      if (map.getLayer('rel-dcu-off')) map.setPaintProperty('rel-dcu-off', 'icon-opacity', 1 as any)
    }
  }, [focus])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <MisLayerSwitch
        on={misOnly}
        onChange={setMisOnly}
        count={scopeMis.length}
        metersOn={metersOn}
        pickMode={pickMode}
      />
      {polyHover && pickMode && (
        <div className="pointer-events-none absolute z-30 rounded-lg bg-surface border border-border shadow-card px-2.5 py-1.5 text-[12px] font-semibold text-ink" style={{ left: polyHover.x + 14, top: polyHover.y + 12 }}>
          {polyHover.name}
          <span className="ml-1.5 font-normal text-ink-mut">{level === 'taiwan' ? '點選進入' : '點選檢視關係'}</span>
        </div>
      )}
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
          {(dcuPop.misIn > 0 || dcuPop.misOut > 0) && (
            <div className="mt-1.5 rounded-[4px] px-1.5 py-1 text-[11px] font-semibold flex flex-col gap-0.5" style={{ background: '#EFECEC', color: MIS_COLOR }}>
              {dcuPop.misIn > 0 && <span>他台連入 {dcuPop.misIn} 顆</span>}
              {dcuPop.misOut > 0 && <span>連入他台 {dcuPop.misOut} 顆</span>}
            </div>
          )}
        </div>
      )}
      {misPop && (
        <div className="pointer-events-none absolute z-30 w-[212px] rounded-lg bg-surface border border-border shadow-card p-3" style={{ left: misPop.x + 14, top: misPop.y + 12 }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[12.5px] font-semibold text-ink">{misPop.id}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: misPop.on ? '#2A2125' : STATE_COLOR.offline }}>
              {misPop.on ? '連線' : '斷線'}
            </span>
          </div>
          <div className="mb-1.5 rounded-[4px] px-1.5 py-1 text-[11px] font-bold" style={{ background: '#EFECEC', color: MIS_COLOR }}>
            歸屬錯誤{misPop.dir ? ` · ${MIS_DIR_LABEL[misPop.dir]}` : ''}
          </div>
          <MRow k="實際收容" v={misPop.actualId} />
          <MRow k="白名單應屬" v={misPop.expectedId} />
        </div>
      )}
    </div>
  )
}

/* ---- 歸屬錯誤圖層開關（地圖左上）—— 取代原本的歸屬範圍圈三段切換 ---- */
function MisLayerSwitch({ on, onChange, count, metersOn, pickMode }: {
  on: boolean; onChange: (v: boolean) => void; count: number; metersOn: boolean; pickMode: boolean
}) {
  return (
    <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-1">
      <button
        onClick={() => onChange(!on)}
        title="只顯示歸屬錯誤的電表與其相關 DCU（實線＝實際收容、虛線＝白名單應屬）"
        className={`inline-flex items-center gap-1.5 rounded-lg border shadow-card px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
          on ? 'bg-ink text-white border-ink' : 'bg-surface/92 backdrop-blur text-ink-sub border-border hover:bg-bg'
        }`}
      >
        <span className="grid place-items-center h-3.5 w-3.5 rounded-full text-white text-[8px] font-bold leading-none" style={{ background: MIS_COLOR }}>✕</span>
        只顯示歸屬錯誤
        {count > 0 && (
          <span className={`tabular-nums rounded-full px-1.5 text-[10px] font-bold ${on ? 'bg-white/20' : 'bg-inset text-ink-sub'}`}>{count}</span>
        )}
      </button>
      {!pickMode && !metersOn && !on && (
        <span
          className="rounded-md bg-surface/92 backdrop-blur border border-border shadow-card px-2 py-1 text-[11px] text-ink-mut"
          title={`低於 z${METER_MIN_ZOOM} 不載入電表點，避免大範圍持有大量電表資料`}
        >
          放大以顯示電表
        </span>
      )}
      {pickMode && (
        <span className="rounded-md bg-surface/92 backdrop-blur border border-border shadow-card px-2 py-1 text-[11px] text-ink-mut">
          點選區域以檢視 DCU—電表關係
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
