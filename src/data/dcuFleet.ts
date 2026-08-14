/**
 * DCU / 電表 fleet — DCU 戰情室兩張地圖共用的 mock 資料（多縣市）。
 * 僅使用「目前 API 可提供」的欄位：DCU/電表座標、連斷線、電表收容的 DCU、收容關係。
 * 不含 RF 訊號、原始歸屬、歸屬衝突、頻繁切換、故障原因等（無 API 依據）。
 * 跨區：電表通常與其 DCU 距離不遠；跨區＝電表跨越行政區、與 DCU 不同區，出現在邊界。
 * TODO: 上線改接 API；以下皆 deterministic mock。
 */

export interface CityDef { name: string; districts: { name: string; center: [number, number] }[] }

export const CITIES: CityDef[] = [
  {
    name: '台北市',
    districts: [
      { name: '信義區', center: [121.5715, 25.0325] },
      { name: '大安區', center: [121.5430, 25.0265] },
      { name: '松山區', center: [121.5577, 25.0500] },
      { name: '中正區', center: [121.5180, 25.0324] },
      { name: '中山區', center: [121.5330, 25.0640] },
    ],
  },
  {
    name: '新北市',
    districts: [
      { name: '板橋區', center: [121.4590, 25.0095] },
      { name: '三重區', center: [121.4880, 25.0610] },
      { name: '中和區', center: [121.4990, 24.9990] },
    ],
  },
  {
    name: '台中市',
    districts: [
      { name: '西屯區', center: [120.6420, 24.1810] },
      { name: '北屯區', center: [120.6860, 24.1830] },
      { name: '南屯區', center: [120.6420, 24.1380] },
    ],
  },
  {
    name: '高雄市',
    districts: [
      { name: '前鎮區', center: [120.3130, 22.5900] },
      { name: '三民區', center: [120.3200, 22.6470] },
      { name: '左營區', center: [120.2950, 22.6870] },
    ],
  },
]
export const DEFAULT_CITY = '台北市'
export const DEFAULT_DISTRICT = '信義區'
export const cityDef = (name: string) => CITIES.find((c) => c.name === name)
export const districtsOf = (city: string) => cityDef(city)?.districts ?? []

/** DCU 運行狀態：啟用(正常) / 停用 / 斷線 */
export type DcuState = 'active' | 'disabled' | 'offline'
/** 頻點數：目前設定 10 個頻點 */
export const FREQ_COUNT = 10

export interface Dcu {
  id: string
  lng: number
  lat: number
  online: boolean
  city: string
  district: string
  lastSeen: string
  freq: number // 頻點 1..FREQ_COUNT
  state: DcuState // 啟用 / 停用 / 斷線
  serial: string // 序號
  address: string // 地址
  code: string // 編號
}
export interface Meter {
  id: string
  lng: number
  lat: number
  online: boolean
  dcuId: string // 實際收容 DCU
  expectedDcuId: string // 白名單應屬 DCU；與 dcuId 不同＝歸屬錯誤
  city: string
  district: string
  last: string
}

/**
 * 告警層級 —— 以「DCU 連線率」為判定基準（連線數 / 總數），也就是地圖區塊塗色的依據。
 * 比照系統總覽，只分三級：良好 ≥95%｜注意 85–95%｜警告 <85%。門檻可配置。
 * （原本的四級 normal/warn/abnormal/critical 已於 2026-08 依業主意見收斂為三級。）
 */
export type Severity = 'normal' | 'warn' | 'alert'
export const ONLINE_RATE_THRESHOLDS = { normal: 0.95, warn: 0.85 }
export function classifySeverity(onlineRate: number): Severity {
  if (onlineRate >= ONLINE_RATE_THRESHOLDS.normal) return 'normal'
  if (onlineRate >= ONLINE_RATE_THRESHOLDS.warn) return 'warn'
  return 'alert'
}

