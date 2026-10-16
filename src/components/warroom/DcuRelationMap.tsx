import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  dcuById, meterById as allMeterById, metersInScope, dcusInScope,
  MISASSIGNED_METERS, misassignedInCity, CITIES, cityStats, districtStats, FREQ_COUNT, districtsOf, areaMeterCount, metersExpectedAll, metersOfDcu,
  type Dcu, type DcuState, type Meter,
} from '@/data/dcuFleet'
import { dcuStat, misassignedIn, misassignedOut, type MisDir } from '@/data/dcuMetrics'
import { dcuInfo } from '@/data/dcuInfo'
import { townsGeo, countiesGeoAll, INSET_COUNTY_IDS } from '@/data/geo/geo'
import { IslandShortcuts } from './IslandShortcuts'
import { addSelectedMeterLayer, setSelectedMeter } from './selectedMeterLayer'
import { registerMap, unregisterMap, pushCamera, pullCamera, pushHistory, popHistory, clearHistory, setCameraScope, scopeKey } from './mapCamera'
import { aggregateByArea, separateAggPoints, toAggFeatureCollection, MIN_SEP_DEG, citySepDeg } from './aggPoints'
import {
  GROUP_COLORS, DIM_OPACITY, STATE_COLOR, STATE_LABEL, freqColor, pinColor, MIS_COLOR, STATUS,
  SEVERITY_COLOR, SEVERITY_STROKE, MAP_BG, FREQ_COLORS, OUTSIDE_FILL, OUTSIDE_OPACITY,
  AREA_HOVER_LINE, AREA_HOVER_LINE_WIDTH, AREA_HOVER_FILL_OPACITY,
} from './warroomConfig'
import { registerMarkerIcons, ICON_MIS_METER, ICON_METER_DISABLED, ICON_MIS_AGG, dcuIconName } from './markerIcons'
import { buildLabelPoints } from './polyLabels'
import { useWarroom, MAX_WATCH } from '@/store/useWarroom'

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
 * DCU DOM marker builder —— 2026-08-27 依業主意見**一律方形**，底色＝頻點色：
 *   方形（頻點色）      ＝ 正常
 *   方形（灰）          ＝ 停用
 *   方形 + 白 ✕（紅）   ＝ 斷線（與正常同尺寸）
 * 形狀規則因此變得乾淨：**方形＝DCU、圓形＝電表**，不必靠顏色分辨裝置類型。
 */
function dcuElement(state: DcuState, cross: boolean, color: string) {
  const off = state === 'offline'
  const wrap = document.createElement('div')
  wrap.className = 'war-marker'
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer' })
  const shape = document.createElement('div')
  shape.className = 'war-shape'
  Object.assign(shape.style, {
    // 2026-09-03 依業主意見：斷線 DCU 與正常 DCU 同尺寸（原本斷線大一號）
    width: '20px', height: '20px',
    borderRadius: '5px',
    background: off ? STATE_COLOR.offline : state === 'disabled' ? STATE_COLOR.disabled : color,
    border: '3px solid #FFFFFF', display: 'grid', placeItems: 'center',
    boxShadow: '0 1px 4px rgba(42,33,37,.35)', outline: cross ? '2px dashed #2A2125' : 'none', outlineOffset: '2px',
  })
  if (off) shape.innerHTML = '<span style="color:#fff;font-size:12px;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.45)">✕</span>'
  wrap.appendChild(shape)
  if (cross) {
    const tag = document.createElement('span')
    tag.textContent = '跨區'
    Object.assign(tag.style, { fontSize: '9px', fontWeight: '700', color: '#2A2125', background: '#fff', border: '1px solid #E7DBDD', borderRadius: '4px', padding: '0 3px' })
    wrap.appendChild(tag)
  }
  return { wrap, shape }
}

/** 歸屬錯誤電表的 hover 卡（只有歸屬錯誤的電表才有 hover）：表號／連線 DCU／歸屬 DCU */
interface MisPop { id: string; dir: MisDir | ''; actualId: string; expectedId: string; on: number; x: number; y: number }
/** DCU hover 卡（依業主 2026-08-20 指定的欄位順序） */
interface DcuPop {
  dcu: Dcu
  ip: string; signal: number; connType: string
  online: number; total: number; lpRate: number
  misIn: number; misOut: number
  x: number; y: number
}

/**
 * 區塊 hover 卡（L1 縣市／L2 行政區）。欄位格式比照斷線地圖的區塊 hover，
 * 內容換成這張圖關心的：DCU 數、電表數、歸屬錯誤電表數（歸屬錯誤率 2026-09-29 移除）。
 * 電表數與歸屬錯誤都依「電表所在地」、排除停用，兩者同口徑。
 */
interface PolyPop { name: string; dcu: number; meters: number; mis: number; x: number; y: number }
function makePolyPop(name: string, x: number, y: number): PolyPop {
  const st = useWarroom.getState()
  const city = st.level === 'taiwan' ? name : st.city
  const district = st.level === 'taiwan' ? '' : name
  return {
    name, x, y,
    dcu: dcusInScope('city', city, district).length,
    meters: areaMeterCount(city, district),
    mis: misassignedInCity(city, district).length,
  }
}

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
 * 歸屬錯誤六邊形在 L2 的縮放 —— 圖示本身 40px，L2 縮成約 25px，
 * 市區的小行政區才不會整塊被蓋掉（2026-09-29 業主意見「L2 幾乎看不到區域」）。
 */
const MIS_AGG_L2_SCALE = 0.62
const MIS_AGG_L2_PX = 40 * MIS_AGG_L2_SCALE

/**
 * 電表圖層的最小縮放層級 —— 低於此縮放不載入任何電表點。
 * 百萬級電表時電表只該存在於街道級視野內；這裡先把「縮放層級決定圖層存在與否」這條路鋪好。
 */
const METER_MIN_ZOOM = 13

/** 可點擊的裝置圖層（命中圈＋歸屬錯誤圖示）—— 空白處判定與雙擊退回都用這組 */
const DEVICE_LAYERS = ['rel-meter-hit', 'rel-dcu-hit', 'rel-mis-dot'] as const

/** L3 的行政區界線（街道底圖上只留淡淡一條當方位參照，不搶裝置的視覺） */
const BOUNDARY_LINE = '#A2989C'
/**
 * L3 的縣市（L2）外框 —— 2026-09-29 業主意見：L3 看不出縣市邊界在哪。
 * 行政區界線刻意畫得很淡，縣市外框跟著一樣淡就分不出來；改成深灰實線＋白色外暈，
 * 灰色遮罩上、街道底圖上都看得清楚。
 */
