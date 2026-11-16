/*
 * 裝置管理 · DCU清單 (Figma 3677:24866) 的 mock 資料。
 *
 * 與 `dcuList.ts`（舊的裝置列表 mock）分開：這一頁的欄位是另一組
 * （頻道組別、通訊方式、白名單、模式…），共用同一份會互相牽制。
 * 一律 deterministic —— 由序號 hash 決定，重整結果相同。
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

export const CHANNELS = ['D', 'E', 'F'] as const
/** 通訊方式：正式機 UI 選項 LTE／ADSL／4G-R／SATCOM（2026-11-11 對齊 API 欄位文件） */
export const COMM_TYPES = ['LTE', 'ADSL', '4G-R', 'SATCOM'] as const
export const DCU_MODELS = ['SGDC-A16TF', 'SGDC-A14TF', 'SGDC-W61TF'] as const
/** 模式選項（2026-10-16 業主指定）與各自的說明；順序依業主給的排列 */
export const DCU_MODES = ['關閉RF', 'MN優先80%', '正常模式', '讀取1天LP'] as const
export const DCU_MODE_DESC: Record<(typeof DCU_MODES)[number], string> = {
  關閉RF: '關閉RF',
  'MN優先80%': '80%資源MN讀表',
  正常模式: '預設',
  讀取1天LP: '只讀取1天的LP值',
}
export const DCU_GROUPS = ['北一組', '北二組', '中一組', '南一組'] as const

/**
 * 區處及營業區＝tpcAreaCode＋areaName＋tpcBuCode，正式機顯示「07-台中 86」（2026-11-11 API 欄位文件）。
 * 三個欄位都缺時顯示「-」。
 */
export const AREAS = [['01', '北市'], ['02', '北南'], ['03', '北西']] as const
export function fmtArea(code?: string, name?: string, bu?: string) {
  if (!code && !name && !bu) return '-'
  return `${[code, name].filter(Boolean).join('-')}${bu ? ` ${bu}` : ''}`
}

export interface DcuListRow {
  serial: string // DCU序號（dcuId）
  code: string // DCU編號（districtId）
  online: boolean // 連線狀態
  enabled: boolean // 狀態（啟用／停用）
  meterCount: number // 電表數
  address: string
  areaCode: string // tpcAreaCode
  areaName: string // areaName
  buCode: string // tpcBuCode（營業區，2 碼）
  office: string // 區處及營業區（上面三個組好的顯示字串）
  eventCount: number // 事件數：> 0 才在詳細資料圖示上顯示 badge
  whitelistOnline: number // 白名單電表連線數
  channel: (typeof CHANNELS)[number] // 頻道組別
  comm: (typeof COMM_TYPES)[number] // 連線類型（4G-R／LTE／ADSL）
  ip: string
  mode: (typeof DCU_MODES)[number]
  whitelisted: boolean // 白名單（已加入／未加入）
  whitelistLock: boolean // 白名單鎖定（Y／N）
  model: (typeof DCU_MODELS)[number] // DCU型號（修改模式彈窗顯示）
  group: (typeof DCU_GROUPS)[number] // DCU群組（篩選用）
}

const STREETS = ['北新路三段', '寶元路一段', '中正路二段', '文化路一段', '民權路']

