import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { townsGeo, countiesGeoAll, INSET_COUNTY_IDS } from '@/data/geo/geo'
import { IslandShortcuts } from './IslandShortcuts'
import {
  districtStats, statByDistrict, cityStats, statByCity,
  dcuById, meterById, CITIES, districtsOf, dcusInScope, ONLINE_RATE_THRESHOLDS, type Dcu,
} from '@/data/dcuFleet'
import {
  SEVERITY_COLOR, SEVERITY_STROKE, STATE_COLOR, STATE_LABEL, MAP_BG, CLUSTER_COLOR, CLUSTER_TEXT,
  AREA_HOVER_LINE, AREA_HOVER_LINE_WIDTH, AREA_HOVER_FILL_OPACITY,
} from './warroomConfig'
import { addSelectedMeterLayer, setSelectedMeter } from './selectedMeterLayer'
import { registerMap, unregisterMap, pushCamera, pullCamera, pushHistory, popHistory, clearHistory, setCameraScope, scopeKey } from './mapCamera'
import { aggregateByArea, separateAggPoints, toAggFeatureCollection, MIN_SEP_DEG, AGG_DIAMETER_L2, citySepDeg } from './aggPoints'
import { registerMarkerIcons, ICON_DCU_OFFLINE } from './markerIcons'
import { buildLabelPoints } from './polyLabels'
import { useWarroom, type WarLevel } from '@/store/useWarroom'

/**
 * 純 GeoJSON 底圖（無圖磚）—— 比照系統總覽的地圖呈現：只有行政區色塊，沒有街道底圖。
 * glyphs 仍需外部字型來源才畫得出區名／群集數字（沿用 CARTO 的字型端點）。
 */
const BLANK_STYLE: any = {
  version: 8,
  glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': MAP_BG } }],
}
const TAIWAN_BOUNDS: [[number, number], [number, number]] = [[120.0, 21.88], [122.05, 25.32]]

function bbox(geom: any): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90
  const walk = (c: any) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]) } else c.forEach(walk) }
  walk(geom.coordinates); return [w, s, e, n]
}
/**
 * 目前層級要畫哪些區塊 —— 2026-08-27 依業主意見與系統總覽的下鑽語意對齊：
 *   L1 全台            → 全部縣市
 *   L2 縣市（未選區）   → 該縣市全部行政區
 *   L3 行政區（已選區） → **只留該行政區**（其餘拿掉，等同系統總覽的 geoForNode）
 * 原本 L3 只是把鏡頭框住、整個縣市的區塊都還在，兩張圖的下鑽感受因此不一致。
 * 要換區改走麵包屑退回 L2，這也與系統總覽相同。
 */
function buildPoly(level: WarLevel, city: string, district = '') {
  if (level === 'taiwan') {
    const stats = new Map(cityStats().map((s) => [s.name, s]))
    // 金門／馬祖畫進主圖會被取景裁掉，比照系統總覽排除、改由 IslandShortcuts 呈現
    return ({ type: 'FeatureCollection', features: countiesGeoAll().features.filter((f) => !INSET_COUNTY_IDS.includes(f.properties.rid as any)).map((f) => { const name = f.properties.name as string; const sev = stats.get(name)?.severity ?? 'normal'; return { ...f, properties: { ...f.properties, name, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } } }) })
  }
  const stats = new Map(districtStats(city).map((s) => [s.name, s]))
  const feats = townsGeo(city).features.filter((f) => !district || f.properties.rname === district)
  return ({ type: 'FeatureCollection', features: feats.map((f) => { const name = f.properties.rname as string; const sev = stats.get(name)?.severity ?? 'normal'; return { ...f, properties: { ...f.properties, name, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } } }) })
}
/** 範圍內的斷線 DCU —— 依業主意見，故障地圖只標斷線（停用／頻點色點位移除） */
function buildDcuPoints(level: WarLevel, city: string, district: string) {
  const arr = dcusInScope(level, city, district).filter((d) => d.state === 'offline')
  return {
    type: 'FeatureCollection',
    features: arr.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      properties: { id: d.id, dist: d.district, serial: d.serial, address: d.address, code: d.code, freq: d.freq, state: d.state, color: STATE_COLOR.offline, lastSeen: d.lastSeen },
    })),
  }
}
/**
 * 斷線 DCU 的匯總球 —— 2026-09-03 依業主意見改為**依行政層級聚合**，
 * 與電表歸屬地圖的匯總球同一套邏輯：L1 一個縣市一顆、L2 一個行政區一顆。
 * 原本用 maplibre 的地理群聚（supercluster），縮放時會不斷分裂成一堆小球、
 * 位置還會飄；改成照行政區聚合之後只有「縣市」「行政區」兩級，縮放不改變分群。
 *
 * 位置取該區斷線 DCU 的平均座標 —— 落在問題實際發生的地方，也不會與區名標籤重疊。
 */