const COUNTY_LINE = '#4A5565'
/** 目前縣市的外框（不含其他縣市） */
function countyOutline(city: string) {
  return {
    type: 'FeatureCollection' as const,
    features: countiesGeoAll().features.filter((f: any) => f.properties.name === city),
  }
}

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
          id: m.id, dcuId: m.dcuId, expected: m.expectedDcuId, freq: d?.freq ?? 0,
          on: m.online ? 1 : 0, dis: m.disabled ? 1 : 0,
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
  const navRef = useRef<maplibregl.NavigationControl | null>(null)
  const navOnRef = useRef(false)

  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)
  const pinnedDcuIds = useWarroom((s) => s.pinnedDcuIds)
  const resetNonce = useWarroom((s) => s.resetNonce)
  const refitNonce = useWarroom((s) => s.refitNonce)
  const selectDcu = useWarroom((s) => s.selectDcu)
  const unwatchDcu = useWarroom((s) => s.unwatchDcu)
  const clearWatch = useWarroom((s) => s.clearWatch)
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
  const [polyHover, setPolyHover] = useState<PolyPop | null>(null)
  // 電表圖層是否存在（由縮放層級決定）
  const [metersOn, setMetersOn] = useState(false)
  /**
   * 歸屬錯誤圖層 —— **疊加式**，不是模式切換。
   * 打開＝把範圍內「全部」歸屬錯誤電表與它們的兩條歸屬線畫出來（關閉時只畫選取 DCU 的）。
   * 2026-08-27 依業主意見改的：原本它會把 DCU 換成只剩相關那幾台、並強制關掉一般電表，
   * 等於和「正常電表」互斥；現在兩個開關各自獨立，要一起開也可以。
   */
  const [showMis, setShowMis] = useState(true)
  /**
   * 一般（正常）電表圖層的**手動**開關 —— 業主要求可以自己關掉。
   * 唯一的另一個條件是縮放門檻 `METER_MIN_ZOOM`（AND）：關掉一定不畫，
   * 打開仍要放大到街道級才會載入（百萬級電表的守門條件不能拿掉）。
   * 不再受歸屬錯誤圖層影響 —— 兩層可以同時存在。
   */
  /** 歸屬錯誤的兩條指向線 —— 線多的時候很吵，獨立成一個開關（2026-09-03 業主意見） */
  const [showMisLines, setShowMisLines] = useState(true)
  /**
   * 「全部電表」—— 2026-09-23 依業主意見（效能）**預設關閉**。
   * 平常只畫「觀察中 DCU」的電表（見 watchMeters）；要看整區分佈才手動打開，
   * 打開後仍受 z13 門檻與 bbox 裁切保護。
   */
  const [showMeters, setShowMeters] = useState(false)
  const showMetersRef = useRef(showMeters)
  showMetersRef.current = showMeters
  /**
   * 隱藏中的頻點 —— 業主要在關係地圖上直接分辨／篩選不同頻點的電表。
   * 頻點是 DCU 的屬性，電表跟著實際收容 DCU 的頻點走；隱藏某頻點＝該頻點的 DCU 與電表一起收掉。
   * 歸屬錯誤圖層不受影響（它本來就是要跨頻點對照的）。
   */
  const [hiddenFreqs, setHiddenFreqs] = useState<number[]>([])
  const hiddenFreqsRef = useRef(hiddenFreqs)
  hiddenFreqsRef.current = hiddenFreqs

  // 範圍內「所有」電表 → GPU 圖層，依所屬 DCU 頻點著色
  /**
   * L3 的電表 —— 2026-09-03 依業主意見改為載入**整個縣市**，
   * 選取區域以外的鄰區也要看得到電表與 DCU（跨區歸屬才讀得出來）；
   * 視覺重心由「區域外塗灰」維持，資料量仍受 z13 門檻與 bbox 裁切保護。
   */
  const districtMeters = useMemo(() => (pickMode ? [] : metersInScope(level, city, '')), [level, city, pickMode])

  /** 範圍內的歸屬錯誤電表（不受縮放門檻限制，數量本來就少） */
  const scopeMis = useMemo(
    () => (level === 'taiwan' ? MISASSIGNED_METERS : misassignedInCity(city, district)),
    [level, city, district],
  )

  /**
   * 觀察中 DCU 的電表 —— 白名單應屬它的（含跑去別台的「連入他台」）＋實際收容於它的
   * （含別台跑進來的「他台連入」）。最多 3 台 × 約 80 具，數量小，所以**不受 z13 門檻限制**。
   */
  const watchMeters = useMemo(() => {
    if (pickMode) return [] as Meter[]
    const byId = new Map<string, Meter>()
    pinnedDcuIds.forEach((id) => {
      metersExpectedAll(id).forEach((m) => byId.set(m.id, m))
      metersOfDcu(id).forEach((m) => byId.set(m.id, m))
    })
    return [...byId.values()]
  }, [pinnedDcuIds, pickMode])

  /** 觀察中 DCU 相關的歸屬錯誤電表（兩個方向） */
  const watchMis = useMemo(() => {
    const byId = new Map<string, Meter>()
    pinnedDcuIds.forEach((id) => {
      misassignedIn(id).forEach((m) => byId.set(m.id, m))
      misassignedOut(id).forEach((m) => byId.set(m.id, m))
    })
    return [...byId.values()]
  }, [pinnedDcuIds])

  /**
   * 範圍內「全部」DCU —— 狀態一律 正常／斷線／停用。
   * 跨區：DCU 在範圍外、但其收容電表跨界落在範圍內 → 補進來並標示跨區。
   */
  const dcus = useMemo(() => {
    if (pickMode) return [] as { dcu: Dcu; cross: boolean }[]
    const scoped = dcusInScope(level, city, '')
    const seen = new Set(scoped.map((d) => d.id))
    const out = scoped.map((dcu) => ({ dcu, cross: false }))
    districtMeters.forEach((m) => {
      if (seen.has(m.dcuId)) return
      const d = dcuById.get(m.dcuId)
      if (d) { seen.add(d.id); out.push({ dcu: d, cross: true }) }
    })
    return out
  }, [level, city, districtMeters, pickMode])

/**
   * 歸屬錯誤電表的兩端 DCU（實際收容 / 白名單應屬）。
   * 歸屬錯誤圖層打開時要補進地圖，否則虛線會指向一台沒畫出來的 DCU。
   */
  const misRelatedDcus = useMemo(() => {
    const ids = new Set<string>()
    // 觀察中 DCU 的歸屬錯誤一律要畫兩端；整層歸屬錯誤圖層打開時再併上範圍內全部
    ;[...watchMis, ...(showMis ? scopeMis : [])].forEach((m) => { ids.add(m.dcuId); ids.add(m.expectedDcuId) })
    return [...ids].map((id) => dcuById.get(id)).filter(Boolean) as Dcu[]
  }, [scopeMis, watchMis, showMis])

  /**
   * 這張圖要畫的 DCU＝範圍內的 DCU，**再併上**歸屬錯誤兩端跑到範圍外的那幾台。
   * （原本歸屬錯誤圖層是把清單整個換掉，等於順手把其他 DCU 藏起來，那才是互斥的來源。）
   */
  const dcuList = useMemo(() => {
    const seen = new Set(dcus.map((d) => d.dcu.id))
    const extra = misRelatedDcus
      .filter((d) => !seen.has(d.id))
      .map((dcu) => ({ dcu, cross: true })) // 範圍外補進來的，比照跨區標示
    return extra.length ? [...dcus, ...extra] : dcus
  }, [dcus, misRelatedDcus])

  /** 選取行政區內各頻點的電表數（排除停用，與統計口徑一致） */
  const freqCounts = useMemo(() => {
    const counts = new Array(FREQ_COUNT).fill(0) as number[]
    if (pickMode) return counts
    metersInScope(level, city, district).forEach((m) => {
      if (m.disabled) return
      const f = dcuById.get(m.dcuId)?.freq
      if (f) counts[f - 1]++
    })
    return counts
  }, [level, city, district, pickMode])

  // DCU 太多時（整個縣市）改用 GPU 標記，避免上百個 DOM marker 拖累拖曳
  const gpuDcus = dcuList.length > DOM_MARKER_MAX
  const lookupMeter = (id: string) => allMeterById.get(id) ?? null

  // 電表圖層只在街道級縮放才存在（見 applyMeters）；metersRef 給地圖事件用最新的資料
  const metersRef = useRef<Meter[]>(districtMeters)
  const watchMetersRef = useRef<Meter[]>(watchMeters)
  useEffect(() => { metersRef.current = districtMeters; watchMetersRef.current = watchMeters })

  /** 組 DCU hover 卡的內容（收容統計向 dcuMetrics 要，有快取） */
  const makeDcuPop = (dcuId: string, x: number, y: number): DcuPop | null => {
    const d = dcuById.get(dcuId)
    if (!d) return null
    const s = dcuStat(dcuId)
    const ex = dcuInfo(dcuId) // IP／訊號強度／通訊型式（demo 推導值，上線改 API 欄位）
    return {
      dcu: d, ip: ex.ip, signal: ex.signal, connType: ex.connType,
      online: s.online, total: s.total, lpRate: s.lpRate,
      misIn: misassignedIn(dcuId).length, misOut: misassignedOut(dcuId).length, x, y,
    }
  }
  const makeDcuPopRef = useRef(makeDcuPop)
  makeDcuPopRef.current = makeDcuPop