/** 100 台 DCU —— 與設計稿的「共 100 筆資料」一致 */
export const DCU_LIST_ROWS: DcuListRow[] = Array.from({ length: 100 }, (_, i) => {
  const serial = `AE1092D${pad(i + 1, 5)}`
  const r = mulberry32(hash(serial))
  const online = r() > 0.18
  const enabled = r() > 0.06
  const meterCount = Math.floor(r() * 3)
  const code = `B${5000 + Math.floor(r() * 999)}DC${30 + Math.floor(r() * 69)}-${1 + Math.floor(r() * 8)}`
  const address = `新北市新店區${STREETS[Math.floor(r() * STREETS.length)]}${100 + Math.floor(r() * 200)}巷${1 + Math.floor(r() * 20)}號`
  // 亂數取用順序維持原樣（區處、營業區），其他欄位才不會跟著變
  const [areaCode, areaName] = AREAS[Math.floor(r() * 3)]
  const buCode = String(60 + Math.floor(r() * 5))
  const evt = hash(serial + ':evt')
  return {
    serial,
    code,
    online,
    enabled,
    meterCount,
    address,
    areaCode,
    areaName,
    buCode,
    office: fmtArea(areaCode, areaName, buCode),
    eventCount: evt % 4 === 0 ? 1 + (evt % 9) : 0,
    // 白名單電表連線數不會超過電表數
    whitelistOnline: online ? Math.min(meterCount, Math.floor(r() * (meterCount + 1))) : 0,
    channel: CHANNELS[Math.floor(r() * CHANNELS.length)],
    comm: COMM_TYPES[Math.floor(r() * COMM_TYPES.length)],
    ip: `172.17.${100 + Math.floor(r() * 60)}.${Math.floor(r() * 255)}`,
    mode: r() < 0.86 ? '正常模式' : (['關閉RF', 'MN優先80%', '讀取1天LP'] as const)[Math.floor(r() * 3)],
    whitelisted: r() > 0.35,
    model: DCU_MODELS[Math.floor(r() * DCU_MODELS.length)],
    // 獨立雜湊判定，不動上面的亂數序列，其他欄位維持原值
    whitelistLock: hash(serial + ':lock') % 5 === 0,
    group: DCU_GROUPS[Math.floor(r() * DCU_GROUPS.length)],
  }
})

/* ---------------------------------------------------------- 拓樸圖 */

/** 拓樸圖頂部的 DCU 連線摘要 */
export interface TopologyHead {
  telecom: string
  txrx: string
  rssi: number
  upTime: number
  updateTime: string
}

/** 拓樸節點 —— 電表可再掛下一層電表（RF 中繼），因此是樹狀 */
export interface TopologyNode {
  meterNo: string // 表號
  customer: string // Customer（電號）
  mac: string
  txrx: string
  lqi: number
  updateTime: string
  address: string
  children?: TopologyNode[]
}

const TELECOMS = ['Far EasTone', 'Chunghwa Telecom', 'Taiwan Mobile']

export function topologyOf(serial: string): { head: TopologyHead; nodes: TopologyNode[] } {
  const r = mulberry32(hash(serial) ^ 0x54_4f_50_4f)
  const stamp = '2025/01/01 15:00:00'

  const node = (depth: number): TopologyNode => {
    const meterNo = `KT${19000000 + Math.floor(r() * 999999)}`
    const kids = depth === 0 && r() < 0.55 ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => node(1)) : undefined
    return {
      meterNo,
      customer: `01-${62000000 + Math.floor(r() * 999999)}-${Math.floor(r() * 9)}`,
      mac: `18BE92FFFF${pad(Math.floor(r() * 999), 3)}`,
      txrx: `${(1000 + Math.floor(r() * 8000)).toLocaleString('en-US')},${(1000 + Math.floor(r() * 3000)).toLocaleString('en-US')}`,
      lqi: 70 + Math.floor(r() * 30),
      updateTime: stamp,
      address: `新北市新店區寶元路一段${1 + Math.floor(r() * 99)}巷${1 + Math.floor(r() * 9)}號二樓`,
      children: kids,
    }
  }

  return {
    head: {
      telecom: TELECOMS[Math.floor(r() * TELECOMS.length)],
      txrx: `wan:${(20000 + Math.floor(r() * 9999)).toLocaleString('en-US')}/${(10000 + Math.floor(r() * 9999)).toLocaleString('en-US')}`,
      rssi: -(60 + Math.floor(r() * 35)),
      upTime: 1000 + Math.floor(r() * 900),
      updateTime: stamp,
    },
    nodes: Array.from({ length: 5 + Math.floor(r() * 3) }, () => node(0)),
  }
}

/* ---------------------------------------------------------- 電表清單 */

export const METER_CATEGORIES = ['A', 'B', 'C', 'D'] as const
export const MODULE_MODELS = ['SGCM-W15-TFB', 'SGCM-W61-TFB', 'SGCM-N71-NBF', 'SGCM-L51-LTF'] as const
export const METER_GROUPS = ['北一組', '北二組', '中一組', '南一組'] as const

