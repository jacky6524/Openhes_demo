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

/**
 * 2026-11-19 業主意見：順序改 電表 → DCU（同裝置管理選單，電表清單在前），兩種要能明顯區別 →
 * 各給一個識別色（color 字、soft 底）與短名 short；刻意避開品牌紅與告警色。
 * 群組下拉（QueryFields.GroupSelect）也照這個順序。
 */
export const GROUP_KINDS: Array<{ key: GroupKind; label: string; short: string; idLabel: string; color: string; soft: string }> = [
  { key: 'meter', label: '電表群組', short: '電表', idLabel: '表號', color: '#2563EB', soft: '#EAF1FE' },
  { key: 'dcu', label: 'DCU群組', short: 'DCU', idLabel: '序號', color: '#EA580C', soft: '#FFF0E6' },
]
export const kindOf = (k: GroupKind) => GROUP_KINDS.find((x) => x.key === k)!

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