/**
   * DCU GPU 標記：與 DOM marker 同一套編碼（方形、底色＝頻點色）。
   * symbol 圖層沒辦法像 circle 那樣吃 `['get','color']`，所以每個頻點各註冊一張
   * 方形圖示（見 markerIcons.ts），feature 自帶 `icon` 指名要用哪一張。
   */
  const buildDcuPoints = () => {
    const list = dcuList
    return {
      type: 'FeatureCollection' as const,
      features: list.map(({ dcu }) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [dcu.lng, dcu.lat] },
        properties: {
          id: dcu.id,
          freq: dcu.freq,
          color: dcu.state === 'disabled' ? STATE_COLOR.disabled : freqColor(dcu.freq),
          off: dcu.state === 'offline' ? 1 : 0,
          icon: dcuIconName(dcu.state, dcu.freq),
          // 觀察中的 DCU 在 GPU 模式也要有外環（DOM 模式由 marker 的 box-shadow 畫）
          ring: pinColor(pinnedDcuIds, dcu.id) ?? '',
        },
      })),
    }
  }

  /**
   * 行政區色塊（L1／L2 的選取模式）—— 依業主意見改成與 DCU 故障地圖完全相同的
   * dashboard 圖層：純色塊底圖、同一組告警色，L3 才回到街道底圖與自由縮放。
   */
  const buildPoly = () => {
    if (level === 'taiwan') {
      const stats = new Map(cityStats().map((s) => [s.name, s]))
      return ({
        type: 'FeatureCollection' as const,
        // 金門／馬祖畫進主圖會被取景裁掉，比照系統總覽與斷線地圖排除、改由 IslandShortcuts 呈現
        features: countiesGeoAll().features.filter((f: any) => !INSET_COUNTY_IDS.includes(f.properties.rid)).map((f: any) => {
          const name = f.properties.name as string
          const sev = stats.get(name)?.severity ?? 'normal'
          return { ...f, properties: { ...f.properties, name, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } }
        }),
      })
    }
    const stats = new Map(districtStats(city).map((s) => [s.name, s]))
    return ({
      type: 'FeatureCollection' as const,
      features: townsGeo(city).features.map((f: any) => {
        const name = f.properties.rname as string
        const sev = stats.get(name)?.severity ?? 'normal'
        // outside＝L3 時「選取區域以外」的鄰區，畫面上塗灰
        const outside = !!district && name !== district
        return { ...f, properties: { ...f.properties, name, outside, sevColor: SEVERITY_COLOR[sev], sevStroke: SEVERITY_STROKE[sev] } }
      }),
    })
  }
