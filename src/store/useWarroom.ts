import { create } from 'zustand'
import { DEFAULT_CITY, dcuById, meterById } from '@/data/dcuFleet'

export type WarTab = 'fault' | 'relation'
export type WarLevel = 'taiwan' | 'city' // 全台選縣市 / 縣市選行政區
/** DCU 列表狀態篩選；'online' ＝ 連線（正常＋停用，即非斷線），供 KPI 卡點擊帶入 */
export type DcuListFilter = 'all' | 'online' | 'active' | 'offline' | 'disabled'
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
  selectDcu: (id: string | null) => void
  /** 點同一台＝收合（比照裝置列表：再次點擊縮回電表列表） */
  toggleDcu: (id: string) => void
  selectMeter: (id: string | null) => void
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
  selectDcu: (selectedDcuId) => set({ selectedDcuId, selectedMeterId: null }),
  toggleDcu: (id) => set((s) => (s.selectedDcuId === id ? { selectedDcuId: null, selectedMeterId: null } : { selectedDcuId: id, selectedMeterId: null })),
  // 直接點電表時，一併帶出其收容 DCU，讓右側電表列表展開並定位到該列。
  // 故障地圖不畫電表，因此選電表一律切到關係地圖，才看得到目標與其歸屬。
  selectMeter: (selectedMeterId) =>
    set((s) => {
      if (!selectedMeterId) return { selectedMeterId: null }
      const dcuId = meterById.get(selectedMeterId)?.dcuId ?? s.selectedDcuId
      return { selectedMeterId, selectedDcuId: dcuId, tab: 'relation' as WarTab }
    }),
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
