import { create } from 'zustand'
import { DCU_LIST_ROWS, METER_LIST_ROWS } from '@/data/dcuListPage'

/**
 * 裝置群組（裝置管理 · 裝置群組頁）的共用狀態。
 * 抽成 store 是因為即時讀表的「群組」下拉要列出這裡的群組 —— 在裝置群組頁新增／改名／刪除，
 * 即時讀表的選項會跟著變。只存在記憶體，重新整理還原成種子資料。
 * TODO: 上線改讀裝置群組 API。
 */
export type GroupKind = 'dcu' | 'meter'
export interface DeviceGroup { name: string; ids: string[]; creator: string }

export const GROUP_KINDS: Array<{ key: GroupKind; label: string }> = [
  { key: 'dcu', label: 'DCU群組' },
  { key: 'meter', label: '電表群組' },
]

const CATALOG_IDS: Record<GroupKind, string[]> = {
  dcu: DCU_LIST_ROWS.map((d) => d.serial),
  meter: METER_LIST_ROWS.map((m) => m.meterNo),
}

const seedGroups = (k: GroupKind): DeviceGroup[] => {
  const ids = CATALOG_IDS[k]
  const all: DeviceGroup[] = [
    { name: '群組A', ids: ids.slice(0, 20), creator: 'system' },
    { name: '群組B', ids: ids.slice(20, 32), creator: 'system' },
    { name: '群組C', ids: ids.slice(32, 37), creator: 'system' },
  ]
  return k === 'dcu' ? all : all.slice(0, 2) // 設計稿：DCU群組 (3)、電表群組 (2)
}

interface State {
  groups: Record<GroupKind, DeviceGroup[]>
  patchGroups: (k: GroupKind, fn: (gs: DeviceGroup[]) => DeviceGroup[]) => void
}

export const useDeviceGroups = create<State>((set) => ({
  groups: { dcu: seedGroups('dcu'), meter: seedGroups('meter') },
  patchGroups: (k, fn) => set((s) => ({ groups: { ...s.groups, [k]: fn(s.groups[k]) } })),
}))