/**
   * L1／L2 的歸屬錯誤電表匯總球（點位本身在這個層級沒有意義）。
   *
   * 2026-08-27 依業主意見「不用太分裂」，從 maplibre 的地理群聚（supercluster）
   * 改成**依行政層級聚合**：L1 一個縣市一顆、L2 一個行政區一顆。
   * 地理群聚是照螢幕距離分群的，一放大就裂成一堆小球、位置還會飄；
   * 改成照行政區聚合之後只有「縣市」「行政區」兩級，縮放不會再改變分群，
   * 也不會有落單的點掉到群集外面。
   *
   * 位置取該區歸屬錯誤電表的平均座標 —— 落在問題實際發生的地方，
   * 也不會和區名標籤（畫在多邊形的標記點）疊在一起。
   */
  const buildMisPoints = () => {
    const agg = aggregateByArea(scopeMis, (m) => (level === 'taiwan' ? m.city : m.district), (m) => m.lng, (m) => m.lat)
    // 與斷線地圖同一套：平均座標可能互相重疊（台北／新北），推開再畫。L2 間距依縣市大小換算
    let sep: number = MIN_SEP_DEG.taiwan
    if (level !== 'taiwan') {
      let W = 180, S = 90, E = -180, N = -90
      townsGeo(city).features.forEach((f: any) => { const [w, s, e, n] = bboxOf(f.geometry); W = Math.min(W, w); S = Math.min(S, s); E = Math.max(E, e); N = Math.max(N, n) })
      sep = citySepDeg([W, S, E, N], containerRef.current, MIS_AGG_L2_PX)
    }
    return toAggFeatureCollection(separateAggPoints(agg, sep))
  }

  /**
   * 最新一次 render 的建圖函式。load 事件可能晚到（街道底圖樣式從網路載入），
   * 期間若已切換範圍，直接呼叫 effect 閉包裡的舊版本會以「初始範圍」建圖、停在錯的層級。
   */
  const latestRef = useRef<{
    buildPoly: typeof buildPoly; buildMisPoints: typeof buildMisPoints
    applyPickMode: () => void; buildMarkers: () => void; fitScope: () => void
  } | null>(null)

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
    // 右上角讓給地圖頁籤，縮放控制移到右下（L1／L2 會整個收起，見 applyLock）
    navRef.current = new maplibregl.NavigationControl({ showCompass: false })
    mapRef.current = map
    map.on('load', () => {
      registerMarkerIcons(map)

      /* ---- L1／L2 的 dashboard 圖層 ----
         街道圖磚在縣市層級只是雜訊，這裡蓋一層不透明底色把它遮掉，視覺與故障地圖一致；
         切到 L3（行政區）時把這層關掉，街道底圖就回來了。 */
      map.addLayer({ id: 'rel-blank', type: 'background', paint: { 'background-color': MAP_BG } })

      // 行政區選取層（L1／L2）—— 告警色與故障地圖同一組
      polyFC.current = latestRef.current!.buildPoly()
      map.addSource('rel-poly', { type: 'geojson', data: polyFC.current })
      map.addLayer({ id: 'rel-poly-fill', type: 'fill', source: 'rel-poly', paint: { 'fill-color': ['get', 'sevColor'], 'fill-opacity': 0.8 } })
      map.addLayer({ id: 'rel-poly-line', type: 'line', source: 'rel-poly', paint: { 'line-color': ['get', 'sevStroke'], 'line-width': 0.9 } })
      // 滑過的區塊（各層級都有）：提亮＋灰色描邊。L3 的鄰區平常塗灰，滑過時要看得出「可以點過去」
      map.addLayer({
        id: 'rel-poly-hover-fill', type: 'fill', source: 'rel-poly', filter: ['==', ['get', 'name'], ''],
        paint: { 'fill-color': '#FFFFFF', 'fill-opacity': AREA_HOVER_FILL_OPACITY },
      })
      map.addLayer({
        id: 'rel-poly-hover-line', type: 'line', source: 'rel-poly', filter: ['==', ['get', 'name'], ''],
        paint: { 'line-color': AREA_HOVER_LINE, 'line-width': AREA_HOVER_LINE_WIDTH },
      })
      // 縣市外框（只在 L3 顯示，見 applyPickMode）：白色外暈墊底，再畫深灰實線
      map.addSource('rel-county', { type: 'geojson', data: EMPTY_FC_DATA as any })
      map.addLayer({
        id: 'rel-county-halo', type: 'line', source: 'rel-county',
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 5, 'line-opacity': 0.75 },
      })
      map.addLayer({
        id: 'rel-county-line', type: 'line', source: 'rel-county',
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': COUNTY_LINE, 'line-width': 2.2, 'line-opacity': 0.9 },
      })
      // 區名另用「一名一點」的 source（直接掛多邊形會讓離島各標一次）
      map.addSource('rel-poly-labels', { type: 'geojson', data: buildLabelPoints(polyFC.current) as any })
      map.addLayer({
        id: 'rel-poly-label', type: 'symbol', source: 'rel-poly-labels',
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Regular'] },
        paint: { 'text-color': '#3A2F33', 'text-halo-color': '#fff', 'text-halo-width': 1.4 },
      })

      /* ---- L1／L2：歸屬錯誤電表匯總球（一個行政區一顆，見 buildMisPoints） ---- */
      map.addSource('rel-mis-agg', { type: 'geojson', data: latestRef.current!.buildMisPoints() as any })
      // 2026-09-23 依業主意見統一一個尺寸，數量只看球上的數字（原本依數量分兩級大小）
      // 形狀是六邊形（2026-08-28 業主意見）：和電表的小圓點區隔開，一眼看出是「一群」
      map.addLayer({
        id: 'rel-mis-agg-circle', type: 'symbol', source: 'rel-mis-agg',
        layout: {
          'icon-image': ICON_MIS_AGG,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': 0.9 },
      })
      map.addLayer({
        id: 'rel-mis-agg-count', type: 'symbol', source: 'rel-mis-agg',
        layout: {
          'text-field': ['to-string', ['get', 'count']],
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#fff' },
      })

      // 電表 GPU 圖層（所有電表，依所屬 DCU 頻點色）
      map.addSource('rel-meters', { type: 'geojson', data: EMPTY_FC_DATA as any, promoteId: 'id' })
      map.addLayer({
        id: 'rel-meter-dots', type: 'circle', source: 'rel-meters',
        filter: ['!=', ['get', 'dis'], 1],
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
      // 停用電表：灰色空心圓圈（與實心小圓點、畫叉圓圈區分）——2026-09-03 業主意見
      map.addLayer({
        id: 'rel-meter-disabled', type: 'symbol', source: 'rel-meters',
        filter: ['==', ['get', 'dis'], 1],
        layout: {
          'icon-image': ICON_METER_DISABLED,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.42, 14, 0.62, 16, 0.86],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      })
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

      // DCU GPU 標記（DCU 數量大時取代 DOM marker）—— 方形，底色＝頻點色。
      // 正常／停用／斷線走同一層，差別只在 feature 的 `icon` 指到哪一張圖示。
      map.addSource('rel-dcus', { type: 'geojson', data: EMPTY_FC_DATA })
      // 觀察中 DCU 的外環（GPU 模式）—— 觀察組別色，畫在方形圖示底下
      map.addLayer({
        id: 'rel-dcu-ring', type: 'circle', source: 'rel-dcus',
        filter: ['!=', ['get', 'ring'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 9, 10, 11, 13, 14, 16, 18],
          'circle-color': '#FFFFFF',
          'circle-opacity': 0.9,
          'circle-stroke-color': ['get', 'ring'],
          'circle-stroke-width': 3,
        },
      })
      map.addLayer({
        id: 'rel-dcu-dots', type: 'symbol', source: 'rel-dcus',
        layout: {
          'icon-image': ['get', 'icon'],
          // 斷線圖示本身畫得比較大，這裡用同一組 size，視覺上斷線自然大一號
          'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.42, 10, 0.6, 13, 0.85, 16, 1.1],
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
      /** 游標下有沒有裝置 —— L3 的區域點擊要讓位給裝置 */
      const onDevice = (pt: maplibregl.Point) => {
        const layers = [...DEVICE_LAYERS].filter((l) => map.getLayer(l))
        return map.queryRenderedFeatures(pt, { layers }).length > 0
      }
      /** 滑過區塊的描邊／提亮（name='' 代表清除） */
      const hoverArea = (name: string) => {
        ;['rel-poly-hover-fill', 'rel-poly-hover-line'].forEach((id) => map.getLayer(id) && map.setFilter(id, ['==', ['get', 'name'], name]))
      }
      /**
       * 區塊 hover —— L1／L2：描邊＋提示卡。L3（畫整個縣市、鄰區塗灰）：滑過鄰區只提亮＋描邊、
       * 游標變手指，**不出提示卡**（2026-09-24 業主意見）；目前這一區不做任何反應。
       * 游標在裝置上時讓位給裝置。
       */
      map.on('mousemove', 'rel-poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return
        const name = f.properties!.name as string
        if (!pickModeRef.current && onDevice(e.point)) { hoverArea(''); setPolyHover(null); return }
        const current = !pickModeRef.current && name === useWarroom.getState().district
        hoverArea(current ? '' : name)
        map.getCanvas().style.cursor = current ? '' : 'pointer'
        // 2026-09-24 業主意見：L3 只要提亮＋描邊，不出提示卡；提示卡只留給 L1／L2
        setPolyHover(pickModeRef.current ? makePolyPop(name, e.point.x, e.point.y) : null)
      })
      map.on('mouseleave', 'rel-poly-fill', () => { map.getCanvas().style.cursor = ''; hoverArea(''); setPolyHover(null) })
      map.on('click', 'rel-poly-fill', (e) => {
        const f = e.features?.[0]; if (!f) return
        // 點在匯總球上 → 交給匯總球處理。兩個 handler 同一次點擊都會觸發：
        // 先跑的這個若先下鑽，匯總球的 handler 讀到的就已是新層級，會把縣市名當行政區名
        // 設進去，畫面跳到一個不存在、完全沒數值的行政區（2026-09-23 業主回報）。
        if (map.getLayer('rel-mis-agg-circle') && map.queryRenderedFeatures(e.point, { layers: ['rel-mis-agg-circle'] }).length) return
        const name = f.properties!.name as string
        const st = useWarroom.getState()
        if (pickModeRef.current || !onDevice(e.point)) hoverArea('')
        if (st.level === 'taiwan') { setPolyHover(null); if (CITIES.some((c) => c.name === name)) setCity(name); return }
        // L2 選區下鑽；L3 點鄰區＝直接移動過去（點到裝置就不算）
        if (pickModeRef.current) { setPolyHover(null); setDistrict(name); return }
        if (name !== st.district && !onDevice(e.point)) { setPolyHover(null); setDistrict(name) }
      })
      /* 匯總球：點一下＝下鑽到該區（和直接點區塊同一個行為，不再是「展開群集」）。
         球蓋住底下的多邊形，所以 hover 也要自己接手，否則游標移上去提示會消失。 */
      map.on('click', 'rel-mis-agg-circle', (e) => {
        const f = e.features?.[0]; if (!f) return
        const name = f.properties!.name as string
        const st = useWarroom.getState()
        setPolyHover(null); hoverArea('')
        // 只往下一層：L1 → 該縣市（L2）；L2 → 該行政區（L3）。匯總球只存在於 L1／L2。
        if (st.level === 'taiwan') { if (CITIES.some((c) => c.name === name)) setCity(name) }
        else if (!st.district && districtsOf(st.city).some((d) => d.name === name)) setDistrict(name)
      })
      map.on('mousemove', 'rel-mis-agg-circle', (e) => {
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        setPolyHover(makePolyPop(f.properties!.name as string, e.point.x, e.point.y))
      })
      map.on('mouseleave', 'rel-mis-agg-circle', () => { map.getCanvas().style.cursor = ''; setPolyHover(null) })

      // 事件掛在透明命中圈上（涵蓋正常圓點與斷線方形圖示的所有 DCU）
      map.on('mousemove', 'rel-dcu-hit', (e) => {
        const f = e.features?.[0]; if (!f) return
        map.getCanvas().style.cursor = 'pointer'
        const id = f.properties!.id as string
        setHoverDcu(id); setDcuPop(makeDcuPopRef.current(id, e.point.x, e.point.y))
      })
      map.on('mouseleave', 'rel-dcu-hit', () => { map.getCanvas().style.cursor = ''; setHoverDcu(null); setDcuPop(null) })
      map.on('click', 'rel-dcu-hit', (e) => { const f = e.features?.[0]; if (f) selectDcu(f.properties!.id) })

      applyLock(pickModeRef.current)
      registerMap('relation', map)
      readyRef.current = true
      latestRef.current!.applyPickMode() // L3 進場時要先把 dashboard 圖層關掉，街道底圖才看得到
      latestRef.current!.buildMarkers()
      if (!pickModeRef.current) applyMeters(true)
      latestRef.current!.fitScope()

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

      /**
       * 點空白處 → 退回上一步的選取狀態：電表 → DCU → 無。
       * 2026-09-03 依業主意見補的：原本只清電表，選了 DCU 之後就沒有任何
       * 「退回」的點擊路徑，只能再去點另一台。雙擊仍是「退回上一個視角」，兩者不衝突。
       */
      map.on('click', (e) => {
        const layers = [...DEVICE_LAYERS].filter((l) => map.getLayer(l))
        if (map.queryRenderedFeatures(e.point, { layers }).length) return
        const st = useWarroom.getState()
        if (st.selectedMeterId) st.selectMeter(null)
        else if (st.selectedDcuId) st.clearSelection()
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
  /**
   * 電表圖層＝「觀察中 DCU 的電表」（永遠畫，數量小）＋「全部電表」（手動開關，預設關）。
   * 全部電表才需要縮放門檻與 bbox 裁切；只有觀察電表時，平移縮放不必重建 source。
   */
  const meterLayerOnRef = useRef(false)
  const applyMeters = (dataChanged = false) => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('rel-meters') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const on = !pickModeRef.current && showMetersRef.current && map.getZoom() >= METER_MIN_ZOOM
    const watched = pickModeRef.current ? [] : watchMetersRef.current
    if (on) {
      // 縮放門檻擋層級、bbox（外擴 25%）擋視窗 —— 只建可視範圍內的電表 feature。
      const b = map.getBounds()
      const mx = (b.getEast() - b.getWest()) * 0.25, my = (b.getNorth() - b.getSouth()) * 0.25
      const W = b.getWest() - mx, E = b.getEast() + mx, S = b.getSouth() - my, N = b.getNorth() + my
      const byId = new Map<string, Meter>()
      metersRef.current.forEach((m) => { if (m.lng >= W && m.lng <= E && m.lat >= S && m.lat <= N) byId.set(m.id, m) })
      watched.forEach((m) => byId.set(m.id, m))
      src.setData(meterFeatures([...byId.values()]) as any)
    } else if (meterLayerOnRef.current || dataChanged) {
      src.setData((watched.length ? meterFeatures(watched) : EMPTY_FC_DATA) as any)
    }
    if (on !== meterLayerOnRef.current) { meterLayerOnRef.current = on; setMetersOn(on) }
  }

  // 手動開關切換／觀察清單變動 → 立刻重算電表圖層（不必等下一次 moveend）
  useEffect(() => {
    if (readyRef.current) applyMeters(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMeters, watchMeters])

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
    dcuList.forEach(({ dcu, cross }) => {
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
    applyFreqFilter()
  }

  /**
   * 頻點篩選 —— GPU 圖層（電表點／停用電表／命中圈／DCU）走 layer filter，
   * DOM marker 直接收起。選取中的 DCU 一律保留，避免篩掉之後找不到自己點的那台。
   */
  const applyFreqFilter = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const hidden = hiddenFreqsRef.current
    const keep: any = hidden.length ? ['!', ['in', ['get', 'freq'], ['literal', hidden]]] : true
    const sel = useWarroom.getState().selectedDcuId
    const keepDcu: any = hidden.length && sel ? ['any', keep, ['==', ['get', 'id'], sel]] : keep
    const set = (id: string, f: any) => { if (map.getLayer(id)) map.setFilter(id, f) }
    set('rel-meter-dots', ['all', ['!=', ['get', 'dis'], 1], keep])
    set('rel-meter-disabled', ['all', ['==', ['get', 'dis'], 1], keep])
    set('rel-meter-hit', keep)
    set('rel-dcu-dots', keepDcu)
    set('rel-dcu-hit', keepDcu)
    dcuRefs.current.forEach((r, id) => {
      r.wrap.style.display = hidden.includes(r.dcu.freq) && id !== sel ? 'none' : 'flex'
    })
  }

  useEffect(() => {
    applyFreqFilter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenFreqs, selectedDcuId])

  /**
   * 層級樣式。
   *   L1／L2：dashboard 色塊（不透明底＋告警色）＋歸屬錯誤群集，點區域下鑽。
   *   L3    ：街道底圖，色塊退成幾乎透明、只留**行政區界線與區名**當方位參照，
   *           點鄰區可直接切過去（點裝置優先，不會誤觸）。
   */
  const applyPickMode = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const pickOnly = pickMode ? 'visible' : 'none'
    ;['rel-blank', 'rel-mis-agg-circle', 'rel-mis-agg-count'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pickOnly)
    })
    /* L1／L2 的歸屬錯誤一律只用群集呈現 —— 逐顆的圖示與兩條歸屬線在這個層級要關掉。
       原本沒關：選了某台 DCU 之後，全台層級會同時出現群集球與散落的 ✕ 圖示＋連線，
       看起來就像「群集以外還有一堆歸屬錯誤電表」。 */
    const deviceOnly = pickMode ? 'none' : 'visible'
    ;['rel-mis-line-actual', 'rel-mis-line-expected', 'rel-mis-dot'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', deviceOnly)
    })
    // 縣市外框：只在 L3（L1／L2 的色塊本身就看得出縣市範圍）
    ;['rel-county-halo', 'rel-county-line'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', deviceOnly)
    })
    ;(map.getSource('rel-county') as maplibregl.GeoJSONSource | undefined)
      ?.setData((pickMode ? EMPTY_FC_DATA : countyOutline(city)) as any)
    // 界線與區名兩個層級都留著（L3 是為了知道自己在哪一區、旁邊是哪一區）
    ;['rel-poly-fill', 'rel-poly-line', 'rel-poly-label'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
    })
    // L3：區域外塗灰；選取那一區完全不上色（2026-09-29 業主意見：原本留的 4% 黑在街道底圖上
    // 看起來像一層灰色遮罩）。點目前這一區本來就不做事，不需要靠填色接 click
    map.setPaintProperty('rel-poly-fill', 'fill-color',
      (pickMode ? ['get', 'sevColor'] : ['case', ['get', 'outside'], OUTSIDE_FILL, '#FFFFFF']) as any)
    map.setPaintProperty('rel-poly-fill', 'fill-opacity',
      (pickMode ? 0.8 : ['case', ['get', 'outside'], OUTSIDE_OPACITY, 0]) as any)
    map.setPaintProperty('rel-poly-line', 'line-color', (pickMode ? ['get', 'sevStroke'] : BOUNDARY_LINE) as any)
    map.setPaintProperty('rel-poly-line', 'line-width', (pickMode ? 0.9 : 1) as any)
    map.setPaintProperty('rel-poly-line', 'line-opacity', (pickMode ? 1 : 0.28) as any)
    map.setPaintProperty('rel-poly-label', 'text-opacity', (pickMode ? 1 : 0.55) as any)

    // L2 的六邊形小一號（L1 維持原尺寸）
    const l2 = level !== 'taiwan'
    if (map.getLayer('rel-mis-agg-circle')) map.setLayoutProperty('rel-mis-agg-circle', 'icon-size', l2 ? MIS_AGG_L2_SCALE : 1)
    if (map.getLayer('rel-mis-agg-count')) map.setLayoutProperty('rel-mis-agg-count', 'text-size', l2 ? 10 : 12)

    polyFC.current = buildPoly()
    ;(map.getSource('rel-poly') as maplibregl.GeoJSONSource | undefined)?.setData(polyFC.current)
    ;(map.getSource('rel-poly-labels') as maplibregl.GeoJSONSource | undefined)?.setData(buildLabelPoints(polyFC.current) as any)
    if (pickMode) (map.getSource('rel-mis-agg') as maplibregl.GeoJSONSource | undefined)?.setData(buildMisPoints() as any)
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
    setCameraScope('relation', scopeKey({ level, city, district }))
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

  /**
   * 圖層重建 —— 只重畫，不動鏡頭。
   *
   * `dcuList` 會因為「顯示圖層」的歸屬錯誤開關而改變（開啟時要補進兩端跑到範圍外的
   * DCU），若在這裡一併 fitScope，等於**勾一次圖層就把視角重設一次**，使用者剛拉近
   * 看的位置會被彈開。2026-09-07 依業主意見拆開：取景只跟著「範圍」變動走（見下一個
   * effect），圖層開關一律不動鏡頭。
   */
  useEffect(() => {
    if (!readyRef.current) return
    applyPickMode()
    applyMeters(true)
    buildMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcuList, districtMeters, pickMode])

  /**
   * 換行政區 → 區塊的「選取區／區域外」要重算。
   * 上面那個 effect 不一定會跑：L3 同縣市換區時 dcuList／districtMeters／pickMode 常常都沒變，
   * 區塊就停在舊的選取狀態 —— 新選的區還蓋著灰、舊的那區反而是亮的（2026-09-29 業主回報）。
   */
  useEffect(() => {
    if (readyRef.current) applyPickMode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district])

  // 觀察清單變動 → GPU 模式的 DCU 外環要跟著更新（DOM 模式的外環由樣式 effect 處理）
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || pickMode || !gpuDcus) return
    ;(map.getSource('rel-dcus') as maplibregl.GeoJSONSource | undefined)?.setData(buildDcuPoints() as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedDcuIds])

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
    if (locked) {
      map.scrollZoom.disable(); map.dragPan.disable()
      map.touchZoomRotate.disable(); map.boxZoom.disable(); map.keyboard.disable()
      if (nav && navOnRef.current) { map.removeControl(nav); navOnRef.current = false }
    } else {
      map.scrollZoom.enable(); map.dragPan.enable()
      map.touchZoomRotate.enable(); map.boxZoom.enable(); map.keyboard.enable()
      if (nav && !navOnRef.current) { map.addControl(nav, 'bottom-right'); navOnRef.current = true }
    }
  }

  useEffect(() => {
    if (readyRef.current) applyLock(pickMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickMode])

  // 範圍（層級／縣市／行政區）變更 → 重新取景；換了範圍，舊視角才真的沒有意義
  useEffect(() => {
    if (!readyRef.current) return
    clearHistory('relation')
    fitScope()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, city, district, pickMode])

  // 切換成顯示中的那張 → 對齊另一張的鏡頭（並重算尺寸、補上電表圖層）
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current || !active) return
    map.resize()
    if (!pullCamera('relation', scopeKey({ level, city, district }))) fitScope() // 沒有另一張可參照才自行取景
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
   *   一律畫 → 觀察中 DCU 相關的（兩個方向：他台連入 / 連入他台）
   *   圖層開 → 再併上範圍內全部歸屬錯誤電表
   * 每顆電表配兩條線：實線＝實際收容、虛線＝白名單應屬。
   * 方向以「選取中的 DCU」為參照；沒有選取時只標歸屬錯誤、不標方向。
   */
  const misMeters = useMemo((): { meter: Meter; dir: MisDir | '' }[] => {
    const byId = new Map<string, Meter>()
    watchMis.forEach((m) => byId.set(m.id, m))
    if (showMis) scopeMis.forEach((m) => byId.set(m.id, m))
    return [...byId.values()].map((meter) => ({
      meter,
      dir: !selectedDcuId ? ''
        : meter.dcuId === selectedDcuId ? 'in'
          : meter.expectedDcuId === selectedDcuId ? 'out'
            : '',
    }))
  }, [showMis, scopeMis, watchMis, selectedDcuId])

  /** Esc 與「點空白處」同一條退回路徑：電表 → DCU → 無 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !activeRef.current) return
      const st = useWarroom.getState()
      if (st.selectedMeterId) st.selectMeter(null)
      else if (st.selectedDcuId) st.clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** 歸屬線的顯示／隱藏 —— 標記留著，只收線 */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const vis = showMisLines ? 'visible' : 'none'
    ;['rel-mis-line-actual', 'rel-mis-line-expected'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    })
  }, [showMisLines])

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
      // 2026-09-03 依業主意見：聚焦某台 DCU 時，浮出的是它的**白名單**電表
      // （expectedDcuId），而不是實際收容的那批 —— 歸屬錯誤才看得出「該我的表跑掉了」
      map.setPaintProperty('rel-meter-dots', 'circle-opacity',
        ['match', ['get', 'expected'], ids, ['case', ['==', ['get', 'on'], 0], 0.6, 0.95], 0.1] as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_FOCUS as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', ['case', ['==', ['get', 'on'], 0], 0, 0.6] as any)
      const dcuOp: any = ['case', ['match', ['get', 'id'], ids, true, false], 1, DIM_OPACITY]
      map.setPaintProperty('rel-dcu-dots', 'icon-opacity', dcuOp)
      // 歸屬錯誤電表同一套邏輯：只有「白名單應屬聚焦 DCU」的那幾顆維持全亮，其餘弱化
      if (map.getLayer('rel-mis-dot')) {
        map.setPaintProperty('rel-mis-dot', 'icon-opacity',
          ['match', ['get', 'expectedId'], ids, 1, DIM_OPACITY] as any)
      }
      if (map.getLayer('rel-meter-disabled')) {
        map.setPaintProperty('rel-meter-disabled', 'icon-opacity',
          ['match', ['get', 'expected'], ids, 1, DIM_OPACITY] as any)
      }
    } else {
      map.setPaintProperty('rel-meter-dots', 'circle-opacity', METER_OPACITY_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-radius', METER_RADIUS_SOFT as any)
      map.setPaintProperty('rel-meter-dots', 'circle-stroke-width', 0 as any)
      map.setPaintProperty('rel-dcu-dots', 'icon-opacity', 1 as any)
      if (map.getLayer('rel-mis-dot')) map.setPaintProperty('rel-mis-dot', 'icon-opacity', 1 as any)
      if (map.getLayer('rel-meter-disabled')) map.setPaintProperty('rel-meter-disabled', 'icon-opacity', 1 as any)
    }
  }, [focus])

  /**
   * hover 卡定位：預設在游標右下；靠近地圖右緣／下緣時翻到左側／上方，
   * 不然卡片會被地圖容器裁掉（L3 滑過右側鄰區時最明顯）。
   */
  const popPos = (x: number, y: number, w: number, h: number) => {
    const W = containerRef.current?.clientWidth ?? Infinity
    const H = containerRef.current?.clientHeight ?? Infinity
    const left = x + 14 + w > W - 8 ? Math.max(8, x - 14 - w) : x + 14
    const top = y + 12 + h > H - 8 ? Math.max(8, y - 12 - h) : y + 12
    return { left, top }
  }

  latestRef.current = { buildPoly, buildMisPoints, applyPickMode, buildMarkers, fitScope }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <LayerPanel
        showMis={showMis}
        onShowMis={setShowMis}
        showMisLines={showMisLines}
        onShowMisLines={setShowMisLines}
        misCount={scopeMis.length}
        showMeters={showMeters}
        onShowMeters={setShowMeters}
        metersOn={metersOn}
        pickMode={pickMode}
        freqCounts={freqCounts}
        hiddenFreqs={hiddenFreqs}
        onToggleFreq={(f) => setHiddenFreqs((h) => (h.includes(f) ? h.filter((x) => x !== f) : [...h, f]))}
        onSoloFreq={(f) => setHiddenFreqs((h) =>
          // 再雙擊一次已獨顯的頻點＝恢復全部
          h.length === FREQ_COUNT - 1 && !h.includes(f) ? [] : Array.from({ length: FREQ_COUNT }, (_, i) => i + 1).filter((x) => x !== f))}
        onShowAllFreqs={() => setHiddenFreqs([])}
        watchIds={pinnedDcuIds}
        selectedDcuId={selectedDcuId}
        onPickWatch={selectDcu}
        onUnwatch={unwatchDcu}
        onClearWatch={clearWatch}
      />
      <WatchNotice />
      {/* 離島 inset —— 與 DCU 斷線地圖同一個位置與樣式，只在全台層級出現 */}
      {level === 'taiwan' && (
        <div className="absolute bottom-[84px] right-3.5 z-[2]">
          <IslandShortcuts />
        </div>
      )}
      <StatsNote />
      {polyHover && (
        /* 外觀與 DCU 斷線地圖的區塊 hover 一致（2026-09-03 業主意見：兩張圖要一樣） */
        <div className="pointer-events-none absolute z-30 w-[196px] rounded-lg bg-surface border border-border shadow-card px-3 py-2" style={popPos(polyHover.x, polyHover.y, 196, 145)}>
          <div className="text-[13px] font-semibold text-ink mb-1">{polyHover.name}</div>
          <MRow k="DCU 總數" v={polyHover.dcu.toLocaleString()} />
          <MRow k="電表數" v={polyHover.meters.toLocaleString()} />
          {/* 歸屬錯誤用與 DCU hover 卡同一個醒目橘；0 顆就維持一般字色 */}
          {/* 歸屬錯誤率 2026-09-29 依業主意見移除 */}
          <MRow k="歸屬錯誤電表" v={polyHover.mis.toLocaleString()} color={polyHover.mis ? STATUS.dcuCarries : undefined} />
          <div className="mt-1 border-t border-divider pt-1 text-[11px] text-ink-mut">
            {level === 'taiwan' ? '點選進入縣市' : '點選進入行政區'}
          </div>
        </div>
      )}
      {dcuPop && (
        <div className="pointer-events-none absolute z-30 w-[250px] rounded-lg bg-surface border border-border shadow-card p-3" style={popPos(dcuPop.x, dcuPop.y, 250, 300)}>
          {/* 標題＝DCU 序號，右側＝區處（電號前兩碼） */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-mono text-[13.5px] font-semibold text-ink">{dcuPop.dcu.id}</span>
            <span className="text-[11.5px] font-semibold text-ink-sub whitespace-nowrap">{dcuPop.dcu.office}</span>
          </div>
          {/* 狀態列只在**不正常**時出現 —— 依業主意見，正常 DCU 不必特地寫一行「啟用」，
              沒有這一行本身就代表正常，也讓斷線／停用在 hover 卡上更跳。 */}
          {dcuPop.dcu.state !== 'active' && (
            <div className="mb-1.5">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: dcuPop.dcu.state === 'offline' ? STATE_COLOR.offline : STATE_COLOR.disabled }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: dcuPop.dcu.state === 'offline' ? STATE_COLOR.offline : STATE_COLOR.disabled }}
                />
                {STATE_LABEL[dcuPop.dcu.state]}
              </span>
            </div>
          )}
          <MRow k="DCU編號" v={dcuPop.dcu.code} />
          <MRow k="地址" v={dcuPop.dcu.address} wrap />
          <MRow k="IP" v={dcuPop.ip} />
          <MRow k="訊號強度" v={`${dcuPop.signal} dBm`} />
          <MRow k="通訊型式" v={dcuPop.connType} />
          <MRow k="頻點" v={`第 ${dcuPop.dcu.freq} 頻點`} />
          <div className="mt-1 pt-1 border-t border-divider">
            <MRow k="電表連線數" v={`${dcuPop.online} / ${dcuPop.total}`} />
            <MRow k="LP 讀表率" v={`${dcuPop.lpRate.toFixed(1)}%`} />
          </div>
          {(dcuPop.misIn > 0 || dcuPop.misOut > 0) && (
            /* 2026-09-03 依業主意見：兩個方向併成同一行、以 : 區隔，並用醒目橘色 */
            <div className="mt-1.5 flex items-baseline gap-1.5 rounded-[4px] px-1.5 py-1 text-[11px] font-semibold" style={{ background: '#FFF3E6' }}>
              <span className="text-ink-sub">歸屬錯誤</span>
              <span className="tabular-nums" style={{ color: STATUS.dcuCarries }}>
                他台連入 {dcuPop.misIn} : 連入他台 {dcuPop.misOut}
              </span>
            </div>
          )}
        </div>
      )}
      {misPop && (
        /* 一般電表不彈卡；只有歸屬錯誤電表 hover，且只留三個欄位 */
        <div className="pointer-events-none absolute z-30 w-[218px] rounded-lg bg-surface border border-border shadow-card p-3" style={popPos(misPop.x, misPop.y, 218, 100)}>
          <MRow k="表號" v={misPop.id} />
          <MRow k="連線 DCU" v={misPop.actualId} />
          <MRow k="歸屬 DCU" v={misPop.expectedId} />
        </div>
      )}
    </div>
  )
}