/* ---------- PRNG ---------- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const pad = (n: number, w = 3) => String(n).padStart(w, '0')

/** 每個行政區的 DCU 數 / 每台 DCU 的電表數（高密度模擬） */
const DCU_PER_DISTRICT_COUNT = 30
const METERS_PER_DCU = 80

/** 縣市 → 編號前綴 */
const CITY_CODE: Record<string, string> = { 台北市: 'TPE', 新北市: 'NTP', 台中市: 'TCH', 高雄市: 'KHH' }
const STREETS = ['中山', '中正', '民生', '建國', '復興', '和平', '信義', '文化', '光明', '成功']
/** 由 id 導出穩定序號（供顯示） */
function serialFrom(id: string) {
  const n = hash(id)
  return `B${6000 + (n % 3000)}AA${10 + (n % 89)}-${1 + (n % 9)}`
}

function buildFleet() {
  const dcus: Dcu[] = []
  const meters: Meter[] = []
  let dcuSeq = 0, meterSeq = 0

  for (const city of CITIES) {
    const cityOfflineBias = city.name === '台北市' ? 0 : 0.02
    for (const d of city.districts) {
      const n = DCU_PER_DISTRICT_COUNT
      const r = mulberry32(hash(city.name + ':' + d.name))
      for (let i = 0; i < n; i++) {
        dcuSeq++
        const lng = d.center[0] + (r() - 0.5) * 0.028
        const lat = d.center[1] + (r() - 0.5) * 0.02
        const offlineP = (d.name === '信義區' ? 0.28 : d.name === '大安區' ? 0.18 : 0.12) + cityOfflineBias
        const online = r() > offlineP
        const id = `DCU-${pad(dcuSeq)}`
        // 頻點 1..10（穩定分佈）；狀態：斷線 > 停用(~8% 在線者) > 啟用正常
        const freq = 1 + (hash(id + ':f') % FREQ_COUNT)
        const disabled = online && r() < 0.08
        const state: DcuState = !online ? 'offline' : disabled ? 'disabled' : 'active'
        const stNo = mulberry32(hash(id + ':addr'))
        const address = `${city.name}${d.name}${STREETS[Math.floor(stNo() * STREETS.length)]}路${1 + Math.floor(stNo() * 480)}號`
        const dcu: Dcu = {
          id, lng, lat, online, city: city.name, district: d.name,
          lastSeen: online ? '前一小時' : `${1 + Math.floor(r() * 46)} 分鐘前`,
          freq, state, serial: serialFrom(id), address,
          code: `${CITY_CODE[city.name] ?? 'FDC'}-${pad(dcuSeq, 4)}`,
        }
        dcus.push(dcu)
        const mCount = METERS_PER_DCU
        for (let j = 0; j < mCount; j++) {
          meterSeq++
          const mr = mulberry32(hash(dcu.id + ':' + j))
          const mOffP = online ? 0.09 : 0.55
          const mOnline = mr() > mOffP
          // 一般電表都在 DCU 附近（不遠）
          meters.push({
            id: `KT${19000000 + meterSeq}`,
            lng: lng + (mr() - 0.5) * 0.006,
            lat: lat + (mr() - 0.5) * 0.0045,
            online: mOnline, dcuId: dcu.id, expectedDcuId: dcu.id, city: city.name, district: d.name,
            last: mOnline ? '前一小時' : `${1 + Math.floor(mr() * 58)} 分鐘前`,
          })
        }
      }
    }

    // ---- 跨區：沿相鄰行政區邊界，電表跨界但仍靠近其 DCU ----
    const ds = city.districts
    for (let a = 0; a + 1 < ds.length && a < 2; a++) {
      const A = ds[a], B = ds[a + 1]
      const inA = dcus.filter((x) => x.city === city.name && x.district === A.name)
      if (!inA.length) continue
      // A 區內最靠近 B 中心（即靠邊界）的 DCU
      const nearest = inA.reduce((best, x) =>
        Math.hypot(x.lng - B.center[0], x.lat - B.center[1]) < Math.hypot(best.lng - B.center[0], best.lat - B.center[1]) ? x : best, inA[0])
      const dirx = B.center[0] - nearest.lng, diry = B.center[1] - nearest.lat
      const len = Math.hypot(dirx, diry) || 1
      const cr = mulberry32(hash(city.name + ':cross'))
      // 在 B 側、越過邊界一點點、緊鄰 nearest DCU 放 2 顆斷線電表 → 收容於 A 的 DCU（跨區）
      for (let k = 0; k < 2; k++) {
        meterSeq++
        const t = 0.004 + k * 0.0012 // 約 400m 越界
        meters.push({
          id: `KT${19000000 + meterSeq}`,
          lng: nearest.lng + (dirx / len) * t + (cr() - 0.5) * 0.0008,
          lat: nearest.lat + (diry / len) * t + (cr() - 0.5) * 0.0008,
          online: false, dcuId: nearest.id, expectedDcuId: nearest.id, city: city.name, district: B.name,
          last: `${1 + Math.floor(cr() * 40)} 分鐘前`,
        })
      }
    }
  }

  // ---- 白名單 mock：約 1.2% 電表被「最近的另一台 DCU」收走（實際收容 ≠ 白名單應屬）----
  // 電表位置仍在白名單 DCU 附近 —— 模擬 RF 歸屬跑到鄰近頻點的真實情境。
  // TODO: 上線後 expectedDcuId 由白名單 API 提供，此段移除。
  const dcusByDist = new Map<string, Dcu[]>()
  dcus.forEach((d) => { const k = d.city + ':' + d.district; if (!dcusByDist.has(k)) dcusByDist.set(k, []); dcusByDist.get(k)!.push(d) })
  for (const m of meters) {
    if (hash(m.id + ':wl') % 83 !== 0) continue
    const pool = dcusByDist.get(m.city + ':' + m.district)
    if (!pool || pool.length < 2) continue
    let best: Dcu | null = null, bd = Infinity
    for (const d of pool) {
      if (d.id === m.expectedDcuId) continue
      const dd = Math.hypot(d.lng - m.lng, d.lat - m.lat)
      if (dd < bd) { bd = dd; best = d }
    }
    if (best) m.dcuId = best.id
  }

  return { dcus, meters }
}

