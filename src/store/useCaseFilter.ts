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

/** 完整顯示名，例如 二案(108-FET) */
export const caseFullName = (c: CaseDef) => `${c.name}(${c.code}-${c.vendor})`

interface CaseFilterState {
  selected: Set<string>
  toggle: (id: string) => void
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