/**
 * 統計口徑備註（地圖右上）—— 業主要求把「圖面看得到 ≠ 統計算得到」寫清楚：
 * 停用設備只在這張圖有圖示，所有數據一律排除；歸屬統計以白名單為準。
 *
 * 2026-08-27 依業主意見改為 **hover 標題才展開**：常駐的四行字太佔畫面，
 * 而且它是「讀一次就知道」的說明，不需要一直佔著右上角。
 * 與系統總覽的 KPI 說明一致，用純 CSS group-hover，不進 state。
 */
function StatsNote() {
  return (
    <div className="group absolute right-3 top-3 z-10">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/92 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-sub shadow-card backdrop-blur transition-colors hover:text-ink"
        aria-label="查看統計口徑備註"
      >
        <Info size={13} />
        備註
      </button>
      <div className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 w-[236px] translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-card">
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink">統計口徑備註</div>
          <ul className="flex flex-col gap-1 text-[11px] leading-snug text-ink-sub">
            <li className="flex gap-1.5">
              <span className="mt-[3px] h-3 w-3 shrink-0 rounded-[3px] border-2 border-white shadow-sm" style={{ background: STATE_COLOR.disabled }} />
              停用設備僅於本圖以灰色圖示呈現
            </li>
            <li>· 數據統計不計算停用設備</li>
            <li>· 統計資訊依白名單歸屬統計、排除停用</li>
            <li>· 他台連入不計入本台；連入他台仍計入本台</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

/** L3 左下的頻點統計／篩選列 —— 2026-10-01 業主意見先拿掉 */
const SHOW_FREQ_PANEL = false

/**
 * 顯示圖層面板（地圖左上）—— 兩層各自獨立，**不是二擇一**。
 *   · 正常電表     —— 手動開關。唯一的附加條件是縮放門檻（見 `applyMeters`），
 *                     沒放大到街道級時面板下方會說明。
 *   · 歸屬錯誤電表 —— 疊加層：畫出範圍內全部歸屬錯誤電表與兩條歸屬線；
 *                     關閉時仍會畫「選取中 DCU」的歸屬錯誤，只是不整層攤開。
 * 兩個開關在 L1／L2 的區域選取模式下都不適用（那個層級不畫任何裝置點，
 * 歸屬錯誤改以群集呈現），所以一律停用並說明原因。
 */
function LayerPanel({
  showMis, onShowMis, misCount, showMisLines, onShowMisLines, showMeters, onShowMeters, metersOn, pickMode,
  freqCounts, hiddenFreqs, onToggleFreq, onSoloFreq, onShowAllFreqs,
  watchIds, selectedDcuId, onPickWatch, onUnwatch, onClearWatch,
}: {
  showMis: boolean; onShowMis: (v: boolean) => void; misCount: number
  showMisLines: boolean; onShowMisLines: (v: boolean) => void
  showMeters: boolean; onShowMeters: (v: boolean) => void
  metersOn: boolean; pickMode: boolean
  freqCounts: number[]; hiddenFreqs: number[]
  onToggleFreq: (f: number) => void; onSoloFreq: (f: number) => void; onShowAllFreqs: () => void
  watchIds: string[]; selectedDcuId: string | null
  onPickWatch: (id: string) => void; onUnwatch: (id: string) => void; onClearWatch: () => void
}) {
  /* 2026-09-29 業主意見：原本一張直式面板（觀察中＋圖層＋頻點）把左半張圖都遮掉了。
     · L1／L2 這些開關全部不適用 → 整個面板移除
     · L3：觀察中 DCU 與顯示圖層左右並排在上方；頻點統計移到下方、圖例上面，改成一列 */
  if (pickMode) return null
  return (
    <>
    <div className="pointer-events-none absolute left-3 right-[96px] top-3 z-20 flex items-start gap-2">
      <div className="pointer-events-auto w-[200px] shrink-0 rounded-lg border border-border bg-surface/92 shadow-card backdrop-blur">
        <WatchSection ids={watchIds} selectedId={selectedDcuId} onPick={onPickWatch} onRemove={onUnwatch} onClear={onClearWatch} />
      </div>
      <div className="pointer-events-auto flex min-w-0 items-center gap-1 rounded-lg border border-border bg-surface/92 p-1 shadow-card backdrop-blur">
        <span className="shrink-0 px-1.5 text-[11.5px] font-semibold text-ink">顯示圖層</span>
        <LayerToggle
          on={showMeters}
          onToggle={() => onShowMeters(!showMeters)}
          title={`載入整區所有電表（效能較差；需放大到 z${METER_MIN_ZOOM} 以上才會載入）。平常請改用「觀察中 DCU」`}
          swatch={<span className="h-2.5 w-2.5 rounded-full" style={{ background: FREQ_COLORS[0] }} />}
          label={showMeters && !metersOn ? '全部電表（請放大）' : '全部電表'}
          hint="效能較差"
        />
        <LayerToggle
          on={showMis}
          onToggle={() => onShowMis(!showMis)}
          title="畫出範圍內全部歸屬錯誤電表與其兩端 DCU（實線＝實際收容、虛線＝白名單應屬）"
          swatch={
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold leading-none text-white" style={{ background: MIS_COLOR }}>
              ✕
            </span>
          }
          label="歸屬錯誤電表"
          count={misCount}
        />
        <LayerToggle
          on={showMisLines && showMis}
          disabled={!showMis}
          onToggle={() => onShowMisLines(!showMisLines)}
          title={!showMis ? '需先開啟「歸屬錯誤電表」' : '顯示／隱藏歸屬線（實線＝實際收容、虛線＝白名單應屬）'}
          swatch={
            <span className="flex h-3.5 w-3.5 items-center">
              <span className="h-[2px] w-full rounded-full" style={{ background: MIS_COLOR }} />
            </span>
          }
          label="歸屬線條"
        />
      </div>
    </div>
      {/* 頻點：色塊＝地圖上 DCU／電表的顏色，下方數字＝本行政區該頻點的電表數。
          點一下隱藏／顯示；雙擊＝只看這個頻點（再雙擊恢復全部）。位置在左下圖例上方。
          2026-10-01 業主意見：L3 頻點統計先拿掉 → SHOW_FREQ_PANEL 關閉；要恢復改回 true 即可 */}
      {SHOW_FREQ_PANEL && (
      <div className="absolute bottom-[52px] left-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface/92 px-1.5 py-1 shadow-card backdrop-blur">
          <div className="flex shrink-0 flex-col items-start px-1 text-[11px] font-semibold text-ink-sub">
            <span>頻點</span>
            {hiddenFreqs.length > 0 && (
              <button type="button" onClick={onShowAllFreqs} className="text-[10.5px] font-medium text-brand hover:underline">
                全部顯示
              </button>
            )}
          </div>
          <div className="flex gap-0.5">
            {freqCounts.map((n, i) => {
              const f = i + 1
              const on = !hiddenFreqs.includes(f)
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleFreq(f)}
                  onDoubleClick={() => onSoloFreq(f)}
                  title={`第 ${f} 頻點・電表 ${n.toLocaleString()} 具（點選顯示／隱藏，雙擊只看此頻點）`}
                  className={`flex w-[30px] flex-col items-center gap-0.5 rounded-md py-0.5 transition-colors hover:bg-inset ${on ? '' : 'opacity-35'}`}
                >
                  <span
                    className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold leading-none text-white"
                    style={{ background: on ? freqColor(f) : STATE_COLOR.disabled }}
                  >
                    {f}
                  </span>
                  <span className={`text-[9.5px] tabular-nums text-ink-mut ${on ? '' : 'line-through'}`}>{n}</span>
                </button>
              )
            })}
          </div>
      </div>
      )}
    </>
  )
}

