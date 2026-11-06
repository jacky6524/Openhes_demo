/*
 * 電表詳細資料 modal 各分頁的 mock 資料 (Figma 3569:19577 一系列)。
 *
 * 全部依電表號碼決定亂數種子，同一支電表每次開啟數值一致；負載資料仍留在
 * meterProfile.ts，這裡負責 ALT／午夜／事件／歷史連線／詳細資料五個分頁。
 */

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

/** 第 i 筆的資料時間 —— 與負載資料共用同一組時間軸，讓各分頁看起來是同一批讀值 */
function rowTime(i: number) {
  const hh = 10 - Math.floor(i / 6)
  const mm = 30 - ((i * 5) % 60)
  return `2025/01/01 ${pad((hh + 24) % 24, 2)}:${pad((mm + 60) % 60, 2)}:00`
}

const ROWS = 48

/** 一列資料就是「欄位鍵 → 顯示字串」，欄位定義各分頁自己給 */
export type Row = Record<string, string | number>

export interface Column {
  key: string
  label: string
}

/* ---------------------------------------------------------------- ALT */

export const ALT_TABS = [
  { key: 'power', label: '功率與需量' },
  { key: 'voltage', label: '電壓參數' },
  { key: 'current', label: '電流參數' },
] as const
export type AltTab = (typeof ALT_TABS)[number]['key']

const ALT_COLUMNS: Record<AltTab, Column[]> = {
  power: [
    { key: 'rindex', label: 'rindex' },
    { key: 'dataTime', label: '資料時間' },
    { key: 'hesTime', label: 'HES接收時間' },
    { key: 'mdmsTime', label: '傳送至MDMS時間' },
    { key: 'delay', label: '延遲' },
    { key: 'kva', label: '瞬時kVA' },
    { key: 'demand', label: '瞬時需量' },
    { key: 'pf', label: '瞬時功率因素' },
    { key: 'pfSell', label: '售電平均功率因數' },
    { key: 'pfBuy', label: '購電平均功率因數' },
  ],
  voltage: [
    { key: 'rindex', label: 'rindex' },
    { key: 'dataTime', label: '資料時間' },
    { key: 'va', label: 'A相電壓' },
    { key: 'vb', label: 'B相電壓' },
    { key: 'vc', label: 'C相電壓' },
    { key: 'vaAngle', label: 'A相電壓相角' },
    { key: 'vbAngle', label: 'B相電壓相角' },
    { key: 'vcAngle', label: 'C相電壓相角' },
    { key: 'vab', label: 'AB線電壓值' },
    { key: 'vabAngle', label: 'AB線電壓角度' },
  ],
  current: [
    { key: 'rindex', label: 'rindex' },
    { key: 'dataTime', label: '資料時間' },
    { key: 'ia', label: 'A相電流' },
    { key: 'ib', label: 'B相電流' },
    { key: 'ic', label: 'C相電流' },
    { key: 'in', label: 'N相電流' },
    { key: 'iaAngle', label: 'A相電流相角' },
    { key: 'ibAngle', label: 'B相電流相角' },
    { key: 'icAngle', label: 'C相電流相角' },
    { key: 'iab', label: 'AB線電流值' },
  ],
}

export function altColumns(tab: AltTab): Column[] {
  return ALT_COLUMNS[tab]
}

export function altRows(meterNo: string, tab: AltTab): Row[] {
  const r = mulberry32(hash(meterNo) ^ 0x41_4c_54_00)
  return Array.from({ length: ROWS }, (_, i) => {
    const time = rowTime(i)
    const base: Row = { rindex: 570 - i, dataTime: time }
    if (tab === 'power') {
      return {
        ...base,
        hesTime: time,
        mdmsTime: time,
        delay: 3200 + Math.round(r() * 40),
        kva: (18 + r() * 6).toFixed(4),
        demand: (14 + r() * 5).toFixed(4),
        pf: (0.9 + r() * 0.09).toFixed(4),
        pfSell: (0.9 + r() * 0.09).toFixed(4),
        pfBuy: (0.9 + r() * 0.09).toFixed(4),
      }
    }
    if (tab === 'voltage') {
      const v = () => (218 + r() * 6).toFixed(4)
      const a = () => (r() * 360).toFixed(2)
      return { ...base, va: v(), vb: v(), vc: v(), vaAngle: a(), vbAngle: a(), vcAngle: a(), vab: (380 + r() * 8).toFixed(4), vabAngle: a() }
    }
    const c = () => (30 + r() * 20).toFixed(4)
    const a = () => (r() * 360).toFixed(2)
    return { ...base, ia: c(), ib: c(), ic: c(), in: (r() * 3).toFixed(4), iaAngle: a(), ibAngle: a(), icAngle: a(), iab: c() }
  })
}

