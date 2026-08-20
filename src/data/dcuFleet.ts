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
  lastSeen: string // 最後連線時間（顯示用 MM-DD HH:mm）
  lastSeenMins: number // 距今幾分鐘（排序用）
  freq: number // 頻點 1..FREQ_COUNT
  state: DcuState // 啟用 / 停用 / 斷線
  serial: string // 序號
  address: string // 地址
  code: string // 編號
  office: string // 台電區處（＝電號前兩碼 + 區處名）
  officeCode: string // 區處代碼兩碼
  model: string // 設備型號
}
export interface Meter {
  id: string
  lng: number
  lat: number
  online: boolean
  disabled: boolean // 停用（統計一律排除，僅關係地圖圖面顯示）
  dcuId: string // 實際收容 DCU
  expectedDcuId: string // 白名單應屬 DCU；與 dcuId 不同＝歸屬錯誤
  city: string
  district: string
  last: string // 最後連線時間（顯示用）
  lastMins: number
  lastLp: string // 最後 LP 時間（顯示用）
  lastLpMins: number
  lastMn: string // 最後 MN（午夜讀表）時間，每日 1 筆
  lastMnMins: number
}

/* ---------- demo 時間基準 ----------
   固定基準時間，讓「最後連線時間 / 最後 LP 時間」每次載入都一樣、且可排序。
   TODO: 上線改用 API 回傳的 timestamp。 */