function buildOfflineAgg(level: WarLevel, city: string, district: string, container: HTMLElement | null) {
  // 選定行政區之後畫面上只剩該區，改看單點就好，不再聚合
  if (level === 'city' && district) return { type: 'FeatureCollection' as const, features: [] as any[] }
  const arr = dcusInScope(level, city, district).filter((d) => d.state === 'offline')
  const agg = aggregateByArea(arr, (d) => (level === 'taiwan' ? d.city : d.district), (d) => d.lng, (d) => d.lat)
  // 台北市被新北市包住，兩者的平均座標會疊在一起 → 推開再畫。L2 的間距依縣市大小換算（見 citySepDeg）
  const sep = level === 'taiwan' ? MIN_SEP_DEG.taiwan : citySepDeg(fcBounds(townsGeo(city)), container)
  return toAggFeatureCollection(separateAggPoints(agg, sep))
}
/** FeatureCollection 的整體外框 [W, S, E, N] */
function fcBounds(fc: { features: any[] }): [number, number, number, number] {
  let W = 180, S = 90, E = -180, N = -90
  fc.features.forEach((f: any) => { const [w, s, e, n] = bbox(f.geometry); W = Math.min(W, w); S = Math.min(S, s); E = Math.max(E, e); N = Math.max(N, n) })
  return [W, S, E, N]
}

/** 有匯總球的層級（全台、或縣市但未選行政區）就不畫單點，兩者疊在一起會看不清楚 */
const isAggLevel = (level: WarLevel, district: string) => level === 'taiwan' || !district

interface DcuInfo { id: string; dist: string; serial: string; address: string; code: string; freq: number; state: keyof typeof STATE_LABEL; color: string; lastSeen: string; x: number; y: number }