/* ----------------------------------------------------------- 午夜資料 */

export const MIDNIGHT_TABS = [
  { key: 'basic', label: '基本資料' },
  { key: 'peak', label: '尖峰' },
  { key: 'offPeak', label: '離峰' },
  { key: 'weekdaySemi', label: '平日半尖峰' },
  { key: 'satSemi', label: '週六半尖峰' },
  { key: 'ePeak', label: 'E峰' },
  { key: 'fPeak', label: 'F峰' },
  { key: 'stats', label: '統計資訊' },
] as const
export type MidnightTab = (typeof MIDNIGHT_TABS)[number]['key']

/** 尖峰~F峰共用同一組欄位，只有標題名稱換掉（Figma 3569:30883 註記） */
const PERIOD_LABEL: Partial<Record<MidnightTab, string>> = {
  peak: '尖峰',
  offPeak: '離峰',
  weekdaySemi: '平日半尖峰',
  satSemi: '週六半尖峰',
  ePeak: 'E峰',
  fPeak: 'F峰',
}

export function midnightColumns(tab: MidnightTab): Column[] {
  const head: Column[] = [
    { key: 'rindex', label: 'rindex' },
    { key: 'dataTime', label: '資料時間' },
  ]
  if (tab === 'basic') {
    return [
      ...head,
      { key: 'sellKwh', label: '售電總仟瓦小時' },
      { key: 'buyKwh', label: '購電總仟瓦小時' },
      { key: 'lastReset', label: '最近一次需量復歸時間' },
      { key: 'hesTime', label: 'HES接收時間' },
      { key: 'mdmsTime', label: '傳送至MDMS時間' },
      { key: 'delay', label: '延遲' },
      { key: 'meterId1', label: '電號ID1' },
      { key: 'areaId2', label: '區處代號ID2' },
      { key: 'batteryHours', label: '電池使用時間' },
      { key: 'programId', label: '程式ID號碼' },
    ]
  }
  if (tab === 'stats') {
    return [
      ...head,
      { key: 'demandRemain', label: '需量時段剩餘時間' },
      { key: 'resetCount', label: '需量復歸次數' },
      { key: 'sellQ1', label: '總售電kVArh(Q1)' },
      { key: 'buyQ4', label: '總購電kVArh(Q4)' },
      { key: 'buyQ3', label: '總購電kVArh(Q3)' },
      { key: 'kva', label: '瞬時kVA' },
      { key: 'demand', label: '瞬時需量' },
      { key: 'pf', label: '瞬時功率因數' },
    ]
  }
  const p = PERIOD_LABEL[tab] ?? ''
  return [
    ...head,
    { key: 'sellKwh', label: `售電${p}仟瓦小時` },
    { key: 'buyKwh', label: `購電${p}仟瓦小時` },
    { key: 'sellHint', label: `售電${p}需量(提示)` },
    { key: 'buyHint', label: `購電${p}需量(提示)` },
    { key: 'sellCum', label: `售電${p}需量(累計)` },
    { key: 'buyCum', label: `購電${p}需量(累計)` },
    { key: 'sellCont', label: `售電${p}需量(連續累計)` },
    { key: 'buyCont', label: `購電${p}需量(連續累計)` },
  ]
}

