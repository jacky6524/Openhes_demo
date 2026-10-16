import { useMemo, useState } from 'react'
import { Download, Trash2, Info, ArrowRight } from 'lucide-react'
import { Th, Pagination } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'

/**
 * 統計分析 · 報表任務清單 (Figma 4255:33532 的主畫面 B＝4255:37918)。
 *
 * 篩選：第一列固定「報表類型／備註」，第二列依報表類型切換欄位（2026-10-16 業主參考圖「篩選條件.png」）：
 *   DCU狀態報表   合約編號／地區代碼／群組 ID
 *   電表狀態報表   地區代碼／事業部代碼／合約編號／通訊模式／電表等級／群組 ID
 *   註冊錯誤報表   資料時間（區間）／地區代碼／合約編號
 *   台電DR執行清單 開始日期／天數
 *   讀表資料       資料時間（區間）／群組 ID／電表 ID／資料類型（LP／ALT／EVENT／DRR 複選）
 * 「下載提醒」在第二列最右側。
 * 表格：# ／ID／報表類型／備註／建立日期／產生日期／大小／狀態／錯誤內容／操作（下載、刪除）。
 * 資料全為 mock，刪除只動畫面上的列。
 */
const REPORT_TYPES = ['DCU狀態報表', '電表狀態報表', '註冊錯誤報表', '台電DR執行清單', '讀表資料'] as const
type ReportType = (typeof REPORT_TYPES)[number]
type JobState = 'done' | 'running' | 'error'

const DATA_TYPES = ['LP', 'ALT', 'EVENT', 'DRR'] as const

/** 各報表類型的篩選欄位；text 欄位以 key 對到 Job.params 做部分比對 */
type FieldDef =
  | { kind: 'text'; key: string; label: string }
  | { kind: 'dateRange'; label: string } // 比對 Job.dataDate，值存在 Query.values.from／to
  | { kind: 'date'; label: string } // 比對 Job.dataDate，值存在 Query.values.date
  | { kind: 'dataTypes'; label: string }

const text = (key: string, label: string): FieldDef => ({ kind: 'text', key, label })
const FIELDS: Record<ReportType, FieldDef[]> = {
  DCU狀態報表: [text('contract', '合約編號'), text('area', '地區代碼'), text('group', '群組 ID')],
  電表狀態報表: [
    text('area', '地區代碼'), text('dept', '事業部代碼'), text('contract', '合約編號'),
    text('commMode', '通訊模式'), text('meterGrade', '電表等級'), text('group', '群組 ID'),
  ],
  註冊錯誤報表: [{ kind: 'dateRange', label: '資料時間' }, text('area', '地區代碼'), text('contract', '合約編號')],
  台電DR執行清單: [{ kind: 'date', label: '開始日期' }, text('days', '天數')],
  讀表資料: [
    { kind: 'dateRange', label: '資料時間' }, text('group', '群組 ID'), text('meterId', '電表 ID'),
    { kind: 'dataTypes', label: '資料類型' },
  ],
}

interface Job {
  id: string
  type: ReportType
  note: string
  createdAt: string
  generatedAt: string
  size: string
  state: JobState
  error: string
  /** 報表產生時的條件（mock），供篩選比對 */
  params: Record<string, string>
  dataDate: string
  dataTypes: string[]
}

const STATE_META: Record<JobState, { label: string; tok: { fg: string; bg: string } }> = {
  done: { label: '已完成', tok: statusTok.normal },
  running: { label: '處理中', tok: statusTok.info },
  error: { label: '錯誤', tok: statusTok.danger },
}

/** 10 列一輪的狀態分佈，循環補到 40 列讓分頁看得到 */
const SEED: Array<[ReportType, JobState, string, string]> = [
  ['讀表資料', 'done', '20KB', ''],
  ['讀表資料', 'running', '20KB', ''],
  ['DCU狀態報表', 'done', '8.88MB', ''],
  ['DCU狀態報表', 'error', '20KB', 'group_id'],
  ['電表狀態報表', 'done', '20KB', ''],
  ['電表狀態報表', 'error', '20KB', 'meter_id'],
  ['註冊錯誤報表', 'done', '1.2MB', ''],
  ['註冊錯誤報表', 'done', '20KB', ''],
  ['台電DR執行清單', 'done', '64KB', ''],
  ['台電DR執行清單', 'error', '20KB', 'start_date'],
]
const COMM_MODES = ['RF', 'PLC', 'Cellular']
const METER_GRADES = ['A', 'B', 'C']
const INITIAL: Job[] = Array.from({ length: 40 }, (_, i) => {
  const [type, state, size, error] = SEED[i % SEED.length]
  const n = i + 1
  return {
    id: `68jnjknj${(890800 + n * 37).toString(16).padStart(6, '0')}d`.slice(0, 16),
    type, state, size, error,
    note: '--',
    createdAt: '2025-01-01 10:30:00',
    generatedAt: '2025-01-01 10:30:00',
    params: {
      contract: `C${1000 + (n % 5)}`,
      area: `A${10 + (n % 4)}`,
      group: `G${1 + (n % 3)}`,
      dept: `D0${1 + (n % 6)}`,
      commMode: COMM_MODES[n % COMM_MODES.length],
      meterGrade: METER_GRADES[n % METER_GRADES.length],
      meterId: `FT1844${(600 + n * 7).toString().padStart(4, '0')}`,
      days: String(1 + (n % 7)),
    },
    dataDate: `2025-01-${String(1 + (n % 20)).padStart(2, '0')}`,
    dataTypes: DATA_TYPES.filter((_, k) => k === n % 4 || (n + k) % 3 === 0),
  }
})

