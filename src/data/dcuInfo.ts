/* Deterministic mock attribute data for the DCU資料 side drawer. */

export interface DcuInfoExtra {
  taipowerCode: string // 台電區處代碼
  signal: number // 訊號強度 (dBm)
  ip: string
  imsi: string
  cellId: string
  channelMode: string // 頻道組別／模式
  onlineLastTime: string // 上線最後更新時間
  taipowerCoord: string // 台電圖號座標
  latlng: string // 經緯度
  address: string // 地址
  locationType: string // 位置類型
  powerType: string // DCU 引電類型
  connType: string // 連線類型
  firmware: string // 韌體版本
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const pad = (n: number, w: number) => String(n).padStart(w, '0')
const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, '0')

const AREAS = ['北北', '北南', '桃園', '中區', '南區', '高雄']
const CHANNEL = ['G／正常', 'H／正常', 'F／備援']
const LOCATION = ['桿上型', '地面型', '壁掛型', '手孔型']
const POWER = ['變壓器二次側', '低壓側', '專線引電']
const CONN = ['LTE', 'NB-IoT', 'RF']
const STREETS = ['寶園路二段', '北新路三段', '中正路二段', '文化路一段']

export function dcuInfo(model: string): DcuInfoExtra {
  const r = mulberry32(hash(model))
  const lat = (24.97 + r() * 0.03).toFixed(6)
  const lng = (121.53 + r() * 0.03).toFixed(6)
  const street = STREETS[Math.floor(r() * STREETS.length)]
  return {
    taipowerCode: `${pad(1 + Math.floor(r() * 12), 2)} ${AREAS[Math.floor(r() * AREAS.length)]} -${10 + Math.floor(r() * 89)}`,
    signal: -(50 + Math.floor(r() * 55)),
    ip: `172.17.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`,
    imsi: `4660113${pad(Math.floor(r() * 99999999), 8)}`,
    cellId: hex(Math.floor(r() * 0xfffffff), 7),
    channelMode: CHANNEL[Math.floor(r() * CHANNEL.length)],
    onlineLastTime: '03-18 10:30',
    taipowerCoord: `B${6000 + Math.floor(r() * 3999)}AE${hex(Math.floor(r() * 0xffff), 4)}`,
    latlng: `${lat}, ${lng}`,
    address: `新北市新店區${street}${10 + Math.floor(r() * 200)}號前`,
    locationType: LOCATION[Math.floor(r() * LOCATION.length)],
    powerType: POWER[Math.floor(r() * POWER.length)],
    connType: CONN[Math.floor(r() * CONN.length)],
    firmware: pad(Math.floor(r() * 500), 4),
  }
}
