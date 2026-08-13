import type maplibregl from 'maplibre-gl'

/**
 * 兩張地圖的鏡頭同步。
 *
 * 兩張圖同時掛載（切頁籤只切可見性，避免 WebGL 重建），各自有獨立 camera，
 * 不處理的話切過去就像整個畫面位移了。
 *
 * 做法是登記表 + 直接讀寫對方的 map 實例，不做任何事件狀態記錄：
 *   - 顯示中的那張 moveend → 立刻把隱藏的那張 jumpTo 到相同位置（順便讓它預先載好圖磚）
 *   - 切換過去時 → 再從對方實例讀一次當下鏡頭對齊（不依賴先前有沒有收到事件）
 */
export type MapKey = 'fault' | 'relation'

const maps: Partial<Record<MapKey, maplibregl.Map>> = {}

export function registerMap(key: MapKey, map: maplibregl.Map) { maps[key] = map }
export function unregisterMap(key: MapKey) { delete maps[key] }

const cameraOf = (map: maplibregl.Map) => {
  const c = map.getCenter()
  return { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() }
}

const same = (map: maplibregl.Map, cam: ReturnType<typeof cameraOf>) => {
  const c = map.getCenter()
  return Math.abs(c.lng - cam.center[0]) < 1e-7 && Math.abs(c.lat - cam.center[1]) < 1e-7 && Math.abs(map.getZoom() - cam.zoom) < 1e-4
}

/** 由顯示中的那張呼叫：把其餘地圖帶到相同鏡頭 */
export function pushCamera(from: MapKey) {
  const src = maps[from]
  if (!src) return
  const cam = cameraOf(src)
  ;(Object.keys(maps) as MapKey[]).forEach((k) => {
    const m = maps[k]
    if (!m || k === from || same(m, cam)) return
    m.stop()
    m.jumpTo(cam)
  })
}

/**
 * 切換成顯示中的那張時呼叫：從另一張讀當下鏡頭並對齊。
 * @returns false 代表沒有其他地圖可參照（呼叫端應自行取景）
 */
export function pullCamera(to: MapKey): boolean {
  const dst = maps[to]
  if (!dst) return false
  const other = (Object.keys(maps) as MapKey[]).find((k) => k !== to && maps[k])
  if (!other) return false
  const cam = cameraOf(maps[other]!)
  dst.stop()
  if (!same(dst, cam)) dst.jumpTo(cam)
  return true
}
