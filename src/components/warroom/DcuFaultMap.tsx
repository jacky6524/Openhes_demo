import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { townsGeo, countiesGeoAll } from '@/data/geo/geo'
import {
  districtStats, statByDistrict, cityStats, statByCity,
  dcuById, meterById, CITIES, dcusInScope, ONLINE_RATE_THRESHOLDS, type Dcu,
} from '@/data/dcuFleet'
import { SEVERITY_COLOR, SEVERITY_STROKE, STATE_COLOR, STATE_LABEL, freqColor, MAP_BG } from './warroomConfig'
import { addSelectedMeterLayer, setSelectedMeter } from './selectedMeterLayer'
import { registerMap, unregisterMap, pushCamera, pullCamera } from './mapCamera'
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
function buildPoly(level: WarLevel, city: string) {
  if (level === 'taiwan') {
    const stats = new Map(cityStats().map((s) => [s.name, s]))
    return ({ type: 'FeatureCollection', features: countiesGeoAll().features.map((f) => { const name = f.properties.name as string; const sev = stats.get(name)?.severity ?? 'normal'; return { ...f, properties: { ...f.properties, name, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } } }) })
  }
  const stats = new Map(districtStats(city).map((s) => [s.name, s]))
  return ({ type: 'FeatureCollection', features: townsGeo(city).features.map((f) => { const name = f.properties.rname as string; const sev = stats.get(name)?.severity ?? 'normal'; return { ...f, properties: { ...f.properties, name, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } } }) })
}
/** DCU 點著色：斷線→紅、停用→灰、啟用正常→頻點色 */
function dcuColor(d: Dcu) {
  return d.state === 'offline' ? STATE_COLOR.offline : d.state === 'disabled' ? STATE_COLOR.disabled : freqColor(d.freq)
}
/** 範圍內所有 DCU（首頁球 = DCU 群集） */
function buildDcuPoints(level: WarLevel, city: string, district: string) {
  const arr = dcusInScope(level, city, district)
  return {
    type: 'FeatureCollection',
    features: arr.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      properties: { id: d.id, dist: d.district, serial: d.serial, address: d.address, code: d.code, freq: d.freq, state: d.state, color: dcuColor(d) },
    })),
  }
}
interface DcuInfo { id: string; dist: string; serial: string; address: string; code: string; freq: number; state: keyof typeof STATE_LABEL; color: string; x: number; y: number }

