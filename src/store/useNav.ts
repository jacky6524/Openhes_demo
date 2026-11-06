import { create } from 'zustand'

/** which top-level demo screen is showing (lightweight client-side routing) */
export type View =
  | 'overview' | 'dcu' | 'dcuList' | 'meterList' | 'instantQuery' | 'registrationConflict' | 'deviceGroups' | 'deviceRecord' | 'disabledList' | 'deviceModule' | 'channelPlan' |'readPerformance' | 'statsReport' | 'dcuDetail' | 'warroom'
  // 讀表管理兩頁
  | 'instantRead' | 'mdmsUpload'
  // 權限管理三頁
  | 'permAccount' | 'permFunction' | 'permRole' | 'permParams'

interface NavState {
  view: View
  dcuModel: string | null // selected DCU for the detail screen
  /** 詳細頁是從哪一頁開的 —— 返回時回到原頁（裝置列表 or DCU總覽），側欄也依此高亮 */
  dcuDetailFrom: View
  setView: (v: View) => void
  openDcuDetail: (model: string, from?: View) => void
}

export const useNav = create<NavState>((set, get) => ({
  view: 'overview',
  dcuModel: null,
  // 「裝置列表」已自側欄移除，詳細頁預設退回 DCU清單
  dcuDetailFrom: 'dcuList',
  setView: (view) => set({ view }),
  openDcuDetail: (model, from) =>
    set({ view: 'dcuDetail', dcuModel: model, dcuDetailFrom: from ?? (get().view === 'dcuDetail' ? get().dcuDetailFrom : get().view) }),
}))
