/* Deterministic mock data for 裝置管理 · DCU 戰情室 (Figma 3178:12689). */
import { status, series } from '@/tokens'

/* ---------- 異常原因 (abnormal reasons) ---------- */
export type ReasonKey = 'unstable' | 'duplicate' | 'frequent' | 'offline'

export const REASONS: { key: ReasonKey; label: string; color: string }[] = [
  { key: 'unstable', label: '未穩定', color: status.danger.fg }, // 紅
  { key: 'duplicate', label: '重複歸屬', color: status.warning.fg }, // 橘
  { key: 'frequent', label: '頻繁切換', color: '#EAB308' }, // 黃
  { key: 'offline', label: '斷線', color: series.alt }, // 粉 (#FF9A9A)
]
export const REASON_COLOR: Record<ReasonKey, string> = Object.fromEntries(
  REASONS.map((r) => [r.key, r.color]),
) as Record<ReasonKey, string>
export const REASON_LABEL: Record<ReasonKey, string> = Object.fromEntries(
  REASONS.map((r) => [r.key, r.label]),
) as Record<ReasonKey, string>

/* ---------- DCU 狀態 KPI (信義區) ---------- */
export const WAR_SUMMARY = {
  scope: '信義區',
  returnRate: 98.5, // 回傳率(%)
  missing: 1920, // 缺漏
  total: 2580, // DCU 總數
  onlineRate: 99.1, // 在線率(%)
  abnormal: 120, // 異常 DCU
  offline: 20, // 離線
}

/* ---------- 異常 DCU 表格列 ---------- */
export interface AbnormalDcuRow {
  dcu: string // DCU 型號
  serial: string // DCU 編號
  reasons: ReasonKey[] // 異常原因 (1~4)
  online: number // 上線數
  total: number // 總數
  read: number // 讀表
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALL_REASONS: ReasonKey[] = ['unstable', 'duplicate', 'frequent', 'offline']

/** 40 abnormal DCU rows — every row carries 未穩定 plus a deterministic subset. */
export const ABNORMAL_DCU_ROWS: AbnormalDcuRow[] = Array.from({ length: 40 }, (_, i) => {
  const r = mulberry32(0x51ed + i * 2654435761)
  const total = 108 + Math.floor(r() * 16) // ~116
  const online = total - Math.floor(r() * 3)
  const read = r() < 0.3 ? total : 88 + Math.floor(r() * 12) // 92~100 or full

  // 未穩定 always present; add others by probability so the dot patterns vary
  const reasons: ReasonKey[] = ['unstable']
  if (r() < 0.55) reasons.push('duplicate')
  if (r() < 0.7) reasons.push('frequent')
  if (r() < 0.18) reasons.push('offline')

  return {
    dcu: 'AE1092D0000',
    serial: 'B6828AA33-1',
    reasons: ALL_REASONS.filter((k) => reasons.includes(k)), // keep legend order
    online,
    total,
    read,
  }
})

/* ---------- 監控地圖 markers (信義區 Xinyi District, Taipei) ---------- */
export type DcuMarkerStatus = 'normal' | 'abnormal'
export interface WarMapMarker {
  id: string
  lng: number
  lat: number
  status: DcuMarkerStatus
}

export const WAR_MAP_CENTER: [number, number] = [121.5625, 25.0335]
export const WAR_MAP_ZOOM = 13.4

export const WAR_MAP_MARKERS: WarMapMarker[] = [
  { id: 'DCU-01', lng: 121.5468, lat: 25.0292, status: 'normal' },
  { id: 'DCU-01', lng: 121.5512, lat: 25.0248, status: 'normal' },
  { id: 'DCU-03', lng: 121.5548, lat: 25.0372, status: 'abnormal' },
  { id: 'DCU-03', lng: 121.5495, lat: 25.0208, status: 'abnormal' },
  { id: 'DCU-03', lng: 121.5602, lat: 25.0225, status: 'abnormal' },
  { id: 'DCU-04', lng: 121.5688, lat: 25.0335, status: 'normal' },
  { id: 'DCU-02', lng: 121.5628, lat: 25.0182, status: 'normal' },
  { id: 'DCU-03', lng: 121.5585, lat: 25.0298, status: 'normal' },
  { id: 'DCU-03', lng: 121.5662, lat: 25.0272, status: 'normal' },
]
