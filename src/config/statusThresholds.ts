import { create } from 'zustand'

/**
 * 燈號門檻 —— 對應後端：
 *   讀取  GET /api/overview/status-thresholds（ovw-002）
 *   設定  AppConfig 的 status 分類，10 個鍵 openhes.status.<指標>.good／.warning（GET /api/config、PUT /api/config/key/{key}）
 * 後端一律用 0～1 小數，下限 0.5、上限 1，good 必須大於 warning，改值後「下次使用（≤30 秒）」生效。
 * 這裡存百分比（97＝0.97）。
 *
 * 2026-11-04 起由「權限管理 › 參數調整」修改（只改記憶體，重新整理還原成種子值）。
 * 目前只有「裝置管理 › 裝置列表」吃這份；系統總覽（config/thresholds.ts）與 DCU總覽
 * （ONLINE_RATE_THRESHOLDS）還是各自的舊值，是否一起改吃這份待業主確認。
 * TODO: 上線改成啟動時打 ovw-002 取得、參數調整頁儲存時打 PUT /config/key/{key}（updatedBy＝webui:<帳號>）。
 */
export type ApiMetric = 'meterConnectivity' | 'dcuConnectivity' | 'lpRate' | 'altRate' | 'midnightRate'

export interface ApiThreshold { good: number; warning: number } // 百分比

export interface MetricMeta {
  key: ApiMetric
  label: string
  /** AppConfig 設定鍵的中段：openhes.status.<slug>.good／.warning */
  slug: string
  /** 這個指標目前套用在哪些畫面（給操作者看改了會影響哪裡） */
  usedBy: string
}

export const METRICS: MetricMeta[] = [
  { key: 'meterConnectivity', label: '電表連線率', slug: 'meter-connectivity', usedBy: '裝置列表・上線率' },
  { key: 'dcuConnectivity', label: 'DCU 連線率', slug: 'dcu-connectivity', usedBy: '—（尚未套用）' },
  { key: 'lpRate', label: 'LP 讀表率', slug: 'lp-rate', usedBy: '裝置列表・讀表率' },
  { key: 'altRate', label: 'ALT 讀表率', slug: 'alt-rate', usedBy: '—（尚未套用）' },
  { key: 'midnightRate', label: 'MN 讀表率', slug: 'mn-rate', usedBy: '—（尚未套用）' },
]

/** 後端限制（同 AppConfig 的 minValue／maxValue） */
export const LIMIT = { min: 50, max: 100 } as const
/** 原廠預設（AppConfig defaultValue；五個指標相同） */
export const DEFAULT_THRESHOLD: ApiThreshold = { good: 97, warning: 95 }

/** 最後修改紀錄（每個設定鍵各一筆；null＝從沒改過、沿用系統預設） */
export interface ChangeLog { by: string; at: string }

/** 2026-11-04 從 GET /api/config 實打取得的值與修改紀錄 */
const SEED: Record<ApiMetric, ApiThreshold> = {
  meterConnectivity: { good: 97, warning: 95 },
  dcuConnectivity: { good: 97, warning: 95 },
  lpRate: { good: 97, warning: 95 },
  altRate: { good: 97, warning: 95 },
  midnightRate: { good: 97, warning: 95 },
}
const SEED_LOG: Record<ApiMetric, { good: ChangeLog | null; warning: ChangeLog | null }> = {
  meterConnectivity: { good: null, warning: { by: 'webui:vincent', at: '2026/10/01 15:18' } },
  dcuConnectivity: { good: null, warning: null },
  lpRate: { good: { by: 'webui', at: '2026/09/30 15:29' }, warning: null },
  altRate: { good: null, warning: null },
  midnightRate: { good: null, warning: null },
}

interface State {
  values: Record<ApiMetric, ApiThreshold>
  log: Record<ApiMetric, { good: ChangeLog | null; warning: ChangeLog | null }>
  /** 一次存多個指標；只有值真的變了的那一側才寫修改紀錄 */
  save: (next: Record<ApiMetric, ApiThreshold>, by: string) => void
}

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const useThresholds = create<State>((set) => ({
  values: SEED,
  log: SEED_LOG,
  save: (next, by) =>
    set((s) => {
      const log = { ...s.log }
      const at = stamp()
      for (const m of METRICS) {
        const was = s.values[m.key]
        const now = next[m.key]
        log[m.key] = {
          good: now.good !== was.good ? { by, at } : s.log[m.key].good,
          warning: now.warning !== was.warning ? { by, at } : s.log[m.key].warning,
        }
      }
      return { values: next, log }
    }),
}))

export type Light = 'good' | 'warning' | 'alert'
export function lightOf(pct: number, t: ApiThreshold): Light {
  if (pct >= t.good) return 'good'
  if (pct >= t.warning) return 'warning'
  return 'alert'
}

/** 單一指標的驗證訊息；沒問題回 null（規則同後端 PUT /config 的 400） */
export function validate(t: ApiThreshold): string | null {
  for (const [side, v] of [['良好', t.good], ['注意', t.warning]] as const) {
    if (!Number.isFinite(v)) return `${side}門檻請輸入數字`
    if (v < LIMIT.min || v > LIMIT.max) return `${side}門檻需介於 ${LIMIT.min}% ～ ${LIMIT.max}%`
  }
  if (t.good <= t.warning) return '良好門檻必須大於注意門檻'
  return null
}
