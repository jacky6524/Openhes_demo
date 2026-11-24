import { create } from 'zustand'

/**
 * 案別篩選 — 共享狀態，讓 logo 右側的案別徽章與右上角的案別下拉保持同步。
 * 支援複數勾選；未選任何案別時視為 ALL（全部）。
 *
 * 案別命名格式：<序數案>(<標案編號>-<得標廠商>)，例如 二案(108-FET)。
 * TODO: 案別清單與多選後的資料篩選需接 API；目前為前端 demo。
 */
export interface CaseDef {
  id: string
  /** 序數名，例如 二案 */
  name: string
  /** 標案編號，例如 108 */
  code: string
  /** 得標廠商，例如 FET */
  vendor: string
}

export const CASES: CaseDef[] = [
  { id: 'case1', name: '一案', code: '106', vendor: 'FET' },
  { id: 'case2', name: '二案', code: '108', vendor: 'FET' },
  { id: 'case3', name: '三案', code: '110', vendor: 'CHT' },
  { id: 'case4', name: '四案', code: '112', vendor: 'TECO' },
  { id: 'case5', name: '五案', code: '113', vendor: 'FET' },
]

/**
 * 各案別涵蓋的縣市代碼清單 (Demo 規格：各案別涵蓋之縣市不同)
 * - 一案 (106-FET)：北部都會區（北北基桃宜）
 * - 二案 (108-FET)：桃竹苗中彰投（中北部）
 * - 三案 (110-CHT)：雲嘉南高屏與西南離島（南部區處）
 * - 四案 (112-TECO)：東部及偏鄉山區（宜蘭、花蓮、台東、南投、屏東、連江）
 * - 五案 (113-FET)：六都重點都會擴充案（台北、新北、桃園、台中、台南、高雄）
 */
export const CASE_COUNTY_MAP: Record<string, string[]> = {
  case1: ['TPE', 'NTPC', 'KEE', 'TYC', 'ILA'],
  case2: ['TYC', 'HSC', 'HSCC', 'MIA', 'TCH', 'CHA', 'NTO'],
  case3: ['YUN', 'CYI', 'CYC', 'TNN', 'KHH', 'PIF', 'PEH', 'KMN'],
  case4: ['ILA', 'HUA', 'TTT', 'NTO', 'PIF', 'LJU'],
  case5: ['TPE', 'NTPC', 'TYC', 'TCH', 'TNN', 'KHH'],
}

/** 完整顯示名，例如 二案(108-FET) */
export const caseFullName = (c: CaseDef) => `${c.name}(${c.code}-${c.vendor})`

interface CaseFilterState {
  selected: Set<string>
  toggle: (id: string) => void
  setSelected: (selected: Set<string>) => void
  clear: () => void
}

export const useCaseFilter = create<CaseFilterState>((set) => ({
  selected: new Set<string>(), // 預設無篩選 → ALL
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected)
      next.has(id) ? next.delete(id) : next.add(id)
      return { selected: next }
    }),
  setSelected: (selected) => set({ selected: new Set(selected) }),
  clear: () => set({ selected: new Set<string>() }),
}))

/**
 * 目前案別顯示文字；無篩選 → '全部'。
 * 單選 / 複選皆顯示含編碼的完整名（二案(108-FET)、三案(110-CHT)），
 * 讓左上角徽章一眼看得出標案編號與得標廠商。
 */
export function caseLabel(selected: Set<string>): string {
  if (selected.size === 0) return '全部'
  return CASES.filter((c) => selected.has(c.id)).map(caseFullName).join('、')
}
