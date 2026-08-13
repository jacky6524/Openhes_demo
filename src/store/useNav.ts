import { create } from 'zustand'

/** which top-level demo screen is showing (lightweight client-side routing) */
export type View = 'overview' | 'dcu' | 'dcuDetail' | 'warroom'

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
  dcuDetailFrom: 'dcu',
  setView: (view) => set({ view }),
  openDcuDetail: (model, from) =>
    set({ view: 'dcuDetail', dcuModel: model, dcuDetailFrom: from ?? (get().view === 'dcuDetail' ? get().dcuDetailFrom : get().view) }),
}))