const DEMO_NOW = Date.UTC(2026, 7, 20, 6, 0) // 2026-08-20 14:00 (UTC+8)
const TZ_OFFSET = 8 * 3600_000
/** 基準時間距當日 00:00 幾分鐘 —— 超過這個值就不是「當日」 */
export const MINUTES_SINCE_MIDNIGHT = 14 * 60
/** 該時間戳是否落在當日（列表的「非當日標紅」用同一個判定） */
export const isSameDay = (minsAgo: number) => minsAgo <= MINUTES_SINCE_MIDNIGHT
/** 距今 n 分鐘 → 'MM-DD HH:mm' */
export function stampOf(minsAgo: number): string {
  const d = new Date(DEMO_NOW + TZ_OFFSET - minsAgo * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * 告警層級 —— 以「DCU 連線率」為判定基準（連線數 / 總數），也就是地圖區塊塗色的依據。
 * 比照系統總覽，只分三級：良好 ≥95%｜注意 85–95%｜警告 <85%。門檻可配置。
 * （原本的四級 normal/warn/abnormal/critical 已於 2026-08 依業主意見收斂為三級。）
 */
export type Severity = 'normal' | 'warn' | 'alert'
// 2026-08-20 依業主意見：良好 ≥97%｜注意 90–97%｜警告 <90%
export const ONLINE_RATE_THRESHOLDS = { normal: 0.97, warn: 0.90 }
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
/** 縣市 → 台電區處（代碼＝電號前兩碼）。TODO: 上線改由 API 的區處欄位提供 */
const CITY_OFFICE: Record<string, { code: string; name: string }> = {
  台北市: { code: '01', name: '北市區處' },
  新北市: { code: '02', name: '北縣區處' },
  台中市: { code: '05', name: '中市區處' },
  高雄市: { code: '08', name: '高市區處' },
}
export const officeOf = (city: string) => CITY_OFFICE[city] ?? { code: '00', name: '未指定區處' }
/** DCU 設備型號（demo 用；抽屜標題以 () 呈現） */
const DCU_MODELS = ['DCU-132', 'DCU-140', 'DCU-150S', 'DCU-160N']
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
        // 連線者最後連線在數分鐘內；斷線者停在數小時～三天前
        const lastSeenMins = online ? 1 + Math.floor(r() * 28) : 65 + Math.floor(r() * 4200)
        const office = officeOf(city.name)
        const dcu: Dcu = {
          id, lng, lat, online, city: city.name, district: d.name,
          lastSeen: stampOf(lastSeenMins), lastSeenMins,
          freq, state, serial: serialFrom(id), address,
          code: `${CITY_CODE[city.name] ?? 'FDC'}-${pad(dcuSeq, 4)}`,
          office: `${office.code}${office.name}`, officeCode: office.code,
          model: DCU_MODELS[hash(id + ':model') % DCU_MODELS.length],
        }
        dcus.push(dcu)
        const mCount = METERS_PER_DCU
        for (let j = 0; j < mCount; j++) {
          meterSeq++
          const mr = mulberry32(hash(dcu.id + ':' + j))
          const mOffP = online ? 0.09 : 0.55
          const mOnline = mr() > mOffP
          const mDisabled = mr() < 0.025 // 停用電表：統計一律排除，圖面仍畫
          const lastMins = mOnline ? 1 + Math.floor(mr() * 55) : 70 + Math.floor(mr() * 2800)
          // LP 每 15 分鐘一筆 → 正常情況比「最後連線」再晚一點點
          const lastLpMins = mOnline ? lastMins + Math.floor(mr() * 15) : lastMins + 15 + Math.floor(mr() * 240)
          // MN 每日 1 筆（00:0x）：正常者是今天凌晨，斷線者停在前幾天
          const lastMnMins = mOnline
            ? MINUTES_SINCE_MIDNIGHT - Math.floor(mr() * 55)
            : MINUTES_SINCE_MIDNIGHT + 1440 * (1 + Math.floor(mr() * 3))
          // 一般電表都在 DCU 附近（不遠）
          meters.push({
            id: `KT${19000000 + meterSeq}`,
            lng: lng + (mr() - 0.5) * 0.006,
            lat: lat + (mr() - 0.5) * 0.0045,
            online: mOnline, disabled: mDisabled, dcuId: dcu.id, expectedDcuId: dcu.id, city: city.name, district: d.name,
            last: stampOf(lastMins), lastMins,
            lastLp: stampOf(lastLpMins), lastLpMins,
            lastMn: stampOf(lastMnMins), lastMnMins,
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
        const lastMins = 80 + Math.floor(cr() * 1600)
        meters.push({
          id: `KT${19000000 + meterSeq}`,
          lng: nearest.lng + (dirx / len) * t + (cr() - 0.5) * 0.0008,
          lat: nearest.lat + (diry / len) * t + (cr() - 0.5) * 0.0008,
          online: false, disabled: false, dcuId: nearest.id, expectedDcuId: nearest.id, city: city.name, district: B.name,
          last: stampOf(lastMins), lastMins,
          lastLp: stampOf(lastMins + 30), lastLpMins: lastMins + 30,
          lastMn: stampOf(MINUTES_SINCE_MIDNIGHT + 1440), lastMnMins: MINUTES_SINCE_MIDNIGHT + 1440,
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

/** 白名單應屬本台的「全部」電表（含正常歸屬與連入他台）—— 統計基準 */
const metersByWhitelist = new Map<string, Meter[]>()
for (const m of METERS) {
  if (!metersByWhitelist.has(m.expectedDcuId)) metersByWhitelist.set(m.expectedDcuId, [])
  metersByWhitelist.get(m.expectedDcuId)!.push(m)
}
export const metersExpectedAll = (id: string) => metersByWhitelist.get(id) ?? []

/** 全部歸屬錯誤電表（實際收容 ≠ 白名單應屬）；統計一律排除停用 */
export const MISASSIGNED_METERS = METERS.filter((m) => m.dcuId !== m.expectedDcuId && !m.disabled)
/** 某縣市（可再限行政區）的歸屬錯誤電表，依電表所在地判定 */
export function misassignedInCity(city: string, district = ''): Meter[] {
  return MISASSIGNED_METERS.filter((m) => m.city === city && (!district || m.district === district))
}
/** 依地圖層級取範圍內的歸屬錯誤電表 */
export function misassignedInScope(level: 'taiwan' | 'city', city: string, district: string): Meter[] {
  return level === 'taiwan' ? MISASSIGNED_METERS : misassignedInCity(city, district)
}

/* ---------- LP 讀表率（一組 DCU 的白名單電表 LP 讀取比） ---------- */
function lpRateOf(dcus: Dcu[]): number {
  let total = 0, read = 0
  for (const d of dcus) { const s = dcuMeterStat(d.id); total += s.total; read += s.read }
  return total ? (read / total) * 100 : 0
}

/** 一組 DCU 的彙總：總數/連線數/斷線數/停用數/LP讀表率/歸屬錯誤電表數
    註：停用 DCU 仍屬「連線」（state='disabled' 時 online=true），故 dcuOnline ⊇ dcuDisabled */
export interface AggStat { dcuTotal: number; dcuOnline: number; dcuOffline: number; dcuDisabled: number; lpRate: number; misassigned: number }
export function aggStat(dcus: Dcu[]): AggStat {
  const dcuTotal = dcus.length
  const dcuOnline = dcus.filter((d) => d.online).length
  const dcuDisabled = dcus.filter((d) => d.state === 'disabled').length
  const ids = new Set(dcus.map((d) => d.id))
  const misassigned = MISASSIGNED_METERS.filter((m) => ids.has(m.expectedDcuId) || ids.has(m.dcuId)).length
  return { dcuTotal, dcuOnline, dcuOffline: dcuTotal - dcuOnline, dcuDisabled, lpRate: lpRateOf(dcus), misassigned }
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
export interface DistrictStat { name: string; dcuTotal: number; dcuOnline: number; dcuOffline: number; onlineRate: number; offlineRate: number; severity: Severity; meterOffline: number; lpRate: number }
export function districtStats(city: string): DistrictStat[] {
  return districtsOf(city).map((d) => {
    const inDcus = DCUS.filter((x) => x.city === city && x.district === d.name)
    const dcuOffline = inDcus.filter((x) => !x.online).length
    const onlineRate = inDcus.length ? (inDcus.length - dcuOffline) / inDcus.length : 1
    const meterOffline = METERS.filter((m) => m.city === city && m.district === d.name && !m.online && !m.disabled).length
    return { name: d.name, dcuTotal: inDcus.length, dcuOnline: inDcus.length - dcuOffline, dcuOffline, onlineRate, offlineRate: 1 - onlineRate, severity: classifySeverity(onlineRate), meterOffline, lpRate: lpRateOf(inDcus) }
  })
}
export const statByDistrict = (city: string, name: string) => districtStats(city).find((s) => s.name === name)

export function offlineDcus(city: string, district?: string): Dcu[] {
  return DCUS.filter((d) => d.city === city && !d.online && (!district || d.district === district))
}
export const offlineDcusAll = (): Dcu[] => DCUS.filter((d) => !d.online)

/** 全台層級：各縣市統計（斷線 DCU 佔比 → 嚴重度）；無 fleet 資料的縣市＝正常 */
export interface CityStat { name: string; dcuTotal: number; dcuOnline: number; dcuOffline: number; onlineRate: number; offlineRate: number; severity: Severity; lpRate: number; lat: number }
/** 依緯度由北到南排序（業主指定的預設順序） */
export function cityStats(): CityStat[] {
  return CITIES.map((c) => {
    const inDcus = DCUS.filter((d) => d.city === c.name)
    const dcuOffline = inDcus.filter((d) => !d.online).length
    const onlineRate = inDcus.length ? (inDcus.length - dcuOffline) / inDcus.length : 1
    const lat = c.districts.reduce((s, d) => s + d.center[1], 0) / (c.districts.length || 1)
    return { name: c.name, dcuTotal: inDcus.length, dcuOnline: inDcus.length - dcuOffline, dcuOffline, onlineRate, offlineRate: 1 - onlineRate, severity: classifySeverity(onlineRate), lpRate: lpRateOf(inDcus), lat }
  }).sort((a, b) => b.lat - a.lat)
}
export const statByCity = (name: string) => cityStats().find((s) => s.name === name)

/**
 * 每台 DCU 的電表統計 —— 依業主 2026-08-20 意見：
 *   · 依「白名單」統計（expectedDcuId），不是實際收容 —— 他台連入不算，連入他台的要算
 *   · 一律排除停用電表（停用只在關係地圖圖面上看得到，不進任何統計）
 * 連線率＝連線數/白名單總數；LP 讀表率另有其值（LP 每 15 分鐘一筆，會低於連線率）。
 */
export function dcuMeterStat(dcuId: string) {
  const ms = metersExpectedAll(dcuId).filter((m) => !m.disabled)
  const total = ms.length
  const online = ms.filter((m) => m.online).length
  const connectRate = total ? (online / total) * 100 : 0
  // LP 讀表率 = 連線率 × 該台的穩定係數（0.88–1.00）；TODO: 上線改讀 API 的 lp_rate
  const factor = Math.min(1, 0.88 + (hash(dcuId + ':lp') % 130) / 1000)
  const lpRate = connectRate * factor
  return { total, online, read: Math.round((lpRate / 100) * total), connectRate, lpRate }
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