interface Query { type: ReportType; note: string; values: Record<string, string>; dataTypes: string[] }
const emptyQuery = (type: ReportType = REPORT_TYPES[0]): Query => ({ type, note: '', values: {}, dataTypes: [] })
const ALL_STATES = 'ALL'

function matches(j: Job, q: Query) {
  if (j.type !== q.type) return false
  const has = (v: string, s = '') => !s.trim() || v.toLowerCase().includes(s.trim().toLowerCase())
  if (!has(j.note, q.note)) return false
  const v = q.values
  return FIELDS[q.type].every((f) => {
    switch (f.kind) {
      case 'text': return has(j.params[f.key] ?? '', v[f.key])
      case 'dateRange': return (!v.from || j.dataDate >= v.from) && (!v.to || j.dataDate <= v.to)
      case 'date': return !v.date || j.dataDate === v.date
      case 'dataTypes': return q.dataTypes.length === 0 || j.dataTypes.some((d) => q.dataTypes.includes(d))
    }
  })
}

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
/** 表頭釘住、表格自己捲（業主 2026-08-27 定調的表格標準） */
const SCROLL_BOX = 'max-h-[calc(100vh-330px)] overflow-auto'
const STICKY_TH = 'sticky top-0 z-10 bg-inset'

export function StatsReport() {
  const [jobs, setJobs] = useState(INITIAL)
  const [draft, setDraft] = useState<Query>(emptyQuery)
  const [applied, setApplied] = useState<Query>(emptyQuery)
  const [stateFilter, setStateFilter] = useState<string>(ALL_STATES)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const setVal = (k: string, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [k]: v } }))
  const toggleDataType = (dt: string) =>
    setDraft((d) => ({ ...d, dataTypes: d.dataTypes.includes(dt) ? d.dataTypes.filter((x) => x !== dt) : [...d.dataTypes, dt] }))
  // 換報表類型＝換一組欄位：類型專屬條件清空，備註保留
  const switchType = (type: ReportType) => setDraft((d) => ({ ...emptyQuery(type), note: d.note }))

  const apply = () => { setApplied(draft); setPage(1) }
  // 清除條件保留目前選的報表類型
  const clear = () => { const q = emptyQuery(draft.type); setDraft(q); setApplied(q); setStateFilter(ALL_STATES); setPage(1) }
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') apply() }

  const rows = useMemo(
    () => jobs.filter((j) => matches(j, applied) && (stateFilter === ALL_STATES || j.state === stateFilter)),
    [jobs, applied, stateFilter],
  )

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
            <select value={draft.type} onChange={(e) => switchType(e.target.value as ReportType)} className={`${BOX} w-[144px]`}>
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="備註">
            <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} onKeyDown={onEnter} placeholder="請輸入" className={`${BOX} w-[240px]`} />
          </Field>
        </div>
        <div className="flex items-end gap-2">
          {FIELDS[draft.type].map((f) => {
            switch (f.kind) {
              case 'text':
                return (
                  <Field key={f.key} label={f.label}>
                    <input value={draft.values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} onKeyDown={onEnter} placeholder="請輸入" className={`${BOX} w-[144px]`} />
                  </Field>
                )
              case 'dateRange':
                return (
                  <Field key="range" label={f.label}>
                    <div className={`${BOX} flex items-center gap-2 py-[5px]`}>
                      <input type="date" value={draft.values.from ?? ''} max={draft.values.to || undefined} onChange={(e) => setVal('from', e.target.value)} className="bg-transparent text-[13px] tabular-nums text-ink focus:outline-none" />
                      <ArrowRight size={14} className="text-ink-mut" />
                      <input type="date" value={draft.values.to ?? ''} min={draft.values.from || undefined} onChange={(e) => setVal('to', e.target.value)} className="bg-transparent text-[13px] tabular-nums text-ink focus:outline-none" />
                    </div>
                  </Field>
                )
              case 'date':
                return (
                  <Field key="date" label={f.label}>
                    <input type="date" value={draft.values.date ?? ''} onChange={(e) => setVal('date', e.target.value)} className={`${BOX} w-[144px] py-[5px] tabular-nums`} />
                  </Field>
                )
              case 'dataTypes':
                return (
                  <div key="dataTypes" className="flex flex-col gap-1">
                    <span className="px-2 text-[12px] text-ink-sub">{f.label}</span>
                    <div className="flex h-[38px] items-center gap-4 px-2">
                      {DATA_TYPES.map((dt) => (
                        <label key={dt} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                          <input type="checkbox" checked={draft.dataTypes.includes(dt)} onChange={() => toggleDataType(dt)} className="size-4 cursor-pointer accent-danger" />
                          {dt}資料
                        </label>
                      ))}
                    </div>
                  </div>
                )
            }
          })}
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
                      <option value={ALL_STATES}>全部</option>
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
