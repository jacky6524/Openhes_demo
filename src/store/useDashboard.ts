import { create } from 'zustand'
import type { MetricKey, RegionNode } from '@/types'
import { TAIWAN, getById } from '@/data/mockData'

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
}))

/* selectors */
export const useCurrentNode = () => useDashboard((s) => s.drillPath[s.drillPath.length - 1])
export const useScopeLabel = () => {
  const node = useCurrentNode()
  return node.id === 'TW' ? '全台' : node.name
}