export function midnightRows(meterNo: string, tab: MidnightTab): Row[] {
  const r = mulberry32(hash(meterNo) ^ 0x4d_4e_00_00)
  return Array.from({ length: ROWS }, (_, i) => {
    const time = rowTime(i)
    const base: Row = { rindex: 570 - i, dataTime: time }
    if (tab === 'basic') {
      return {
        ...base,
        sellKwh: (27201 + r() * 4).toFixed(4),
        buyKwh: (1 + Math.floor(r() * 3)).toString(),
        lastReset: time,
        hesTime: time,
        mdmsTime: time,
        delay: 3 + Math.floor(r() * 8),
        meterId1: '35616701',
        areaId2: '00000002',
        batteryHours: (4437.6 + r() * 0.02).toFixed(4),
        programId: (4437.6 + r() * 0.02).toFixed(4),
      }
    }
    if (tab === 'stats') {
      const kv = () => (4437.5 + r() * 0.2).toFixed(4)
      return {
        ...base,
        demandRemain: `${Math.floor(r() * 15)} 分`,
        resetCount: Math.floor(r() * 6),
        sellQ1: kv(),
        buyQ4: kv(),
        buyQ3: kv(),
        kva: (18 + r() * 6).toFixed(4),
        demand: (14 + r() * 5).toFixed(4),
        pf: (0.9 + r() * 0.09).toFixed(4),
      }
    }
    const v = () => (4437.5 + r() * 0.2).toFixed(4)
    return { ...base, sellKwh: v(), buyKwh: v(), sellHint: v(), buyHint: v(), sellCum: v(), buyCum: v(), sellCont: v(), buyCont: v() }
  })
}

/**
 * 午夜資料「合併版」—— 2026-09-17 依業主意見拿掉八個子頁籤，八組欄位併成一張表。
 * 作法同 ALT：`rindex`／`資料時間` 只留一份，其餘欄位鍵加上分組前綴
 * （尖峰~F峰六組的欄位鍵完全相同，不加前綴會互相覆蓋；欄位「標題」本來就帶時段名，
 * 例如「售電尖峰仟瓦小時」，所以畫面上仍分得出是哪一組）。
 */
export function midnightMerged(meterNo: string): { columns: Column[]; rows: Row[] } {
  const columns: Column[] = [
    { key: 'rindex', label: 'rindex' },
    { key: 'dataTime', label: '資料時間' },
  ]
  const rows: Row[] = midnightRows(meterNo, 'basic').map((r) => ({ rindex: r.rindex, dataTime: r.dataTime }))

  MIDNIGHT_TABS.forEach(({ key: tab }) => {
    const cols = midnightColumns(tab).filter((c) => c.key !== 'rindex' && c.key !== 'dataTime')
    const src = midnightRows(meterNo, tab)
    cols.forEach((c) => columns.push({ key: `${tab}_${c.key}`, label: c.label }))
    rows.forEach((row, i) => cols.forEach((c) => { row[`${tab}_${c.key}`] = src[i][c.key] }))
  })
  return { columns, rows }
}

/* ----------------------------------------------------------- 事件資料 */

export const EVENT_COLUMNS: Column[] = [
  { key: 'rindex', label: 'rindex' },
  { key: 'dataTime', label: '資料時間' },
  { key: 'hesTime', label: 'HES接收時間' },
  { key: 'code', label: '事件碼' },
  { key: 'desc', label: '說明' },
]

export function eventRows(meterNo: string): Row[] {
  const r = mulberry32(hash(meterNo) ^ 0x45_56_00_00)
  return Array.from({ length: ROWS }, (_, i) => {
    const time = rowTime(i)
    return {
      rindex: 570 - i,
      dataTime: time,
      hesTime: time,
      code: 3100 + Math.round(r() * 400),
      desc: '校時後，事件時間請使用校時後的電表時間',
    }
  })
}

/* ------------------------------------------------------- 歷史連線資訊 */

export const ONLINE_COLUMNS: Column[] = [
  { key: 'dataTime', label: '資料時間' },
  { key: 'online', label: '連線狀態' },
  { key: 'parent', label: 'Online parent' },
  { key: 'cellId', label: 'Cell ID' },
  { key: 'lpTime', label: 'load profile讀取時間' },
  { key: 'reportCount', label: '連線回報數' },
]

export interface OnlineRow extends Row {
  online: 'online' | 'offline'
}

export function onlineRows(meterNo: string): OnlineRow[] {
  const r = mulberry32(hash(meterNo) ^ 0x4f_4e_00_00)
  return Array.from({ length: ROWS }, (_, i) => {
    const time = rowTime(i)
    return {
      dataTime: time,
      online: r() < 0.88 ? 'online' : 'offline',
      parent: 'AE1092D00002',
      cellId: '20010420',
      lpTime: time,
      reportCount: Math.floor(r() * 3),
    }
  })
}

