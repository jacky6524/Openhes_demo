import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { status } from '@/tokens'

/**
 * Real street map via MapLibre GL (open-source Mapbox-GL fork) with the free,
 * no-API-key CARTO Positron vector basemap — a light style that matches the
 * dashboard. DCU sites are custom HTML markers.
 *
 * Two marker variants:
 *   'connection' — 連線(綠) / 斷線(紅) 圓點（DCU 裝置列表用）
 *   'fault'      — 正常(灰圓) / 異常(紅圓 + 齒輪圖示)（DCU 戰情室用）
 *
 * NOTE: tiles are fetched at runtime, so this needs network access; for a fully
 * offline/intranet build point STYLE at a self-hosted tile server instead.
 */
const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const GREEN = status.normal.fg
const RED = status.danger.fg
const NORMAL_GREY = '#9AA0A6'

export type StreetMapVariant = 'connection' | 'fault'
export interface StreetMapMarker {
  id: string
  lng: number
  lat: number
  abnormal: boolean
}

// default fleet around 大安區 (Da'an District) — used by the DCU 裝置列表 screen
const DEFAULT_MARKERS: StreetMapMarker[] = [
  { id: 'DCU-01', lng: 121.5334, lat: 25.0262, abnormal: false },
  { id: 'DCU-02', lng: 121.5387, lat: 25.0181, abnormal: false },
  { id: 'DCU-03', lng: 121.5482, lat: 25.0335, abnormal: true },
  { id: 'DCU-04', lng: 121.5525, lat: 25.0205, abnormal: false },
]

// white cog glyph for the 異常 (fault) marker
const GEAR_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

function markerEl(m: StreetMapMarker, variant: StreetMapVariant) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    cursor: 'pointer',
  })

  const dot = document.createElement('span')
  if (variant === 'fault') {
    if (m.abnormal) {
      Object.assign(dot.style, {
        display: 'grid',
        placeItems: 'center',
        width: '22px',
        height: '22px',
        borderRadius: '9999px',
        border: '2px solid #ffffff',
        background: RED,
        boxShadow: '0 1px 5px rgba(219,59,54,.5)',
      })
      dot.innerHTML = GEAR_SVG
    } else {
      Object.assign(dot.style, {
        width: '13px',
        height: '13px',
        borderRadius: '9999px',
        border: '2px solid #ffffff',
        background: NORMAL_GREY,
        boxShadow: '0 1px 4px rgba(42,33,37,.35)',
      })
    }
  } else {
    Object.assign(dot.style, {
      width: '15px',
      height: '15px',
      borderRadius: '9999px',
      border: '2px solid #ffffff',
      background: m.abnormal ? RED : GREEN,
      boxShadow: '0 1px 4px rgba(42,33,37,.4)',
    })
  }

  const chip = document.createElement('span')
  chip.textContent = m.id
  Object.assign(chip.style, {
    padding: '2px 6px',
    borderRadius: '6px',
    background: '#2A2125',
    boxShadow: '0 1px 2px rgba(42,33,37,.25)',
    fontSize: '11px',
    fontWeight: '500',
    color: '#ffffff',
    whiteSpace: 'nowrap',
  })

  el.appendChild(dot)
  el.appendChild(chip)
  return el
}

export function DcuStreetMap({
  markers = DEFAULT_MARKERS,
  variant = 'connection',
  center = [121.5435, 25.0255],
  zoom = 13.1,
}: {
  markers?: StreetMapMarker[]
  variant?: StreetMapVariant
  center?: [number, number]
  zoom?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => {
      markerRefs.current.forEach((m) => m.remove())
      markerRefs.current = []
      map.remove()
      mapRef.current = null
    }
    // center/zoom are initial-only (demo-static); markers handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (re)build markers whenever the marker set or variant changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRefs.current.forEach((m) => m.remove())
    markerRefs.current = markers.map((d) =>
      new maplibregl.Marker({ element: markerEl(d, variant), anchor: 'top' })
        .setLngLat([d.lng, d.lat])
        .addTo(map),
    )
  }, [markers, variant])

  return <div ref={containerRef} className="absolute inset-0" />
}
