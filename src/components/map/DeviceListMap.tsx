import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { status as statusTok } from '@/tokens'
import type { DeviceKind, DeviceMeter, DeviceRow } from '@/data/deviceList'
import { useThresholds, type ApiThreshold } from '@/config/statusThresholds'

/**
 * 裝置列表的街道地圖（規格第 11 節「地圖模式」），與清單雙向同步：
 *   · 裝置點：DCU 依連線／斷線上色；LTE／NB-IoT Cell 依上線率三段上色（門檻讀燈號門檻 API meterConnectivity：≥97／95–97／<95）
 *   · 選定裝置後才畫它的所屬電表（小點，連線／斷線），換裝置就清掉舊的電表點
 *   · 點裝置點 → onSelect；滑過 → onHover（清單同步 highlight）；點電表點 → onPickMeter
 *   · 外部的 selectedId／meterId 變動（例如點清單列）→ 鏡頭移過去；沒有座標的不移動（由頁面顯示提示）
 * 裝置與電表都用 GeoJSON circle 圖層（不是 DOM marker），上百個點也不卡；選取中的那顆另外掛一個 DOM 標籤顯示名稱。
 * 底圖：CARTO Positron（免金鑰、需要網路；內網部署要換自架圖磚）。
 */
const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const GREEN = statusTok.normal.fg
const ORANGE = statusTok.warning.fg
const RED = statusTok.danger.fg
const HL = '#1E2939' // hover／選取外環

/** 裝置點顏色；Cell 依上線率對 meterConnectivity 門檻（參數調整頁可改） */
const deviceTone = (d: DeviceRow, t: ApiThreshold) =>
  d.kind === 'DCU' ? (d.status === 'offline' ? RED : GREEN) : d.onlinePct < t.warning ? RED : d.onlinePct < t.good ? ORANGE : GREEN

type FC = GeoJSON.FeatureCollection<GeoJSON.Point>
const fc = (features: FC['features']): FC => ({ type: 'FeatureCollection', features })
const pt = (lng: number, lat: number, props: Record<string, unknown>): FC['features'][number] => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props,
})

function chipEl(text: string) {
  const el = document.createElement('span')
  el.textContent = text
  Object.assign(el.style, {
    padding: '2px 7px', borderRadius: '6px', background: '#1E2939', color: '#fff',
    fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
    transform: 'translateY(-14px)', pointerEvents: 'none',
  })
  return el
}

export function DeviceListMap({
  kind, devices, meters, selectedId, hoverId, meterId, onSelect, onHover, onPickMeter,
}: {
  kind: DeviceKind
  devices: DeviceRow[]
  meters: DeviceMeter[]
  selectedId: string | null
  hoverId: string | null
  meterId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onPickMeter: (meterNo: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const chipRef = useRef<maplibregl.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const onT = useThresholds((s) => s.values.meterConnectivity)
  // handler 會在 render 間更換，事件只綁一次 → 透過 ref 拿最新版
  const cb = useRef({ onSelect, onHover, onPickMeter })
  cb.current = { onSelect, onHover, onPickMeter }

  useEffect(() => {
    if (!boxRef.current) return
    const map = new maplibregl.Map({
      container: boxRef.current, style: STYLE, center: [121.545, 25.035], zoom: 12.4,
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('dev', { type: 'geojson', data: fc([]) })
      map.addSource('meter', { type: 'geojson', data: fc([]) })
      map.addLayer({ id: 'meter-dot', type: 'circle', source: 'meter', paint: {
        'circle-radius': 4, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
      } })
      map.addLayer({ id: 'meter-hl', type: 'circle', source: 'meter', filter: ['==', ['get', 'id'], ''], paint: {
        'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': HL, 'circle-stroke-width': 2.5,
      } })
      map.addLayer({ id: 'dev-dot', type: 'circle', source: 'dev', paint: {
        'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      } })
      map.addLayer({ id: 'dev-hl', type: 'circle', source: 'dev', filter: ['==', ['get', 'id'], ''], paint: {
        'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': HL, 'circle-stroke-width': 2.5,
      } })

      const idOf = (e: maplibregl.MapLayerMouseEvent) => e.features?.[0]?.properties?.id as string | undefined
      map.on('click', 'dev-dot', (e) => { const id = idOf(e); if (id) cb.current.onSelect(id) })
      map.on('click', 'meter-dot', (e) => { const id = idOf(e); if (id) cb.current.onPickMeter(id) })
      map.on('mousemove', 'dev-dot', (e) => { map.getCanvas().style.cursor = 'pointer'; cb.current.onHover(idOf(e) ?? null) })
      map.on('mouseleave', 'dev-dot', () => { map.getCanvas().style.cursor = ''; cb.current.onHover(null) })
      map.on('mouseenter', 'meter-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'meter-dot', () => { map.getCanvas().style.cursor = '' })
      setReady(true)
    })
    mapRef.current = map
    return () => { chipRef.current?.remove(); map.remove(); mapRef.current = null }
  }, [])

  // 裝置點：換分頁就重畫並把鏡頭框住全部有座標的裝置
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const located = devices.filter((d) => d.lng !== null && d.lat !== null)
    ;(map.getSource('dev') as maplibregl.GeoJSONSource).setData(
      fc(located.map((d) => pt(d.lng!, d.lat!, { id: d.id, color: deviceTone(d, onT) }))),
    )
    if (located.length) {
      const b = new maplibregl.LngLatBounds()
      located.forEach((d) => b.extend([d.lng!, d.lat!]))
      map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 14 })
    }
    // devices 只在換分頁時換（同一個陣列參考）
  }, [ready, devices, kind, onT])

  // 所屬電表點：只畫選定裝置的
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('meter') as maplibregl.GeoJSONSource).setData(
      fc(meters.filter((m) => m.lng !== null).map((m) => pt(m.lng!, m.lat!, { id: m.meterNo, color: m.status === 'online' ? GREEN : RED }))),
    )
  }, [ready, meters])

  // hover／選取外環
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter('dev-hl', ['in', ['get', 'id'], ['literal', [selectedId, hoverId].filter(Boolean)]])
    map.setFilter('meter-hl', ['==', ['get', 'id'], meterId ?? ''])
  }, [ready, selectedId, hoverId, meterId])

  // 選定裝置 → 鏡頭移過去＋名稱標籤
  useEffect(() => {
    const map = mapRef.current
    chipRef.current?.remove()
    chipRef.current = null
    if (!map || !ready || !selectedId) return
    const d = devices.find((x) => x.id === selectedId)
    if (!d || d.lng === null || d.lat === null) return
    chipRef.current = new maplibregl.Marker({ element: chipEl(d.id), anchor: 'bottom' }).setLngLat([d.lng, d.lat]).addTo(map)
    map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), d.kind === 'DCU' ? 15 : 14), duration: 500 })
  }, [ready, selectedId, devices])

  // 選定電表 → 鏡頭移過去
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !meterId) return
    const m = meters.find((x) => x.meterNo === meterId)
    if (!m || m.lng === null || m.lat === null) return
    map.easeTo({ center: [m.lng, m.lat], zoom: Math.max(map.getZoom(), 16), duration: 500 })
  }, [ready, meterId, meters])

  return <div ref={boxRef} className="absolute inset-0" />
}