/**
 * 觀察中 DCU（圖層面板最上方）—— 2026-09-23 依業主意見（效能）新增。
 * 點地圖或右側列表的 DCU 就加入（最多 MAX_WATCH 台），地圖只畫這幾台的電表與相關歸屬錯誤。
 * 每台一列：觀察組別色點（＝地圖上 DCU 外環色）、DCU 序號、白名單電表數、✕ 移除。
 * 點列＝切換成「目前」那台（右側電表列表跟著換、鏡頭移過去）。
 */
function WatchSection({ ids, selectedId, onPick, onRemove, onClear }: {
  ids: string[]; selectedId: string | null
  onPick: (id: string) => void; onRemove: (id: string) => void; onClear: () => void
}) {
  return (
    <div className="p-1.5">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11.5px] font-semibold text-ink">
          觀察中 DCU <span className="tabular-nums text-ink-mut">{ids.length}/{MAX_WATCH}</span>
        </span>
        {ids.length > 0 && (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-brand hover:underline">全部清除</button>
        )}
      </div>
      {ids.length === 0 ? (
        <p className="px-1 pb-0.5 text-[11px] leading-snug text-ink-mut">
          點選地圖或右側列表的 DCU 加入觀察，才會顯示它的電表與相關歸屬錯誤（最多 {MAX_WATCH} 台）
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {ids.map((id, i) => {
            const d = dcuById.get(id)
            const n = metersExpectedAll(id).filter((m) => !m.disabled).length
            const current = id === selectedId
            return (
              <div
                key={id}
                onClick={() => onPick(id)}
                title="設為目前 DCU（右側顯示它的電表列表）"
                className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] ${current ? 'bg-brand-soft' : 'hover:bg-inset'}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                <span className={`min-w-0 flex-1 truncate font-mono ${current ? 'font-semibold text-brand' : 'text-ink'}`}>{id}</span>
                {d && d.state !== 'active' && (
                  <span className="shrink-0 text-[10px]" style={{ color: d.state === 'offline' ? STATE_COLOR.offline : STATE_COLOR.disabled }}>
                    {STATE_LABEL[d.state]}
                  </span>
                )}
                <span className="shrink-0 tabular-nums text-[10.5px] text-ink-mut">{n} 具</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(id) }}
                  title="移除觀察"
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-ink-mut hover:bg-surface hover:text-brand"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 觀察已滿等提示 —— 觀察清單右邊、顯示圖層列下方（兩者都不蓋住），3.5 秒後自動消失 */
function WatchNotice() {
  const n = useWarroom((s) => s.watchNotice)
  const dismiss = useWarroom((s) => s.dismissWatchNotice)
  useEffect(() => {
    if (!n) return
    const t = window.setTimeout(dismiss, 3500)
    return () => window.clearTimeout(t)
  }, [n, dismiss])
  if (!n) return null
  return (
    <div className="pointer-events-none absolute left-[224px] right-[96px] top-[56px] z-30 flex justify-center">
      <div key={n.at} className="pointer-events-auto flex max-w-[380px] items-center gap-2 rounded-lg border border-warning-bd bg-warning-bg px-3 py-2 text-[12.5px] text-ink shadow-card modal-pop">
        <Info size={14} className="shrink-0 text-warning" />
        {n.text}
        <button type="button" onClick={dismiss} className="ml-1 text-ink-mut hover:text-ink" title="關閉"><X size={13} /></button>
      </div>
    </div>
  )
}

/** 圖層面板的單列開關 —— 左側色塊、中間名稱、右側計數與勾選狀態 */
function LayerToggle({ on, disabled, onToggle, title, swatch, label, count, hint }: {
  on: boolean; disabled?: boolean; onToggle: () => void; title: string
  swatch: React.ReactNode; label: string; count?: number; hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      title={title}
      className={[
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-[11.5px] font-medium transition-colors',
        disabled ? 'cursor-not-allowed text-ink-fai opacity-60' : on ? 'bg-brand-soft text-brand' : 'text-ink-sub hover:bg-inset',
      ].join(' ')}
    >
      <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border text-[9px] font-bold leading-none ${
        on ? 'border-brand bg-brand text-white' : 'border-border-strong bg-surface text-transparent'
      }`}>
        ✓
      </span>
      <span className="shrink-0">{swatch}</span>
      <span className="text-left">{label}</span>
      {hint && <span className="shrink-0 text-[10px] font-normal text-ink-mut">{hint}</span>}
      {count != null && count > 0 && (
        <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${on ? 'bg-brand/15' : 'bg-inset text-ink-sub'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function MRow({ k, v, wrap, color }: { k: string; v: string; wrap?: boolean; color?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[12px] py-0.5">
      <span className="text-ink-sub shrink-0">{k}</span>
      <span className={`font-medium text-ink text-right ${wrap ? '' : 'font-mono whitespace-nowrap'}`} style={color ? { color } : undefined}>{v}</span>
    </div>
  )
}
