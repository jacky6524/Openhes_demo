import { useMemo, useState } from 'react'
import { Download, Trash2, Info } from 'lucide-react'
import { Th, Pagination } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'

/**
 * 統計分析 · 報表任務清單 (Figma 4255:33532 的主畫面 B＝4255:37918)。
 *
 * 篩選：報表類型／備註／合約編號／地區代碼／群組 ID → 清除條件／搜尋，另有「下載提醒」。
 * 表格：# ／ID／報表類型／備註／建立日期／產生日期／大小／狀態／錯誤內容／操作（下載、刪除）。
 * 同一個 section 裡還有長條圖畫面（4255:33533）與 pin-info 提示框，尚未讀取、未實作。
 * 資料全為 mock，刪除只動畫面上的列。
 */
const REPORT_TYPES = ['DCU狀態報表', '讀表資料', '電表問題報表'] as const
type ReportType = (typeof REPORT_TYPES)[number]
type JobState = 'done' | 'running' | 'error'

interface Job {
  id: string
  type: ReportType
  note: string
  createdAt: string
  generatedAt: string
  size: string
  state: JobState
  error: string
  contract: string
  area: string
  group: string
}

const STATE_META: Record<JobState, { label: string; tok: { fg: string; bg: string } }> = {
  done: { label: '已完成', tok: statusTok.normal },
  running: { label: '處理中', tok: statusTok.info },
  error: { label: '錯誤', tok: statusTok.danger },
}

/** 前 10 列照設計稿的狀態分佈，其餘循環補到 36 列讓分頁看得到 */
const SEED: Array<[ReportType, JobState, string, string]> = [
  ['讀表資料', 'done', '20KB', ''],
  ['讀表資料', 'running', '20KB', ''],
  ['讀表資料', 'done', '20KB', ''],
  ['DCU狀態報表', 'done', '8.88MB', ''],
  ['DCU狀態報表', 'error', '20KB', 'group_id'],
  ['DCU狀態報表', 'done', '20KB', ''],
  ['DCU狀態報表', 'done', '20KB', ''],
  ['電表問題報表', 'done', '20KB', ''],
  ['電表問題報表', 'error', '20KB', 'meter_id'],
  ['電表問題報表', 'done', '20KB', ''],
]
const INITIAL: Job[] = Array.from({ length: 36 }, (_, i) => {
  const [type, state, size, error] = SEED[i % SEED.length]
  const n = i + 1
  return {
    id: `68jnjknj${(890800 + n * 37).toString(16).padStart(6, '0')}d`.slice(0, 16),
    type, state, size, error,
    note: '--',
    createdAt: '2025-01-01 10:30:00',
    generatedAt: '2025-01-01 10:30:00',
    contract: `C${1000 + (n % 5)}`,
    area: `A${10 + (n % 4)}`,
    group: `G${1 + (n % 3)}`,
  }
})

interface Query { type: string; note: string; contract: string; area: string; group: string }
const EMPTY: Query = { type: REPORT_TYPES[0], note: '', contract: '', area: '', group: '' }
const ALL_TYPES = 'ALL'

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
/** 表頭釘住、表格自己捲（業主 2026-08-27 定調的表格標準） */
const SCROLL_BOX = 'max-h-[calc(100vh-330px)] overflow-auto'
const STICKY_TH = 'sticky top-0 z-10 bg-inset'