const FLEET = buildFleet()
export const DCUS = FLEET.dcus
export const METERS = FLEET.meters
export const dcuById = new Map(DCUS.map((d) => [d.id, d]))
export const meterById = new Map(METERS.map((m) => [m.id, m]))

const metersByDcu = new Map<string, Meter[]>()
for (const m of METERS) { if (!metersByDcu.has(m.dcuId)) metersByDcu.set(m.dcuId, []); metersByDcu.get(m.dcuId)!.push(m) }
export const metersOfDcu = (id: string) => metersByDcu.get(id) ?? []
export const offlineMetersOfDcu = (id: string) => metersOfDcu(id).filter((m) => !m.online)

/* ---------- 歸屬錯誤（實際收容 ≠ 白名單應屬），分兩個方向 ----------
   他台連入 (in) ：實際收容於本台、白名單卻應屬別台 —— 從 metersByDcu 查
   連入他台 (out)：白名單應屬本台、實際卻跑去別台 —— 從 metersByExpected 查
   兩者是同一顆電表的一體兩面：對 A 是 out，對 B 就是 in。 */
const metersByExpected = new Map<string, Meter[]>()
for (const m of METERS) {
  if (m.expectedDcuId === m.dcuId) continue
  if (!metersByExpected.has(m.expectedDcuId)) metersByExpected.set(m.expectedDcuId, [])
  metersByExpected.get(m.expectedDcuId)!.push(m)
}
/** 白名單應屬本台、實際卻收容於別台的電表（連入他台） */
export const metersExpectedOf = (id: string) => metersByExpected.get(id) ?? []

