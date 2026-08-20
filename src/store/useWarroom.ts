import { create } from 'zustand'
import { DEFAULT_CITY, dcuById, meterById } from '@/data/dcuFleet'

export type WarTab = 'fault' | 'relation'
export type WarLevel = 'taiwan' | 'city' // 全台選縣市 / 縣市選行政區
/**
 * 右側清單的檢視／篩選；'online' ＝ 連線（正常＋停用，即非斷線），
 * 'mis' ＝ 切換成「歸屬錯誤電表清單」（不是 DCU 篩選，是換一張清單）。供 KPI 方塊點擊帶入。
 */
export type DcuListFilter = 'all' | 'online' | 'active' | 'offline' | 'disabled' | 'mis'
const MAX_PIN = 3

interface WarroomState {
  level: WarLevel
  city: string
  district: string
  tab: WarTab
  selectedDcuId: string | null
  selectedMeterId: string | null
  /** 列表 hover 的 DCU（A3：列表 ↔ 地圖高亮連動） */
  hoverDcuId: string | null
  /** DCU 列表的狀態篩選（KPI 卡點擊可直接帶入） */
  listFilter: DcuListFilter
  /**
   * 這次選取是否來自地圖 —— 來自地圖時，右側列表把該列排到最上方，方便對照；
   * 直接點列表列時不重排（否則列會在游標底下跳走）。
   */
  pinSelected: boolean
  /** 全台層級右側是否改顯示 DCU 列表（預設為縣市故障分布） */
  dcuListOpen: boolean
  pinnedDcuIds: string[]
  resetNonce: number
  refitNonce: number
  updatedAt: string

  enterTaiwan: () => void
  setCity: (c: string) => void
  setDistrict: (d: string) => void
  setTab: (t: WarTab) => void
  /** 由地圖選取 DCU（會把列表該列置頂） */
  selectDcu: (id: string | null) => void
  /** 點同一台＝收合（比照裝置列表：再次點擊縮回電表列表）；來自列表，不置頂 */
  toggleDcu: (id: string) => void
  /** opts.pin 預設 true（來自地圖）；列表列點擊要傳 { pin: false } */
  selectMeter: (id: string | null, opts?: { pin?: boolean }) => void
  /** 歸屬錯誤電表清單 → 跳到該電表在 L3 的點位 */
  focusMisMeter: (meterId: string) => void
  setHoverDcuId: (id: string | null) => void
  /** 設定列表篩選；一併清除選取並開啟 DCU 列表，讓篩選結果直接可見 */
  setListFilter: (f: DcuListFilter) => void
  /** 全台層級：關閉 DCU 列表，回到縣市故障分布 */
  closeDcuList: () => void
  togglePin: (id: string) => void
  clearSelection: () => void
  resetView: () => void
  refitDistrict: () => void
  handoffToRelation: (dcuId: string) => void
}

export const useWarroom = create<WarroomState>((set) => ({
  // 首頁＝全台縣市故障分布；進入縣市預設顯示所有行政區（district=''）
  level: 'taiwan',
  city: DEFAULT_CITY,
  district: '',
  tab: 'fault',
  selectedDcuId: null,
  selectedMeterId: null,
  hoverDcuId: null,
  listFilter: 'all',
  pinSelected: false,
  dcuListOpen: false,
  pinnedDcuIds: [],
  resetNonce: 0,
  refitNonce: 0,
  updatedAt: '前一小時',

  // 回到全台層級（選縣市）；兩張地圖都支援全台，保留目前頁籤，並清掉行政區篩選
  enterTaiwan: () => set({ level: 'taiwan', district: '', dcuListOpen: false, listFilter: 'all', selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: [] }),
  // 選縣市 → 進入縣市層級，預設 district=''（所有行政區放滿畫面）
  setCity: (city) => {
    set({ level: 'city', city, district: '', selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: [] })
  },
  setDistrict: (district) => set({ district, selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: [] }),
  // 兩張地圖的範圍邏輯一致：切換頁籤不改變層級／行政區，各自照當前範圍撐滿畫面
  setTab: (tab) => set({ tab }),
  // 從地圖選 DCU：右側一併切到 DCU 列表（全台層級本來顯示的是縣市分布），
  // 否則點了地圖右邊沒有任何反應
  selectDcu: (selectedDcuId) => set({ selectedDcuId, selectedMeterId: null, pinSelected: true, dcuListOpen: true, listFilter: 'all' }),
  toggleDcu: (id) => set((s) => (s.selectedDcuId === id ? { selectedDcuId: null, selectedMeterId: null, pinSelected: false } : { selectedDcuId: id, selectedMeterId: null, pinSelected: false })),
  // 直接點電表時，一併帶出其收容 DCU，讓右側電表列表展開並定位到該列。
  // 故障地圖不畫電表，因此選電表一律切到關係地圖，才看得到目標與其歸屬。
  selectMeter: (selectedMeterId, opts) =>
    set((s) => {
      const pinSelected = opts?.pin ?? true
      if (!selectedMeterId) return { selectedMeterId: null, pinSelected }
      const dcuId = meterById.get(selectedMeterId)?.dcuId ?? s.selectedDcuId
      return { selectedMeterId, selectedDcuId: dcuId, tab: 'relation' as WarTab, pinSelected, dcuListOpen: true }
    }),
  /**
   * 從歸屬錯誤電表清單跳到該電表的點位：直接落在 L3（行政區）的關係地圖，
   * 那是唯一畫得出「實際收容 ↔ 白名單應屬」兩條線的層級。
   */
  focusMisMeter: (meterId) => {
    const m = meterById.get(meterId)
    if (!m) return
    set({
      level: 'city', city: m.city, district: m.district, tab: 'relation',
      selectedMeterId: meterId, selectedDcuId: m.dcuId, pinSelected: true,
      dcuListOpen: true, listFilter: 'all',
    })
  },
  setHoverDcuId: (hoverDcuId) => set({ hoverDcuId }),
  setListFilter: (listFilter) => set({ listFilter, dcuListOpen: true, selectedDcuId: null, selectedMeterId: null }),
  closeDcuList: () => set({ dcuListOpen: false, listFilter: 'all', selectedDcuId: null, selectedMeterId: null }),
  togglePin: (id) =>
    set((s) => (s.pinnedDcuIds.includes(id) ? { pinnedDcuIds: s.pinnedDcuIds.filter((x) => x !== id) } : { pinnedDcuIds: [...s.pinnedDcuIds, id].slice(-MAX_PIN) })),
  clearSelection: () => set({ selectedDcuId: null, selectedMeterId: null }),
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  refitDistrict: () => set((s) => ({ refitNonce: s.refitNonce + 1 })),
  handoffToRelation: (dcuId) => {
    const dcu = dcuById.get(dcuId)
    set((s) => ({ level: 'city', tab: 'relation', city: dcu?.city ?? s.city, district: dcu?.district ?? s.district, selectedDcuId: dcuId, selectedMeterId: null }))
  },
}))