export function StatsReport() {
  const [jobs, setJobs] = useState(INITIAL)
  const [draft, setDraft] = useState<Query>(EMPTY)
  const [applied, setApplied] = useState<Query>(EMPTY)
  const [stateFilter, setStateFilter] = useState<string>(ALL_TYPES)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const set = <K extends keyof Query>(k: K, v: Query[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const apply = () => { setApplied(draft); setPage(1) }
  const clear = () => { setDraft(EMPTY); setApplied(EMPTY); setStateFilter(ALL_TYPES); setPage(1) }

  const rows = useMemo(() => {
    const has = (v: string, q: string) => !q.trim() || v.toLowerCase().includes(q.trim().toLowerCase())
    return jobs.filter(
      (j) =>
        (applied.type === ALL_TYPES || j.type === applied.type) &&
        (stateFilter === ALL_TYPES || j.state === stateFilter) &&
        has(j.note, applied.note) && has(j.contract, applied.contract) &&
        has(j.area, applied.area) && has(j.group, applied.group),
    )
  }, [jobs, applied, stateFilter])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      {/* 篩選 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <Field label="報表類型">
            <select value={draft.type} onChange={(e) => set('type', e.target.value)} className={`${BOX} w-[144px]`}>
              <option value={ALL_TYPES}>全部</option>
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="備註">
            <input value={draft.note} onChange={(e) => set('note', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="請輸入" className={`${BOX} w-[240px]`} />
          </Field>
        </div>
        <div className="flex items-end gap-2">
          <Field label="合約編號">
            <input value={draft.contract} onChange={(e) => set('contract', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="請輸入" className={`${BOX} w-[144px]`} />
          </Field>
          <Field label="地區代碼">
            <input value={draft.area} onChange={(e) => set('area', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="請輸入" className={`${BOX} w-[144px]`} />
          </Field>
          <Field label="群組 ID">
            <input value={draft.group} onChange={(e) => set('group', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="請輸入" className={`${BOX} w-[144px]`} />
          </Field>
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button onClick={apply} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            搜尋
          </button>
          <button
            title="報表產生完成時的下載提醒（Demo 暫無實際通知）"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-inset px-3 py-2 text-[13px] font-semibold text-ink-sub hover:text-brand"
          >
            <Info size={14} />下載提醒
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-card bg-surface border border-border shadow-card pb-3">
        <div className={SCROLL_BOX}>
          <table className="w-full min-w-[1280px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                <Th className={`${STICKY_TH} w-[44px]`} />
                <Th className={STICKY_TH}>ID</Th>
                <Th className={STICKY_TH}>報表類型</Th>
                <Th className={STICKY_TH}>備註</Th>
                <Th className={STICKY_TH}>建立日期</Th>
                <Th className={STICKY_TH}>產生日期</Th>
                <Th className={STICKY_TH}>大小</Th>
                <Th className={STICKY_TH}>
                  <span className="inline-flex items-center gap-2">
                    狀態
                    <select
                      value={stateFilter}
                      onChange={(e) => { setStateFilter(e.target.value); setPage(1) }}
                      className="rounded border border-border bg-surface px-1 py-0.5 text-[12px] font-normal text-ink-sub"
                    >
                      <option value={ALL_TYPES}>全部</option>
                      {(Object.keys(STATE_META) as JobState[]).map((s) => <option key={s} value={s}>{STATE_META[s].label}</option>)}
                    </select>
                  </span>
                </Th>
                <Th className={STICKY_TH}>錯誤內容</Th>
                <Th className={`${STICKY_TH} w-[76px]`} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((j, i) => {
                const m = STATE_META[j.state]
                return (
                  <tr key={j.id} className="border-b border-divider hover:bg-inset/40">
                    <td className="px-3 py-3 text-ink-mut tabular-nums">{start + i + 1}</td>
                    <td className="px-3 py-3 font-mono text-ink">{j.id}</td>
                    <td className="px-3 py-3 text-ink">{j.type}</td>
                    <td className="px-3 py-3 text-ink-sub">{j.note}</td>
                    <td className="px-3 py-3 tabular-nums text-ink whitespace-nowrap">{j.createdAt}</td>
                    <td className="px-3 py-3 tabular-nums text-ink whitespace-nowrap">{j.generatedAt}</td>
                    <td className="px-3 py-3 text-ink">{j.size}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: m.tok.bg }}>
                        <span className="size-1.5 rounded-full" style={{ background: m.tok.fg }} />{m.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-ink-sub">{j.error}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button title="下載" className="text-ink-mut hover:text-brand"><Download size={15} /></button>
                        {/* 處理中不給刪除（設計稿第 2 列只有下載圖示） */}
                        {j.state !== 'running' && (
                          <button
                            title="刪除"
                            onClick={() => setJobs((all) => all.filter((x) => x.id !== j.id))}
                            className="text-danger hover:opacity-70"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {pageRows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-ink-mut">查無符合條件的報表</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">{label}</span>
      {children}
    </label>
  )
}