export function DcuFaultMap() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const polyFC = useRef<any>(null)
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
    if (st.level === 'taiwan') map.fitBounds(TAIWAN_BOUNDS, { padding: 20, duration: 600 })
    else if (!st.district) fitAllCity()
    else fitByName(st.district)
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    polyFC.current = buildPoly(useWarroom.getState().level, city)
    const map = new maplibregl.Map({ container: containerRef.current, style: BLANK_STYLE, center: [121.0, 23.7], zoom: 6.4, attributionControl: { compact: true }, dragRotate: false })
    // 右上角讓給地圖頁籤，縮放控制移到右下
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map

    map.on('load', () => {
      registerMarkerIcons(map)
      map.addSource('poly', { type: 'geojson', data: polyFC.current })
      // 無圖磚底圖 → 色塊改用系統總覽的不透明度，邊框用同一層級的 stroke 色
      map.addLayer({ id: 'poly-fill', type: 'fill', source: 'poly', paint: { 'fill-color': ['get', 'sevColor'], 'fill-opacity': 0.8 } })
      map.addLayer({ id: 'poly-line', type: 'line', source: 'poly', paint: { 'line-color': ['get', 'sevStroke'], 'line-width': 0.9 } })
      // 選取描邊（poly-sel / poly-sel-halo）依業主意見移除 —— 下鑽後鏡頭本身就框住該區
      // 區名另用「一名一點」的 source：直接掛在多邊形上，MultiPolygon 的離島會各標一次
      map.addSource('poly-labels', { type: 'geojson', data: buildLabelPoints(polyFC.current) as any })
      map.addLayer({ id: 'poly-label', type: 'symbol', source: 'poly-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Regular'] }, paint: { 'text-color': '#3A2F33', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } })
      const st0 = useWarroom.getState()

      // 群集：只呈現「故障（斷線）DCU 數」的紅球 —— 依業主意見不再畫藍色的「全部 DCU」球。
      // 群集內沒有任何斷線 → 整顆不畫（故障地圖上沒問題的區域本來就不需要標記）。
      // clusterMaxZoom 10：只有全台這種大範圍才聚成群集；進到縣市/行政區改畫單點，
      // 位置才會與關係地圖上的 DCU 完全一致（群集球畫在群心，不是任何一台 DCU 的座標）
      map.addSource('dcus', {
        type: 'geojson', data: buildDcuPoints(st0.level, city, st0.district) as any,
        cluster: true, clusterRadius: 46, clusterMaxZoom: 10,
        clusterProperties: { off: ['+', ['case', ['==', ['get', 'state'], 'offline'], 1, 0]] },
      })
      const clusterHasFault: any = ['all', ['has', 'point_count'], ['>', ['get', 'off'], 0]]
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'dcus', filter: clusterHasFault,
        paint: {
          'circle-color': STATE_COLOR.offline,
          'circle-radius': ['step', ['get', 'off'], 15, 5, 19, 20, 24, 50, 29],
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.94,
        },
      })
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'dcus', filter: clusterHasFault,
        layout: { 'text-field': ['to-string', ['get', 'off']], 'text-size': 13, 'text-font': ['Open Sans Bold'] },
        paint: { 'text-color': '#fff' },
      })

      // 未群集的 DCU：正常/停用畫圓點，斷線改用「方形 ✕」圖示（大而顯眼，最上層）
      map.addLayer({
        id: 'dcu-point', type: 'circle', source: 'dcus',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'state'], 'offline']],
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6.5, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      })
      map.addLayer({
        id: 'dcu-point-off', type: 'symbol', source: 'dcus',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'state'], 'offline']],
        layout: {
          'icon-image': ICON_DCU_OFFLINE,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 12, 0.95, 16, 1.25],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      })

      // 選取電表的強化標記（此圖不畫電表，點列表時至少要看得到目標在哪）
      addSelectedMeterLayer(map)

      registerMap('fault', map)
      readyRef.current = true
      fitScope()
      // 顯示中的那張移動結束 → 把隱藏的那張一起帶過去（順便讓它預先載好圖磚）
      map.on('moveend', () => { if (activeRef.current) pushCamera('fault') })

      map.on('mousemove', 'poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'
        const name = f.properties!.name as string
        const st = useWarroom.getState().level === 'taiwan' ? statByCity(name) : statByDistrict(useWarroom.getState().city, name)
        setHover({ name, total: st?.dcuTotal ?? 0, off: st?.dcuOffline ?? 0, rate: st?.onlineRate ?? 1, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'poly-fill', () => { map.getCanvas().style.cursor = ''; setHover(null) })
      map.on('click', 'poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return; const name = f.properties!.name as string
        if (useWarroom.getState().level === 'taiwan') { if (CITIES.some((c) => c.name === name)) setCity(name) }
        else { setDistrict(name); fitByName(name) }
        setDcuInfo(null)
      })
      map.on('click', 'clusters', (e) => { const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]; const cid = f.properties!.cluster_id; ;(map.getSource('dcus') as any).getClusterExpansionZoom(cid, (err: any, zoom: number) => { if (err) return; map.easeTo({ center: (f.geometry as any).coordinates, zoom: zoom + 0.4, duration: 600 }) }) })
      // DCU 單點：hover 顯示詳細資訊；click 高亮（不切換至關係地圖）
      const enter = () => (map.getCanvas().style.cursor = 'pointer'); const leave = () => (map.getCanvas().style.cursor = '')
      map.on('mouseenter', 'clusters', enter); map.on('mouseleave', 'clusters', leave)
      // 正常點與斷線點是兩個圖層，事件要各掛一次
      ;(['dcu-point', 'dcu-point-off'] as const).forEach((layer) => {
        map.on('mousemove', layer, (e) => {
          const f = e.features?.[0]; if (!f) return; map.getCanvas().style.cursor = 'pointer'
          const p = f.properties!
          setHover(null)
          setDcuInfo({ id: p.id, dist: p.dist, serial: p.serial, address: p.address, code: p.code, freq: p.freq, state: p.state, color: p.color, x: e.point.x, y: e.point.y })
        })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; setDcuInfo(null) })
        map.on('click', layer, (e) => { const f = e.features?.[0]; if (!f) return; selectDcu(f.properties!.id) })
      })
    })
    return () => { unregisterMap('fault'); map.remove(); mapRef.current = null; readyRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // level / city 變更 → 重建 polygons + DCU 點 + fit
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    polyFC.current = buildPoly(level, city)
    ;(map.getSource('poly') as maplibregl.GeoJSONSource)?.setData(polyFC.current)
    ;(map.getSource('poly-labels') as maplibregl.GeoJSONSource)?.setData(buildLabelPoints(polyFC.current) as any)
    ;(map.getSource('dcus') as maplibregl.GeoJSONSource)?.setData(buildDcuPoints(level, city, useWarroom.getState().district) as any)
    setDcuInfo(null); fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, city])

  // district 變更 → 重建 DCU 點 + fit（縣市層級；''＝整個縣市放滿）。
  // 選取描邊已移除，改由鏡頭框住該區來表示目前選取。
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    ;(map.getSource('dcus') as maplibregl.GeoJSONSource)?.setData(buildDcuPoints(level, city, district) as any)
    if (level === 'city') { if (district) fitByName(district); else fitAllCity(); setDcuInfo(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, level])

  useEffect(() => { const map = mapRef.current; if (!map || !readyRef.current || !activeRef.current || !selectedDcuId) return; const d = dcuById.get(selectedDcuId); if (d) map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedDcuId])
  // 切換成顯示中的那張 → 對齊另一張的鏡頭（並重算尺寸）；還沒有共用鏡頭才自行取景
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !active) return
    map.resize()
    if (!pullCamera('fault')) fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return
    const m = selectedMeterId ? meterById.get(selectedMeterId) ?? null : null
    setSelectedMeter(map, m)
    if (m && activeRef.current) map.easeTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterId])
  useEffect(() => { if (readyRef.current && resetNonce) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetNonce])
  useEffect(() => { if (readyRef.current && refitNonce) fitScope() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refitNonce])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {hover && (
        <div className="pointer-events-none absolute z-20 w-[180px] rounded-lg bg-surface border border-border shadow-card px-3 py-2" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="text-[13px] font-semibold text-ink mb-1">{hover.name}</div>
          <Row k="DCU 總數" v={String(hover.total)} />
          <Row k="斷線 DCU" v={String(hover.off)} danger={hover.off > 0} />
          {/* 連線率＝區塊塗色（告警層級）的判定基準 */}
          <Row k="DCU 連線率" v={`${(hover.rate * 100).toFixed(1)}%`} danger={hover.rate < ONLINE_RATE_THRESHOLDS.normal} />
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
