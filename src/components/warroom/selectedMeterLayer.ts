import type maplibregl from 'maplibre-gl'

/**
 * 兩張地圖共用的「選取電表」強化標記 —— 從右側電表列表點一筆時，
 * 地圖上要看得到是哪一顆。獨立 source，不受電表圖層的縮放門檻限制，
 * 任何縮放層級都畫得出來（列表點選 → 飛過去 → 一定看得到目標）。
 */
const SRC = 'sel-meter'
const EMPTY = { type: 'FeatureCollection' as const, features: [] as any[] }
const RING: any = ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 13, 17, 18]

export function addSelectedMeterLayer(map: maplibregl.Map, color = '#2F6BED') {
  if (map.getSource(SRC)) return
  map.addSource(SRC, { type: 'geojson', data: EMPTY })
  // 白色外暈：讓標記在任何底圖與電表色上都讀得出來
  map.addLayer({
    id: 'sel-meter-halo', type: 'circle', source: SRC,
    paint: {
      'circle-color': 'rgba(0,0,0,0)', 'circle-radius': RING,
      'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 5, 'circle-stroke-opacity': 0.95,
    },
  })
  map.addLayer({
    id: 'sel-meter-ring', type: 'circle', source: SRC,
    paint: {
      'circle-color': 'rgba(0,0,0,0)', 'circle-radius': RING,
      'circle-stroke-color': color, 'circle-stroke-width': 2.6,
    },
  })
  // 中心點：縮很遠時外環變小，靠這一點確保仍看得見
  map.addLayer({
    id: 'sel-meter-dot', type: 'circle', source: SRC,
    paint: {
      'circle-color': color, 'circle-radius': 3.2,
      'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.6,
    },
  })
}

export function setSelectedMeter(map: maplibregl.Map, pt: { lng: number; lat: number } | null) {
  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
  if (!src) return
  src.setData((pt
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] }, properties: {} }] }
    : EMPTY) as any)
}