/** 裝置管理 · 電表清單 (Figma 3677:26714) 的列 */
export interface MeterListRow {
  areaCode: string // tpcAreaCode
  areaName: string
  buCode: string // tpcBuCode
  office: string // 區處及營業區（組好的顯示字串，同 DCU清單）
  eventCount: number // 事件數：> 0 才在詳細資料圖示上顯示 badge
  online: boolean // 連線狀態
  elecNo: string // 電號
  meterNo: string // 表號
  moduleModel: (typeof MODULE_MODELS)[number]
  dcuCode: string // DCU編號；沒有掛 DCU 的電表為 ''
  dcuSerial: string // DCU序號；沒有掛 DCU 的電表為 ''
  fanMac: string
  moduleSerial: string // 模組序號
  address: string
  ip: string
  lastLp: string // 最後LP時間
  lastLpSameDay: boolean
  lastMn: string // 最後MN時間
  lastMnSameDay: boolean
  enabled: boolean // 狀態（啟用／停用）
  category: (typeof METER_CATEGORIES)[number] // 電表分類
  group: (typeof METER_GROUPS)[number] // 電表群組
}

/** 100 顆電表 —— 與設計稿的「共 100 筆資料」一致 */
export const METER_LIST_ROWS: MeterListRow[] = Array.from({ length: 100 }, (_, i) => {
  const meterNo = `WT${19000000 + i * 137 + 880}`
  const r = mulberry32(hash(meterNo))
  const online = r() > 0.16
  const dcu = DCU_LIST_ROWS[Math.floor(r() * DCU_LIST_ROWS.length)]
  const stamp = (sameDay: boolean) =>
    sameDay ? '2025/01/01 10:30:00' : `2024/12/${pad(26 + Math.floor(r() * 5), 2)} 10:30:00`
  const lpSame = online && r() > 0.12
  const mnSame = online && r() > 0.1
  /**
   * 約一成電表**沒有 DCU**（例如直連的 NB-IoT／LTE 模組）—— 2026-09-23 業主提醒：
   * 不是每顆電表都掛在 DCU 底下，所以電表清單預設以電號搜尋，DCU 只是選填篩選。
   * 用獨立的雜湊判定，不動上面亂數序列，其他欄位維持原值。
   */
  const noDcu = hash(meterNo + ':nodcu') % 10 === 0
  const evt = hash(meterNo + ':evt')
  return {
    areaCode: dcu.areaCode,
    areaName: dcu.areaName,
    buCode: dcu.buCode,
    office: dcu.office,
    eventCount: evt % 5 === 0 ? 1 + (evt % 6) : 0,
    online,
    // 電號一律 11 碼、不帶 -（2026-09-29 業主意見）
    elecNo: `${pad(10 + Math.floor(r() * 89), 2)}${50000000 + Math.floor(r() * 999999)}${Math.floor(r() * 9)}`,
    meterNo,
    moduleModel: MODULE_MODELS[Math.floor(r() * MODULE_MODELS.length)],
    dcuCode: noDcu ? '' : dcu.code,
    dcuSerial: noDcu ? '' : dcu.serial,
    fanMac: `B${6000 + Math.floor(r() * 999)}AA${10 + Math.floor(r() * 89)}-${1 + Math.floor(r() * 8)}`,
    moduleSerial: `AE1092D${pad(1 + Math.floor(r() * 999), 5)}`,
    address: dcu.address,
    ip: `172.17.${30 + Math.floor(r() * 30)}.${Math.floor(r() * 255)}`,
    lastLp: stamp(lpSame),
    lastLpSameDay: lpSame,
    lastMn: stamp(mnSame),
    lastMnSameDay: mnSame,
    enabled: r() > 0.08,
    category: METER_CATEGORIES[Math.floor(r() * METER_CATEGORIES.length)],
    group: METER_GROUPS[Math.floor(r() * METER_GROUPS.length)],
  }
})