/* --------------------------------------------------------- 詳細資料 */

/** 值為 '暫不實作' 時畫面用紅字呈現（Figma 3569:35323） */
export interface InfoField {
  label: string
  value: string
  /** 連線狀態這格畫成狀態 pill */
  pill?: boolean
}

const LOCATION_TYPES = ['地面配電場', '屋內配電場', '桿上變壓器', '集中表箱']
const MODULES = ['SGCM-W61-TFB', 'SGCM-W62-TFB', 'SGCM-N71-NBF', 'SGCM-L51-LTF']

export function meterDetailFields(meterNo: string): InfoField[] {
  const r = mulberry32(hash(meterNo) ^ 0x49_4e_46_4f)
  const lat = (23.7 + r() * 0.05).toFixed(6)
  const lng = (120.53 + r() * 0.05).toFixed(6)
  // 三欄式版面，逐列由左到右填入
  return [
    { label: '區處及營業區', value: '01 北南-62' },
    { label: '連線狀態', value: '連線', pill: true },
    { label: '電號', value: `1903181${pad(Math.floor(r() * 9999), 4)}` },

    { label: 'CT', value: '--' },
    { label: 'TOU ID', value: '--' },
    { label: 'PT', value: '--' },

    { label: '回報裝置', value: `AE1092D00${pad(Math.floor(r() * 999), 3)}` },
    { label: '*功率', value: '--' },
    { label: '首次註冊時間', value: '2022/08/30 12:45' },

    { label: '最後上線時間', value: '2026/08/26 15:00' },
    { label: '表號', value: `FT${pad(Math.floor(r() * 99999999), 8)}` },
    { label: '郵遞區號', value: '64051' },

    { label: '位置類型', value: LOCATION_TYPES[Math.floor(r() * LOCATION_TYPES.length)] },
    { label: '樓層', value: '1' },
    { label: '用電地址', value: '雲林縣斗六市信義里太平路１０號二樓' },

    { label: '經緯度', value: `${lat}, ${lng}` },
    { label: '電表分類', value: 'A' },
    { label: '模組型號', value: MODULES[Math.floor(r() * MODULES.length)] },

    { label: '模組韌體版本', value: '暫不實作' },
    { label: '電表Qos', value: '暫不實作' },
    { label: 'AMI編號代碼', value: '108-FET' },

    { label: '用電契約', value: '15' },
    { label: '用戶型態', value: '--' },
    { label: '金鑰資訊', value: '暫不實作' },

    { label: '開票日序', value: '2' },
    { label: '通訊設定', value: '--' },
    { label: '備註1', value: '--' },

    { label: '備註2', value: '--' },
    { label: '備註3', value: '--' },
    { label: 'WAN IP', value: `172.17.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}` },

    { label: '人員', value: 'fet-idt1' },
  ]
}

/* ------------------------------------------- 詳細資料 · 註冊紀錄／歷史紀錄 */

/**
 * 註冊紀錄與歷史紀錄 —— 2026-09-29 業主提供的參考截圖（截圖/電表詳細資料參考.png）。
 * 註冊紀錄＝目前這顆 FAN 模組的註冊狀態（一列）；歷史紀錄＝過去的註冊（換模組、升級韌體留下的）。
 * 參考圖上的電號帶「-」，這裡依業主另一條意見一律 11 碼不帶 -，與「電號」欄位同一個值。
 * FAN 走 RF 網路，沒有 SIM，IMSI／SIM ID 顯示「--」。TODO: 上線改接註冊紀錄 API。
 */
export const REGISTER_COLUMNS: Column[] = [
  { key: 'fanMac', label: 'FAN MAC/IMEI' },
  { key: 'fanSerial', label: 'FAN序號' },
  { key: 'elecNo', label: '電號' },
  { key: 'module', label: '模組型號' },
  { key: 'fanVer', label: 'FAN版本' },
  { key: 'meterFw', label: '電表韌體版本' },
  { key: 'fw', label: '韌體版本' },
  { key: 'imsi', label: 'FAN IMSI' },
  { key: 'simId', label: 'FAN SIM ID' },
  { key: 'updatedAt', label: '最後更新時間' },
  { key: 'status', label: '狀態' },
]
export const REGISTER_HISTORY_COLUMNS: Column[] = [
  { key: 'fanMac', label: 'FAN MAC/IMEI' },
  { key: 'fanSerial', label: 'FAN序號' },
  { key: 'elecNo', label: '電號' },
  { key: 'module', label: '模組型號' },
  { key: 'fanVer', label: 'FAN版本' },
  { key: 'meterFw', label: '電表韌體版本' },
  { key: 'imsi', label: 'FAN IMSI' },
  { key: 'simId', label: 'FAN SIM ID' },
  { key: 'time', label: '時間' },
]