/** 全部歸屬錯誤電表（實際收容 ≠ 白名單應屬） */
export const MISASSIGNED_METERS = METERS.filter((m) => m.dcuId !== m.expectedDcuId)
/** 某縣市（可再限行政區）的歸屬錯誤電表，依電表所在地判定 */
export function misassignedInCity(city: string, district = ''): Meter[] {
  return MISASSIGNED_METERS.filter((m) => m.city === city && (!district || m.district === district))
}

/* ---------- 讀表率（一組 DCU 的收容電表上線比） ---------- */
function readRateOf(dcus: Dcu[]): number {
  let total = 0, online = 0
  for (const d of dcus) { const s = dcuMeterStat(d.id); total += s.total; online += s.online }
  return total ? (online / total) * 100 : 0
}

/** 一組 DCU 的彙總：總數/連線數/斷線數/停用數/讀表率
    註：停用 DCU 仍屬「連線」（state='disabled' 時 online=true），故 dcuOnline ⊇ dcuDisabled */
export interface AggStat { dcuTotal: number; dcuOnline: number; dcuOffline: number; dcuDisabled: number; readRate: number }
export function aggStat(dcus: Dcu[]): AggStat {
  const dcuTotal = dcus.length
  const dcuOnline = dcus.filter((d) => d.online).length
  const dcuDisabled = dcus.filter((d) => d.state === 'disabled').length
  return { dcuTotal, dcuOnline, dcuOffline: dcuTotal - dcuOnline, dcuDisabled, readRate: readRateOf(dcus) }
}

/** 依地圖層級取範圍內 DCU（縣市層 district='' 代表整個縣市所有行政區） */
export function dcusInScope(level: 'taiwan' | 'city', city: string, district: string): Dcu[] {
  if (level === 'taiwan') return DCUS
  if (!district) return DCUS.filter((d) => d.city === city)
  return DCUS.filter((d) => d.city === city && d.district === district)
}

/** 依地圖層級取範圍內電表（全台層級回傳全部，關係地圖以 GPU 圖層渲染） */
export function metersInScope(level: 'taiwan' | 'city', city: string, district: string): Meter[] {
  if (level === 'taiwan') return METERS
  if (!district) return METERS.filter((m) => m.city === city)
  return METERS.filter((m) => m.city === city && m.district === district)
}

/* ---------- 統計（只依城市/行政區） ---------- */
export interface DistrictStat { name: string; dcuTotal: number; dcuOnline: number; dcuOffline: number; onlineRate: number; offlineRate: number; severity: Severity; meterOffline: number; readRate: number }
export function districtStats(city: string): DistrictStat[] {
  return districtsOf(city).map((d) => {
    const inDcus = DCUS.filter((x) => x.city === city && x.district === d.name)
    const dcuOffline = inDcus.filter((x) => !x.online).length
    const onlineRate = inDcus.length ? (inDcus.length - dcuOffline) / inDcus.length : 1
    const meterOffline = METERS.filter((m) => m.city === city && m.district === d.name && !m.online).length
    return { name: d.name, dcuTotal: inDcus.length, dcuOnline: inDcus.length - dcuOffline, dcuOffline, onlineRate, offlineRate: 1 - onlineRate, severity: classifySeverity(onlineRate), meterOffline, readRate: readRateOf(inDcus) }
  })
}
export const statByDistrict = (city: string, name: string) => districtStats(city).find((s) => s.name === name)

export function offlineDcus(city: string, district?: string): Dcu[] {
  return DCUS.filter((d) => d.city === city && !d.online && (!district || d.district === district))
}
export const offlineDcusAll = (): Dcu[] => DCUS.filter((d) => !d.online)

