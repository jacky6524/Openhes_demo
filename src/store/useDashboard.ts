import { create } from 'zustand'
import type { MetricKey, RegionNode } from '@/types'
import { TAIWAN, getById, updateTaiwanTree } from '@/data/mockData'
import { useCaseFilter } from '@/store/useCaseFilter'

interface DashboardState {
  selectedKpi: MetricKey // active KPI → map colour + shared card (default 'lp')
  drillPath: RegionNode[] // [TW, county, district...] — map level stack
  drawerRegion: RegionNode | null // L3 detail drawer (replaces cross module)

  selectKpi: (k: MetricKey) => void
  drillInto: (node: RegionNode) => void
  goBack: () => void
  jumpTo: (index: number) => void // breadcrumb cross-level jump
  openDrawer: (node: RegionNode) => void
  closeDrawer: () => void
  setCaseFilter: (cases: Set<string>) => void
}

export const useDashboard = create<DashboardState>((set, get) => ({
  selectedKpi: 'lp', // §4.1 default selected = LP
  drillPath: [TAIWAN],
  drawerRegion: null,

  selectKpi: (k) => set({ selectedKpi: k }),

  drillInto: (node) => {
    const path = get().drillPath
    // L3 行政區 is the leaf: drill ISOLATES it on the map (其他行政區隱藏,
    // 避免同時顯示過多區域) and opens the DCU detail drawer alongside.
    if (node.level === 'L3') {
      // already at this district → just (re)open the drawer
      if (path[path.length - 1]?.id === node.id) {
        set({ drawerRegion: node })
        return
      }
      set({ drillPath: [...path, node], drawerRegion: node })
      return
    }
    set({ drillPath: [...path, node], drawerRegion: null })
  },

  goBack: () =>
    set((s) => ({
      drillPath: s.drillPath.length > 1 ? s.drillPath.slice(0, -1) : s.drillPath,
      drawerRegion: null,
    })),

  jumpTo: (index) =>
    set((s) => ({
      drillPath: s.drillPath.slice(0, index + 1),
      drawerRegion: null,
    })),

  openDrawer: (node) => set({ drawerRegion: getById(node.id) ?? node }),
  closeDrawer: () => set({ drawerRegion: null }),

  setCaseFilter: (cases) => {
    const { root, index } = updateTaiwanTree(cases)
    const currentPath = get().drillPath
    let newPath: RegionNode[] = [root]
    if (currentPath.length > 1) {
      const county = index[currentPath[1].id]
      if (county && county.metrics.meterTotal > 0) {
        newPath.push(county)
        if (currentPath.length > 2) {
          const district = index[currentPath[2].id]
          if (district && district.metrics.meterTotal > 0) {
            newPath.push(district)
          }
        }
      }
    }
    const currentDrawer = get().drawerRegion
    const updatedDrawer =
      currentDrawer && index[currentDrawer.id] && index[currentDrawer.id].metrics.meterTotal > 0
        ? index[currentDrawer.id]
        : null

    set({
      drillPath: newPath,
      drawerRegion: updatedDrawer,
    })
  },
}))

// 監聽案別切換，同步更新系統總覽資料樹
useCaseFilter.subscribe((state) => {
  useDashboard.getState().setCaseFilter(state.selected)
})

/* selectors */
export const useCurrentNode = () => useDashboard((s) => s.drillPath[s.drillPath.length - 1])
export const useScopeLabel = () => {
  const node = useCurrentNode()
  return node.id === 'TW' ? '全台' : node.name
}