/** 首次註冊時裝的舊款模組 */
const OLD_MODULE = 'SGCM-W51-TFA (SGCM-W51-TF)'

function registerBase(meterNo: string) {
  const r = mulberry32(hash(meterNo) ^ 0x52_45_47_00)
  const hex = (n: number, w: number) => n.toString(16).padStart(w, '0')
  const fields = meterDetailFields(meterNo)
  const elecNo = fields.find((f) => f.label === '電號')?.value ?? '--'
  // 與上方屬性格的「模組型號」同一顆模組，括號內為硬體平台代號
  const m = fields.find((f) => f.label === '模組型號')?.value ?? 'SGCM-W64-TNF'
  return {
    r,
    module: `${m} (${m.slice(0, -1)})`,
    fanMac: `001823ffff${hex(Math.floor(r() * 0xffffff), 6)}`,
    fanSerial: `AE11${pad(Math.floor(r() * 99999999), 8)}`,
    elecNo,
  }
}

export function registerRows(meterNo: string): Row[] {
  const { fanMac, fanSerial, elecNo, module } = registerBase(meterNo)
  return [{
    fanMac, fanSerial, elecNo,
    module,
    fanVer: '0109', meterFw: '1090301', fw: 'WT-001_v1120510a',
    imsi: '--', simId: '--',
    updatedAt: '2026/09/23 14:56:45',
    status: 'VALID',
  }]
}

/** 歷史紀錄：由新到舊，模組型號／韌體版本隨時間演進 */
export function registerHistoryRows(meterNo: string): Row[] {
  const { r, fanMac, fanSerial, elecNo, module } = registerBase(meterNo)
  // 較近兩筆是同一顆模組（升級 FAN 版本）；最早一筆是首次註冊時的舊模組，時間對上「首次註冊時間」
  const hist = [
    { module, fanVer: '0109', meterFw: '1090301', time: '2025/06/30 00:53:49' },
    { module, fanVer: '0107', meterFw: '1090301', time: '2024/03/12 09:21:07' },
    { module: OLD_MODULE, fanVer: '0103', meterFw: '1080915', time: '2022/08/30 12:45:18' },
  ]
  // 有些電表只換過一次模組，筆數 2–3 筆
  const n = r() < 0.4 ? 2 : 3
  return hist.slice(0, n).map((h) => ({ fanMac, fanSerial, elecNo, imsi: '--', simId: '--', ...h }))
}

export const NETWORK_COLUMNS: Column[] = [
  { key: 'updatedAt', label: '網管更新時間' },
  { key: 'rssi', label: '訊號值' },
  { key: 'lanTx', label: 'lan tx' },
  { key: 'lanRx', label: 'lan rx' },
  { key: 'wanTx', label: 'wan tx' },
  { key: 'wanRx', label: 'wan rx' },
]

export function networkRows(meterNo: string): Row[] {
  const r = mulberry32(hash(meterNo) ^ 0x4e_57_00_00)
  return Array.from({ length: ROWS }, (_, i) => ({
    updatedAt: rowTime(i),
    rssi: -(50 + Math.floor(r() * 20)),
    lanTx: 0,
    lanRx: 0,
    wanTx: Math.floor(r() * 8000),
    wanRx: Math.floor(r() * 45000),
  }))
}

/* ------------------------------------------------- 午夜資料 · 每日趨勢 */

/**
 * 午夜讀表一天只有一筆，用「當日 24 小時」的軸畫不出東西，因此另備一組**近 30 天**的
 * 日資料給圖表用（2026-09-07 業主意見）。
 *
 * 午夜讀值本身是**累計寄存器**，直接畫會是一條幾乎筆直的上升線，看不出異常；
 * 圖表改畫「當日用電量＝當日讀值 − 前一日讀值」，這才是維運與計費實際在看的數字。
 *
 * 缺漏日的處理有一個容易出錯的地方：電表在沒被讀到的那幾天仍然持續累計，
 * 因此**缺漏之後第一個有讀值的日子，其差值涵蓋了整段空窗**，畫成當日用電量會是
 * 一根假的高柱。這裡把該日一併標成不可計算（值為 null），寧可留白也不要給錯數字。
 */