/** 全台層級：各縣市統計（斷線 DCU 佔比 → 嚴重度）；無 fleet 資料的縣市＝正常 */
export interface CityStat { name: string; dcuTotal: number; dcuOnline: number; dcuOffline: number; onlineRate: number; offlineRate: number; severity: Severity; readRate: number }
export function cityStats(): CityStat[] {
  return CITIES.map((c) => {
    const inDcus = DCUS.filter((d) => d.city === c.name)
    const dcuOffline = inDcus.filter((d) => !d.online).length
    const onlineRate = inDcus.length ? (inDcus.length - dcuOffline) / inDcus.length : 1
    return { name: c.name, dcuTotal: inDcus.length, dcuOnline: inDcus.length - dcuOffline, dcuOffline, onlineRate, offlineRate: 1 - onlineRate, severity: classifySeverity(onlineRate), readRate: readRateOf(inDcus) }
  })
}
export const statByCity = (name: string) => cityStats().find((s) => s.name === name)

/** 每台 DCU 電表統計（上線/總數/讀表/讀表率） */
export function dcuMeterStat(dcuId: string) {
  const ms = metersOfDcu(dcuId)
  const online = ms.filter((m) => m.online).length
  const total = ms.length
  return { total, online, read: online, readRate: total ? (online / total) * 100 : 0 }
}

/** 異常 DCU（默認列出）：範圍內「本身斷線」或「收容斷線電表」的 DCU。
    district='' 代表整個縣市（所有行政區）。 */
export function abnormalDcus(city: string, district: string): Dcu[] {
  return DCUS.filter((d) => d.city === city && (!district || d.district === district) && (!d.online || offlineMetersOfDcu(d.id).length > 0))
}

/* ---------- 關係地圖：某行政區問題裝置與收容關係 ---------- */
export type DcuRole = 'offline' | 'carriesOffline'
export interface RelationData {
  dcus: { dcu: Dcu; role: DcuRole; offlineMeterCount: number; crossDistrict: boolean }[]
  meters: { meter: Meter; crossDistrict: boolean }[]
  links: { dcuId: string; meterId: string; dashed: boolean }[]
}
/**
 * @deprecated 「問題 DCU（收容任一斷線電表）」定義已自 UI 移除 —— DCU 狀態只分 正常／斷線／停用。
 * 關係地圖改用 dcusInScope + metersInScope；此函式暫留供日後告警規則參考。
 * city='' → 全台（不限縣市）；district='' → 整個縣市
 */
export function relationData(city: string, district: string): RelationData {
  // district='' → 整個縣市（不做跨區判定）
  const inScope = (d: string) => !district || d === district
  const inCity = (c: string) => !city || c === city
  const offMetersInDistrict = METERS.filter((m) => inCity(m.city) && inScope(m.district) && !m.online)
  const dcuIds = new Set(offMetersInDistrict.map((m) => m.dcuId))
  DCUS.filter((d) => inCity(d.city) && inScope(d.district) && !d.online).forEach((d) => dcuIds.add(d.id))
  DCUS.filter((d) => inCity(d.city) && inScope(d.district)).forEach((d) => { if (offlineMetersOfDcu(d.id).length) dcuIds.add(d.id) })

  const dcus = [...dcuIds].map((id) => dcuById.get(id)!).filter(Boolean).map((dcu) => ({
    dcu, role: (dcu.online ? 'carriesOffline' : 'offline') as DcuRole,
    offlineMeterCount: offlineMetersOfDcu(dcu.id).length, crossDistrict: !!district && dcu.district !== district,
  }))

  const meterMap = new Map<string, { meter: Meter; crossDistrict: boolean }>()
  offMetersInDistrict.forEach((m) => meterMap.set(m.id, { meter: m, crossDistrict: false }))
  dcus.forEach(({ dcu, crossDistrict }) => {
    if (crossDistrict) return
    offlineMetersOfDcu(dcu.id).forEach((m) => { if (!meterMap.has(m.id)) meterMap.set(m.id, { meter: m, crossDistrict: !!district && m.district !== district }) })
  })
  const meters = [...meterMap.values()]
  const links = meters.map(({ meter }) => ({ dcuId: meter.dcuId, meterId: meter.id, dashed: !(dcuById.get(meter.dcuId)?.online ?? true) }))
  return { dcus, meters, links }
}