export function DcuFaultMap() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const polyFC = useRef<any>(null)
  const navRef = useRef<maplibregl.NavigationControl | null>(null)
  const navOnRef = useRef(false)
  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)
  const setCity = useWarroom((s) => s.setCity)
  const setDistrict = useWarroom((s) => s.setDistrict)
  const selectDcu = useWarroom((s) => s.selectDcu)
  const resetNonce = useWarroom((s) => s.resetNonce)
  const refitNonce = useWarroom((s) => s.refitNonce)
  const active = useWarroom((s) => s.tab) === 'fault' // 目前顯示中的是不是這張
  const activeRef = useRef(active)
  activeRef.current = active

  const [hover, setHover] = useState<{ name: string; total: number; off: number; rate: number; x: number; y: number } | null>(null)
  const [dcuInfo, setDcuInfo] = useState<DcuInfo | null>(null)

  const fitByName = (name: string) => { const map = mapRef.current; if (!map || !polyFC.current) return; const f = polyFC.current.features.find((x: any) => x.properties.name === name); if (!f) return; const [w, s, e, n] = bbox(f.geometry); map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 700 }) }
  // 縣市層 district='' → 框住整個縣市所有行政區
  const fitAllCity = () => {
    const map = mapRef.current; if (!map || !polyFC.current || !polyFC.current.features.length) return
    let W = 180, S = 90, E = -180, N = -90
    polyFC.current.features.forEach((f: any) => { const [w, s, e, n] = bbox(f.geometry); W = Math.min(W, w); S = Math.min(S, s); E = Math.max(E, e); N = Math.max(N, n) })
    map.fitBounds([[W, S], [E, N]], { padding: 50, duration: 700 })
  }
  const fitScope = () => {
    const map = mapRef.current; if (!map) return
    // 非顯示中的那張不自行取景 —— 鏡頭一律由顯示中的那張決定，切過來時再對齊
    if (!activeRef.current) return
    const st = useWarroom.getState()
    setCameraScope('fault', scopeKey(st))
    if (st.level === 'taiwan') map.fitBounds(TAIWAN_BOUNDS, { padding: 20, duration: 600 })
    else if (!st.district) fitAllCity()
    else fitByName(st.district)
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    polyFC.current = buildPoly(useWarroom.getState().level, city, useWarroom.getState().district)
    // doubleClickZoom 關閉：雙擊改成「退回上一個視角」，內建 handler 早於使用者監聽器
    // 執行，光靠 preventDefault() 攔不住，只能整個關掉
    const map = new maplibregl.Map({
      container: containerRef.current, style: BLANK_STYLE, center: [121.0, 23.7], zoom: 6.4,
      attributionControl: { compact: true }, dragRotate: false, doubleClickZoom: false,
      // 這張圖的取景一律由層級決定（全台框／縣市框／行政區框），不需要自由拖曳
      // （2026-09-03 業主意見）。L1／L2 另由 applyLock 連縮放與縮放鈕一起關掉。
      dragPan: false,
    })
    // 右上角讓給地圖頁籤，縮放控制移到右下
    navRef.current = new maplibregl.NavigationControl({ showCompass: false })
    mapRef.current = map

    map.on('load', () => {
      registerMarkerIcons(map)
      map.addSource('poly', { type: 'geojson', data: polyFC.current })
      // 無圖磚底圖 → 色塊改用系統總覽的不透明度，邊框用同一層級的 stroke 色
      map.addLayer({ id: 'poly-fill', type: 'fill', source: 'poly', paint: { 'fill-color': ['get', 'sevColor'], 'fill-opacity': 0.8 } })
      map.addLayer({ id: 'poly-line', type: 'line', source: 'poly', paint: { 'line-color': ['get', 'sevStroke'], 'line-width': 0.9 } })
      // 滑過的區塊：提亮＋灰色描邊（與電表歸屬地圖同一組，2026-09-29 業主意見）
      map.addLayer({ id: 'poly-hover-fill', type: 'fill', source: 'poly', filter: ['==', ['get', 'name'], ''], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': AREA_HOVER_FILL_OPACITY } })
      map.addLayer({ id: 'poly-hover-line', type: 'line', source: 'poly', filter: ['==', ['get', 'name'], ''], paint: { 'line-color': AREA_HOVER_LINE, 'line-width': AREA_HOVER_LINE_WIDTH } })
      // 選取描邊（poly-sel / poly-sel-halo）依業主意見移除 —— 下鑽後鏡頭本身就框住該區
      // 區名另用「一名一點」的 source：直接掛在多邊形上，MultiPolygon 的離島會各標一次
      map.addSource('poly-labels', { type: 'geojson', data: buildLabelPoints(polyFC.current) as any })
      map.addLayer({ id: 'poly-label', type: 'symbol', source: 'poly-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Regular'] }, paint: { 'text-color': '#3A2F33', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } })
      const st0 = useWarroom.getState()

      // 群集：只呈現「故障（斷線）DCU 數」的紅球 —— 依業主意見不再畫藍色的「全部 DCU」球。
      // 群集內沒有任何斷線 → 整顆不畫（故障地圖上沒問題的區域本來就不需要標記）。
      // clusterMaxZoom 10：只有全台這種大範圍才聚成群集；進到縣市/行政區改畫單點，
      // 位置才會與關係地圖上的 DCU 完全一致（群集球畫在群心，不是任何一台 DCU 的座標）
      map.addSource('dcus', { type: 'geojson', data: buildDcuPoints(st0.level, city, st0.district) as any })

      /* 匯總球：一個行政單位一顆（見 buildOfflineAgg）。
         2026-09-23 依業主意見統一一個尺寸，不再依數量放大；量級只看球上的數字。 */
      map.addSource('dcu-agg', { type: 'geojson', data: buildOfflineAgg(st0.level, city, st0.district, containerRef.current) as any })
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'dcu-agg',
        paint: {
          'circle-color': CLUSTER_COLOR,
          'circle-radius': 16,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.92,
        },
      })
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'dcu-agg',
        layout: {
          'text-field': ['to-string', ['get', 'count']], 'text-size': 13, 'text-font': ['Open Sans Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': CLUSTER_TEXT },
      })

      // 未群集：只畫斷線 DCU 的「方形 ✕」（停用與頻點色點位已依業主意見移除）
      map.addLayer({
        id: 'dcu-point-off', type: 'symbol', source: 'dcus',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'state'], 'offline']],
        layout: {
          'icon-image': ICON_DCU_OFFLINE,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 12, 0.95, 16, 1.25],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      })
      // 透明的加大命中範圍 —— 6.5px 的圓點實際上不好點
      map.addLayer({
        id: 'dcu-hit', type: 'circle', source: 'dcus',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': '#000', 'circle-opacity': 0, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 12, 12, 16, 16] },
      })

      // 選取電表的強化標記（此圖不畫電表，點列表時至少要看得到目標在哪）
      addSelectedMeterLayer(map)

      registerMap('fault', map)
      readyRef.current = true
      applyAggMode(st0.level, st0.district)
      fitScope()
      // 顯示中的那張移動結束 → 把隱藏的那張一起帶過去（順便讓它預先載好圖磚）
      map.on('moveend', () => { if (activeRef.current) pushCamera('fault') })

      /** 滑過區塊的描邊／提亮（name='' 代表清除）。L3 畫面上只剩目前那一區，點了也不會動，不描邊 */
      const hoverArea = (name: string) => {
        const n = useWarroom.getState().district ? '' : name
        ;['poly-hover-fill', 'poly-hover-line'].forEach((id) => map.getLayer(id) && map.setFilter(id, ['==', ['get', 'name'], n]))
      }
      map.on('mousemove', 'poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'
        const name = f.properties!.name as string
        hoverArea(name)
        const st = useWarroom.getState().level === 'taiwan' ? statByCity(name) : statByDistrict(useWarroom.getState().city, name)
        setHover({ name, total: st?.dcuTotal ?? 0, off: st?.dcuOffline ?? 0, rate: st?.onlineRate ?? 1, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'poly-fill', () => { map.getCanvas().style.cursor = ''; hoverArea(''); setHover(null) })
      map.on('click', 'poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return; const name = f.properties!.name as string
        // 點在匯總球上 → 交給匯總球處理，避免同一次點擊下鑽兩次（第二次會把縣市名當行政區名
        // 設進去，跳到一個完全沒數值的畫面；2026-09-23 業主回報）
        if (map.getLayoutProperty('clusters', 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: ['clusters'] }).length) return
        const st = useWarroom.getState()
        if (st.level === 'taiwan') { if (CITIES.some((c) => c.name === name)) setCity(name) }
        // L3 畫面上只剩目前這一區，再點它不做事；要換區走麵包屑退回 L2
        else if (name !== st.district) { setDistrict(name); fitByName(name) }
        else return
        hoverArea('')
        setDcuInfo(null)
      })
      // 點匯總球＝下鑽到該行政單位（與電表歸屬地圖同一個行為）
      map.on('click', 'clusters', (e) => {
        const f = e.features?.[0]; if (!f) return
        const name = f.properties!.name as string
        const st = useWarroom.getState()
        setHover(null); hoverArea('')
        // 只往下一層：L1 → 該縣市（L2）；L2 → 該行政區（L3）
        if (st.level === 'taiwan') { if (CITIES.some((c) => c.name === name)) setCity(name) }
        else if (!st.district && districtsOf(st.city).some((d) => d.name === name)) { setDistrict(name); fitByName(name) }
      })
      // 球蓋住底下的多邊形，hover 提示要自己接手，否則游標移上去提示會消失
      map.on('mousemove', 'clusters', (e) => {
        const f = e.features?.[0]; if (!f) return
        const name = f.properties!.name as string
        const st = useWarroom.getState()
        const stat = st.level === 'taiwan' ? statByCity(name) : statByDistrict(st.city, name)
        setDcuInfo(null)
        hoverArea(name)
        setHover({ name, total: stat?.dcuTotal ?? 0, off: stat?.dcuOffline ?? 0, rate: stat?.onlineRate ?? 1, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'clusters', () => { setHover(null) })
      // DCU 單點：hover 顯示詳細資訊；click 高亮（不切換至關係地圖）
      const enter = () => (map.getCanvas().style.cursor = 'pointer'); const leave = () => (map.getCanvas().style.cursor = '')
      map.on('mouseenter', 'clusters', enter); map.on('mouseleave', 'clusters', leave)
      // 事件掛在透明命中圈上（同時涵蓋正常圓點與斷線方形圖示，範圍也比實際圖形大）
      map.on('mousemove', 'dcu-hit', (e) => {
        const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'
        const p = f.properties!
        setHover(null)
        setDcuInfo({ id: p.id, dist: p.dist, serial: p.serial, address: p.address, code: p.code, freq: p.freq, state: p.state, color: p.color, lastSeen: p.lastSeen, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'dcu-hit', () => { map.getCanvas().style.cursor = ''; setDcuInfo(null) })
      map.on('click', 'dcu-hit', (e) => { const f = e.features?.[0]; if (!f) return; selectDcu(f.properties!.id) })
      /**
       * 雙擊 → 退回上一個視角。掛在整張地圖而不是裝置圖層：第一下點擊會把鏡頭移到
       * 該裝置並拉近，裝置因此從游標底下滑走，第二下往往落空。
       * 沒有可退的視角時就什麼都不做（內建雙擊放大已於 constructor 關閉）。
       */
      map.on('dblclick', () => { popHistory('fault') })
    })
    return () => { unregisterMap('fault'); map.remove(); mapRef.current = null; readyRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

/**
 * L1／L2 的地圖是「區域選取模式」—— 取景一律由層級決定（全台框／縣市框），
 * 比照系統總覽的地圖：**不可縮放、不可拖曳**，縮放鈕也一併收起。
 * 進到 L3 才是裝置視圖，那時才需要自由縮放與拖曳去看點位。
 * （2026-09-07 業主意見：L1／L2 兩張圖都要與系統總覽一致。）
 */
  const applyLock = (locked: boolean) => {
    const map = mapRef.current
    if (!map) return
    const nav = navRef.current
    // 這張圖一律不可拖曳（取景由層級決定），L1／L2 再連縮放一起關掉
    if (locked) {
      map.scrollZoom.disable(); map.touchZoomRotate.disable()
      map.boxZoom.disable(); map.keyboard.disable()
      if (nav && navOnRef.current) { map.removeControl(nav); navOnRef.current = false }
    } else {
      map.scrollZoom.enable(); map.touchZoomRotate.enable()
      map.boxZoom.enable(); map.keyboard.enable()
      if (nav && !navOnRef.current) { map.addControl(nav, 'bottom-right'); navOnRef.current = true }
    }
  }

  /** 匯總球與單點互斥：有匯總球的層級把單點與其命中圈關掉，避免重疊影響閱讀 */
  const applyAggMode = (lv: WarLevel, dist: string) => {
    const map = mapRef.current
    if (!map) return
    const agg = isAggLevel(lv, dist)
    ;['clusters', 'cluster-count'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', agg ? 'visible' : 'none')
    })
    ;['dcu-point-off', 'dcu-hit'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', agg ? 'none' : 'visible')
    })
    // L2 的球小一號，市區的小行政區才看得到（2026-09-29 業主意見）
    const l2 = lv === 'city'
    if (map.getLayer('clusters')) map.setPaintProperty('clusters', 'circle-radius', l2 ? AGG_DIAMETER_L2 / 2 : 16)
    if (map.getLayer('cluster-count')) map.setLayoutProperty('cluster-count', 'text-size', l2 ? 11 : 13)
    // 有匯總球的層級＝L1／L2，一併鎖住縮放
    applyLock(agg)
  }

  // level / city 變更 → 重建 polygons + DCU 點 + fit（換了範圍，舊視角就沒有意義了）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    clearHistory('fault')
    polyFC.current = buildPoly(level, city, useWarroom.getState().district)
    ;(map.getSource('poly') as maplibregl.GeoJSONSource)?.setData(polyFC.current)
    ;(map.getSource('poly-labels') as maplibregl.GeoJSONSource)?.setData(buildLabelPoints(polyFC.current) as any)
    ;(map.getSource('dcus') as maplibregl.GeoJSONSource)?.setData(buildDcuPoints(level, city, useWarroom.getState().district) as any)
    ;(map.getSource('dcu-agg') as maplibregl.GeoJSONSource)?.setData(buildOfflineAgg(level, city, useWarroom.getState().district, containerRef.current) as any)
    applyAggMode(level, useWarroom.getState().district)
    setDcuInfo(null); fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, city])

  // district 變更 → 重建 DCU 點 + fit（縣市層級；''＝整個縣市放滿）。
  // 選取描邊已移除，改由鏡頭框住該區來表示目前選取。
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    clearHistory('fault') // 換了行政區，之前的視角沒有意義
    // 區塊也要重建 —— 選定行政區後只留該區（見 buildPoly 的說明）
    polyFC.current = buildPoly(level, city, district)
    ;(map.getSource('poly') as maplibregl.GeoJSONSource)?.setData(polyFC.current)
    ;(map.getSource('poly-labels') as maplibregl.GeoJSONSource)?.setData(buildLabelPoints(polyFC.current) as any)
    ;(map.getSource('dcus') as maplibregl.GeoJSONSource)?.setData(buildDcuPoints(level, city, district) as any)
    ;(map.getSource('dcu-agg') as maplibregl.GeoJSONSource)?.setData(buildOfflineAgg(level, city, district, containerRef.current) as any)
    applyAggMode(level, district)
    if (level === 'city') { if (district) fitByName(district); else fitAllCity(); setDcuInfo(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, level])

  // 選取 DCU → 拉近；先記下目前視角，雙擊裝置可退回
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !activeRef.current || !selectedDcuId) return
    const d = dcuById.get(selectedDcuId)
    if (d) { pushHistory('fault'); map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDcuId])
  // 切換成顯示中的那張 → 對齊另一張的鏡頭（並重算尺寸）；還沒有共用鏡頭才自行取景
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !active) return
    map.resize()
    if (!pullCamera('fault', scopeKey(useWarroom.getState()))) fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    const m = selectedMeterId ? meterById.get(selectedMeterId) ?? null : null
    setSelectedMeter(map, m)
    if (m && activeRef.current) { pushHistory('fault'); map.easeTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterId])
  useEffect(() => { if (readyRef.current && resetNonce) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetNonce])
  useEffect(() => { if (readyRef.current && refitNonce) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refitNonce])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {/* 離島 inset —— 位置比照系統總覽：右下。只在全台層級出現。
          （系統總覽是「圖例上方」，戰情室的圖例在左下，因此這裡讓開右下角的縮放鈕） */}
      {level === 'taiwan' && (
        <div className="absolute bottom-[84px] right-3.5 z-[2]">
          <IslandShortcuts />
        </div>
      )}
      {hover && (
        <div className="pointer-events-none absolute z-20 w-[180px] rounded-lg bg-surface border border-border shadow-card px-3 py-2" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="text-[13px] font-semibold text-ink mb-1">{hover.name}</div>
          <Row k="DCU 總數" v={String(hover.total)} />
          {/* 斷線數永遠紅字；連線率只有低於警告門檻(90%)才轉紅 */}
          <Row k="斷線 DCU" v={String(hover.off)} danger />
          <Row k="DCU 連線率" v={`${(hover.rate * 100).toFixed(1)}%`} danger={hover.rate < ONLINE_RATE_THRESHOLDS.warn} />
        </div>
      )}
      {dcuInfo && (
        <div className="pointer-events-none absolute z-30 w-[228px] rounded-lg bg-surface border border-border shadow-card p-3" style={{ left: dcuInfo.x + 14, top: dcuInfo.y + 12 }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[13px] font-semibold text-ink">{dcuInfo.id}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: dcuInfo.state === 'active' ? '#2A2125' : dcuInfo.color }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: dcuInfo.color }} />{STATE_LABEL[dcuInfo.state]}
            </span>
          </div>
          <Row k="序號" v={dcuInfo.serial} mono />
          <Row k="編號" v={dcuInfo.code} mono />
          <Row k="地址" v={dcuInfo.address} />
          <Row k="頻點" v={`第 ${dcuInfo.freq} 頻點`} />
          <Row k="最後連線時間" v={dcuInfo.lastSeen} danger />
        </div>
      )}
    </div>
  )
}
function Row({ k, v, danger, mono }: { k: string; v: string; danger?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[12px] py-0.5">
      <span className="text-ink-sub shrink-0">{k}</span>
      <span className={`tabular-nums font-medium text-right ${mono ? 'font-mono' : ''}`} style={danger ? { color: '#DB3B36' } : { color: '#2A2125' }}>{v}</span>
    </div>
  )
}