export interface MidnightDailyPoint {
  /** MM/DD */
  date: string
  /** 當日售電量（日差值）；缺漏或前一日缺漏時為 null */
  sell: number | null
  /** 當日購電量（日差值） */
  buy: number | null
  /** 當日累計讀值（售電總仟瓦小時）；缺漏日為 null */
  reading: number | null
  /** 該日未收到午夜讀值 */
  missing: boolean
  /** 有讀值、但前一日缺漏，日差值不可比較 */
  gapAfter: boolean
}

const DAILY_END = new Date(2025, 0, 7) // 與畫面上的資料時間迄日一致

export function midnightDaily(meterNo: string, days = 30): MidnightDailyPoint[] {
  const r = mulberry32(hash(meterNo) ^ 0x4d_44_59_00)
  // 一段連續缺漏（模擬通訊中斷），落在區間中段
  const missStart = 6 + Math.floor(r() * (days - 12))
  const missLen = 1 + Math.floor(r() * 3)

  let reading = 27000 + Math.round(r() * 400)
  let buyReading = 900 + Math.round(r() * 60)
  const raw = Array.from({ length: days }, (_, i) => {
    const d = new Date(DAILY_END)
    d.setDate(d.getDate() - (days - 1 - i))
    // 週末用電略低，讓曲線有可讀的節奏而不是純亂數
    const weekend = d.getDay() === 0 || d.getDay() === 6
    reading += (weekend ? 14 : 22) + r() * 16
    buyReading += (weekend ? 0.6 : 1.1) + r() * 0.8
    return {
      date: `${pad(d.getMonth() + 1, 2)}/${pad(d.getDate(), 2)}`,
      reading, buyReading,
      missing: i >= missStart && i < missStart + missLen,
    }
  })

  return raw.map((cur, i) => {
    const prev = raw[i - 1]
    const gapAfter = !cur.missing && !!prev?.missing
    const usable = !cur.missing && !!prev && !prev.missing
    return {
      date: cur.date,
      sell: usable ? Math.round((cur.reading - prev.reading) * 100) / 100 : null,
      buy: usable ? Math.round((cur.buyReading - prev.buyReading) * 100) / 100 : null,
      reading: cur.missing ? null : Math.round(cur.reading * 100) / 100,
      missing: cur.missing,
      gapAfter,
    }
  })
}

/* ----------------------------------------------- 需量復歸資料（DRR） */

/**
 * 需量復歸資料（Figma 3639:32240）—— 不是表格，是一張三欄式屬性清單。
 *
 * 欄位由「售電／購電」× 六個時段（尖峰、平日半尖峰、離峰、週六半尖峰、E峰、F峰）
 * × 四個面向（連續累計、累計、指示、仟瓦小時）＋ 各時段的最大需量日期／時間展開而成，
 * 因此數量很多但結構規律。這裡照設計稿的**顯示順序**列出，不重排。
 */
const DRR_LABELS: string[] = [
  '資料時間', '最近一次需量復歸日期', '程式ID號碼',
  '電池使用時間', '售電最大需量之日期', '售電最大需量之時間',
  '售電尖峰需量(連續累計)', '售電尖峰需量(累計)', '售電尖峰需量(指示)',
  '售電尖峰最大需量之日期', '售電尖峰最大需量之時間', '售電尖峰仟瓦小時',
  '售電平日半尖峰需量(連續累計)', '售電平日半尖峰需量(累計)', '售電平日半尖峰需量(指示)',
  '售電平日半尖峰最大需量之日期', '售電平日半尖峰最大需量之時間', '售電平日半尖峰仟瓦小時',
  '售電離峰需量(連續累計)', '售電離峰需量(累計)', '售電離峰需量(指示)',
  '售電離峰最大需量之日期', '售電離峰最大需量之時間', '售電離峰仟瓦小時',
  '售電週六半尖峰需量(連續累計)', '售電週六半尖峰需量(累計)', '售電週六半尖峰需量(指示)',
  '售電週六半尖峰最大需量之日期', '售電週六半尖峰最大需量之時間', '售電週六半尖峰仟瓦小時',
  '售電E峰需量(連續累計)', '售電E峰需量(累計)', '售電E峰需量(指示)',
  '售電E峰最大需量之日期', '售電E峰最大需量之時間', '售電E峰仟瓦小時',
  '售電F峰需量(連續累計)', '售電F峰需量(累計)', '售電F峰需量(指示)',
  '售電F峰最大需量之日期', '售電F峰最大需量之時間', '售電F峰仟瓦小時',
  '售電總仟瓦小時', '總售電kVarh (Q1)', '總售電kVarh (Q2)',
  '需量時段剩餘時間', '需量復歸次數', '區處代號ID2',
  '電號ID1', '瞬時需量', '瞬時kVA',
  '瞬時功率因數', '表號', '購電最大需量日期',
  '購電最大需量時間', '購電尖峰需量(連續累計)', '購電尖峰需量(累計)',
  '購電尖峰需量(指示)', '購電尖峰仟瓦小時', '購電平日半尖峰需量(連續累計)',
  '購電平日半尖峰需量(累計)', '購電平日半尖峰需量(指示)', '購電平日半尖峰仟瓦小時',
  '購電離峰需量(連續累計)', '購電離峰需量(累計)', '購電離峰需量(指示)',
  '購電離峰仟瓦小時', '購電週六半尖峰需量(連續累計)', '購電週六半尖峰需量(累計)',
  '購電週六半尖峰需量(指示)', '購電週六半尖峰仟瓦小時', '購電E峰需量(連續累計)',
  '購電E峰需量(累計)', '購電E峰需量(指示)', '購電E峰仟瓦小時',
  '購電F峰需量(連續累計)', '購電F峰需量(累計)', '購電F峰需量(指示)',
  '購電F峰仟瓦小時', '購電總仟瓦小時', '總購電kVarh (Q3)',
  '變比器倍數', 'HES接收時間', '傳送至MDMS時間',
]

/** 依欄位名稱決定值的長相 —— 日期、時刻、時間戳、識別碼與數值各有格式 */
function drrValue(label: string, r: () => number): string {
  const d2 = (n: number) => String(n).padStart(2, '0')
  const date = () => `2026/${d2(7 + Math.floor(r() * 2))}/${d2(1 + Math.floor(r() * 28))}`
  const time = () => `${d2(Math.floor(r() * 24))}:${d2(Math.floor(r() * 4) * 15)}:00`
  const stamp = () => `2026/08/31 ${d2(1 + Math.floor(r() * 2))}:${d2(Math.floor(r() * 60))}:${d2(Math.floor(r() * 60))}`

  if (label === '資料時間' || label === 'HES接收時間' || label === '傳送至MDMS時間') return stamp()
  if (label === '最近一次需量復歸日期') return date()
  if (label === '程式ID號碼') return String(4000 + Math.floor(r() * 999))
  if (label === '電池使用時間') return String(700000 + Math.floor(r() * 99999))
  if (label === '需量時段剩餘時間') return String(Math.floor(r() * 900))
  if (label === '需量復歸次數') return String(Math.floor(r() * 99))
  if (label === '區處代號ID2') return String(1 + Math.floor(r() * 9))
  if (label === '電號ID1') return String(60000000 + Math.floor(r() * 9999999))
  if (label === '表號') return `KV${20000000 + Math.floor(r() * 999999)}`
  if (label === '變比器倍數') return '1'
  if (label.includes('日期')) return r() < 0.18 ? '--' : date()
  if (label.includes('之時間')) return r() < 0.18 ? '--' : time()
  // 其餘為數值：多數時段沒有用電而為 0，少數帶實際讀值
  const v = r()
  if (v < 0.42) return '0.0'
  if (v < 0.55) return (r() * 0.01).toFixed(4)
  if (v < 0.8) return (r() * 100).toFixed(4)
  return (r() * 9000).toFixed(4)
}

export function drrFields(meterNo: string): InfoField[] {
  const r = mulberry32(hash(meterNo) ^ 0x44_52_52_00)
  return DRR_LABELS.map((label) => ({ label, value: drrValue(label, r) }))
}
