import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, Copy, Download, FileSpreadsheet, RotateCw, Trash2, User } from 'lucide-react'
import { Th, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'
import { GroupSelect } from '@/components/shared/QueryFields'
import { CASES, caseFullName } from '@/store/useCaseFilter'
import { status as statusTok } from '@/tokens'

/**
 * 統計分析 · 統計報表。
 *
 * 2026-11-19 業主意見：參考台達的統計報表（1119更新參考/統計報表內容參考.jpg）調整，但不照抄、要有新的使用考慮。
 * 台達的做法：選報表類型 → 在文字框手打 JSON 報表選項 → 送出 → 在任務清單等它產生、下載；Excel 列數上限只是一段靜態提示。
 * 這裡保留「送出產生 → 任務清單下載」的模式，改進：
 *   1. 報表選項改成表單欄位，依報表類型切換（不用手打 JSON；案別／區處／群組＝選的，不怕打錯代碼）
 *   2. 送出前就**預估**電表數、列數、檔案大小；超過 Excel 1,048,576 列時當場提醒，並說明會自動分檔（ZIP）或改用 CSV
 *   3. 任務清單：來源（自動排程／手動）分開標示、條件摘要寫在報表類型下方、產生中顯示進度、失敗顯示原因並可重試、
 *      「用此條件再產生」一鍵帶回上方表單、檔案保留 7 天（快到期提醒）
 *   4. 清單上方用狀態頁籤（全部／進行中／已完成／失敗，帶筆數）＋類型／來源／關鍵字篩選
 * 報表類型取台達清單（DCU狀態、電表狀態、讀表資料、電表讀表問題、台電DR執行清單、台電未穩定收值），加上原本的註冊錯誤報表。
 * 資料全為 mock：送出後的任務會模擬排隊→產生中→完成；預估規則見 estimate()。
 */

/* ───────────────────────── 報表類型與選項 ───────────────────────── */

const REPORT_TYPES = ['DCU狀態報表', '電表狀態報表', '讀表資料', '電表讀表問題報表', '註冊錯誤報表', '台電DR執行清單', '台電未穩定收值報表'] as const
type ReportType = (typeof REPORT_TYPES)[number]

/** 每種報表要哪些選項、一列代表什麼（說明給使用者看） */
const TYPE_META: Record<ReportType, { desc: string; scope: boolean; range: boolean; extra?: 'meterAttr' | 'dataTypes' | 'dr' }> = {
  DCU狀態報表: { desc: '每台 DCU 一列：連線狀態、電表數、白名單、模式、最後回報時間。', scope: true, range: false },
  電表狀態報表: { desc: '每顆電表一列：註冊狀態、連線狀態、最後 LP／MN 時間、所屬 DCU。', scope: true, range: false, extra: 'meterAttr' },
  讀表資料: { desc: '區間內的原始讀表資料，每筆讀值一列（LP 每 15 分一筆，資料量最大）。', scope: true, range: true, extra: 'dataTypes' },
  電表讀表問題報表: { desc: '區間內有缺讀、延遲或讀值異常的電表，每顆一列並附問題類型。', scope: true, range: true },
  註冊錯誤報表: { desc: '區間內註冊失敗或資料對不上的回報，每筆一列（同註冊衝突頁）。', scope: true, range: true },
  台電DR執行清單: { desc: '需量反應（DR）事件的執行對象與結果，每顆電表每次事件一列。', scope: false, range: false, extra: 'dr' },
  台電未穩定收值報表: { desc: '區間內收值不穩定（時有時無）的電表，每顆一列並附收值率。', scope: true, range: true },
}

const OFFICES = ['北市區處', '北縣區處', '北南區處', '北西區處', '桃園區處', '新桃區處', '中市區處', '台南區處', '高市區處'] as const
const COMM_MODES = ['RF', 'PLC', 'Cellular'] as const
const METER_CLASSES = ['高壓', '低壓', '表燈'] as const
const DATA_TYPES = ['LP', 'ALT', 'MN', 'EVENT', 'DRR'] as const
type DataType = (typeof DATA_TYPES)[number]
/** 每顆電表每天幾筆（預估用） */
const PER_DAY: Record<DataType, number> = { LP: 96, ALT: 24, MN: 1, EVENT: 2, DRR: 1 / 30 }

interface Form {
  type: ReportType
  cases: string[] // 案別 id；空＝全部
  office: string // '' ＝全部
  group: string // GroupSelect 的值；'' ＝不限
  from: string // YYYY-MM-DD（日期輸入框格式）
  to: string
  commMode: string
  meterClass: string
  billingDay: string // '' ＝不限，'1'～'28'
  dataTypes: DataType[]
  drStart: string
  drDays: string
  format: 'xlsx' | 'csv'
  encoding: 'UTF-8' | 'Big5'
  note: string
}
const emptyForm = (type: ReportType = '電表狀態報表'): Form => ({
  type, cases: [], office: '', group: '', from: '2026-11-12', to: '2026-11-18',
  commMode: '', meterClass: '', billingDay: '', dataTypes: ['LP'], drStart: '2026-11-18', drDays: '1',
  format: 'xlsx', encoding: 'UTF-8', note: '',
})

/* ───────────────────────── 預估 ───────────────────────── */

const EXCEL_ROWS = 1_048_576
/** mock：各案別電表數 */
const CASE_METERS: Record<string, number> = { case1: 82_000, case2: 126_000, case3: 64_000, case4: 91_000, case5: 73_000 }
const days = (f: Form) => {
  const a = Date.parse(f.from), b = Date.parse(f.to)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(1, Math.round(Math.abs(b - a) / 86_400_000) + 1) : 1
}

interface Estimate { meters: number; rows: number; mb: number; files: number }
function estimate(f: Form): Estimate {
  const meta = TYPE_META[f.type]
  let meters = (f.cases.length ? f.cases : CASES.map((c) => c.id)).reduce((s, id) => s + (CASE_METERS[id] ?? 0), 0)
  if (meta.scope) {
    if (f.office) meters = Math.round(meters / 9)
    if (f.group) meters = Math.min(meters, 20 + (f.group.length * 37) % 400)
  }
  if (f.type === '電表狀態報表') {
    if (f.commMode) meters = Math.round(meters / 3)
    if (f.meterClass) meters = Math.round(meters / 3)
    if (f.billingDay) meters = Math.round(meters / 28)
  }
  let rows: number
  let bytes: number
  switch (f.type) {
    case 'DCU狀態報表': rows = Math.ceil(meters / 280); bytes = 260; break
    case '電表狀態報表': rows = meters; bytes = 240; break
    case '讀表資料': rows = Math.round(meters * days(f) * f.dataTypes.reduce((s, t) => s + PER_DAY[t], 0)); bytes = 64; break
    case '電表讀表問題報表': rows = Math.round(meters * 0.04 * Math.min(days(f), 7)); bytes = 180; break
    case '註冊錯誤報表': rows = Math.round(meters * 0.002 * days(f)); bytes = 200; break
    case '台電DR執行清單': rows = Math.round(meters * 0.08 * Math.max(1, Number(f.drDays) || 1)); bytes = 150; break
    case '台電未穩定收值報表': rows = Math.round(meters * 0.015); bytes = 160; break
  }
  const files = f.format === 'xlsx' ? Math.max(1, Math.ceil(rows / (EXCEL_ROWS - 1))) : 1
  return { meters: f.type === 'DCU狀態報表' ? rows : meters, rows, mb: (rows * bytes) / 1_048_576, files }
}

const fmtN = (n: number) => n.toLocaleString('en-US')
const fmtSize = (mb: number) => (mb < 1 ? `${Math.max(1, Math.round(mb * 1024))}KB` : mb < 1024 ? `${mb.toFixed(mb < 10 ? 2 : 1)}MB` : `${(mb / 1024).toFixed(2)}GB`)
const slash = (d: string) => d.replace(/-/g, '/')

/** 條件摘要（任務清單報表類型下方那行） */
function summarize(f: Form): string {
  const meta = TYPE_META[f.type]
  const parts: string[] = []
  if (meta.scope || f.type === '台電DR執行清單') {
    parts.push(f.cases.length ? f.cases.map((id) => CASES.find((c) => c.id === id)?.name ?? id).join('、') : '全部案別')
  }
  if (meta.scope && f.office) parts.push(f.office)
  if (meta.scope && f.group) parts.push(`群組 ${f.group.split(':')[1]}`)
  if (meta.range) parts.push(`${slash(f.from)}～${slash(f.to)}`)
  if (f.type === '讀表資料') parts.push(f.dataTypes.join('/'))
  if (f.type === '電表狀態報表') {
    if (f.commMode) parts.push(f.commMode)
    if (f.meterClass) parts.push(f.meterClass)
    if (f.billingDay) parts.push(`計費日 ${f.billingDay}`)
  }
  if (f.type === '台電DR執行清單') parts.push(`${slash(f.drStart)} 起 ${f.drDays} 天`)
  parts.push(f.format === 'csv' ? `CSV ${f.encoding}` : 'Excel')
  return parts.join(' · ')
}

/* ───────────────────────── 任務 ───────────────────────── */

type JobState = 'queued' | 'running' | 'done' | 'error'
interface Job {
  id: string
  form: Form
  source: 'auto' | 'manual'
  owner: string
  createdAt: number // ms
  finishedAt: number | null
  progress: number // 0～100
  state: JobState
  error: string
  est: Estimate
}
const STATE_META: Record<JobState, { label: string; tok: { fg: string; bg: string } }> = {
  queued: { label: '排隊中', tok: statusTok.inactive },
  running: { label: '產生中', tok: statusTok.info },
  done: { label: '已完成', tok: statusTok.normal },
  error: { label: '失敗', tok: statusTok.danger },
}
const RETAIN_DAYS = 7
const NOW = Date.UTC(2026, 10, 19, 9, 30) // demo 的「現在」2026/11/19 09:30
const DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (ms: number) => { const d = new Date(ms); return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
const dur = (s: number) => (s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`)
let seq = 0x6afb9e19
const newId = () => (seq += 0x1f3).toString(16) + 'cde4109fd949ed'

/** 種子任務：仿台達清單——凌晨自動排程（各案別）＋白天手動 */
const SEED: Array<[ReportType, 'auto' | 'manual', string, number, JobState, string, Partial<Form>]> = [
  ['DCU狀態報表', 'manual', '114-FET 例行', 1.2, 'done', '', { cases: ['case5'] }],
  ['讀表資料', 'manual', '', 0.3, 'running', '', { dataTypes: ['LP', 'ALT'], cases: ['case2'] }],
  ['電表狀態報表', 'auto', '自動產生報表', 4.1, 'done', '', {}],
  ['電表狀態報表', 'auto', '自動產生報表', 4.3, 'done', '', { cases: ['case2'] }],
  ['DCU狀態報表', 'auto', '自動產生報表', 4.4, 'done', '', { cases: ['case2'] }],
  ['電表讀表問題報表', 'auto', '自動產生報表', 4.7, 'done', '', {}],
  ['台電未穩定收值報表', 'auto', '自動產生報表', 5.0, 'done', '', {}],
  ['讀表資料', 'manual', '北南區處 LP 抽查', 5.3, 'error', '查詢逾時：資料量過大，請縮短區間或分案別產生', { dataTypes: ['LP'], from: '2026-10-19', to: '2026-11-18' }],
  ['台電DR執行清單', 'manual', '', 6.2, 'done', '', { drDays: '3' }],
  ['電表狀態報表', 'auto', '自動產生報表', 28.3, 'done', '', { cases: ['case1'] }],
  ['電表狀態報表', 'auto', '自動產生報表', 28.5, 'done', '', { cases: ['case4'] }],
  ['註冊錯誤報表', 'manual', '1117', 50.1, 'done', '', {}],
  ['DCU狀態報表', 'auto', '自動產生報表', 52.3, 'done', '', { cases: ['case2'] }],
  ['電表狀態報表', 'auto', '自動產生報表', 148.2, 'done', '', {}],
  ['讀表資料', 'manual', '月報對帳', 160.0, 'done', '', { dataTypes: ['MN'], from: '2026-10-01', to: '2026-10-31' }],
]
const SEED_JOBS: Job[] = SEED.map(([type, source, note, hoursAgo, state, error, patch], i) => {
  const form = { ...emptyForm(type), note, ...patch }
  const createdAt = NOW - Math.round(hoursAgo * 3_600_000)
  const est = estimate(form)
  return {
    id: newId(),
    form,
    source,
    owner: source === 'auto' ? '排程' : i % 3 === 0 ? 'vincent' : 'admin',
    createdAt,
    finishedAt: state === 'done' || state === 'error' ? createdAt + (20 + Math.round(Math.min(est.mb, 400) * 2)) * 1000 : null,
    progress: state === 'running' ? 42 : state === 'done' ? 100 : 0,
    state,
    error,
    est,
  }
})

/* ───────────────────────── 頁面 ───────────────────────── */

const CTL = 'h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
const STICKY_TH = 'sticky top-0 z-10 bg-inset'
type StateTab = 'all' | 'active' | 'done' | 'error'
const isActive = (s: JobState) => s === 'queued' || s === 'running'

export function StatsReport() {
  const [form, setForm] = useState<Form>(() => emptyForm())
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<StateTab>('all')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [q, setQ] = useState('')
  const topRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setNotice('') }

  const est = useMemo(() => estimate(form), [form])
  const meta = TYPE_META[form.type]
  const over = form.format === 'xlsx' && est.files > 1
  const invalid = (form.type === '讀表資料' && form.dataTypes.length === 0) || (meta.range && form.from > form.to)

  // 模擬：排隊 → 產生中（同時最多 2 個）→ 完成
  useEffect(() => {
    const t = setInterval(() => {
      setJobs((all) => {
        if (!all.some((j) => isActive(j.state))) return all
        let running = all.filter((j) => j.state === 'running').length
        return all.map((j) => {
          if (j.state === 'queued' && running < 2) { running++; return { ...j, state: 'running', progress: 3 } }
          if (j.state !== 'running') return j
          const p = j.progress + 6 + Math.round(Math.random() * 14)
          return p >= 100 ? { ...j, state: 'done', progress: 100, finishedAt: j.createdAt + (20 + Math.round(Math.random() * 60)) * 1000 } : { ...j, progress: p }
        })
      })
    }, 900)
    return () => clearInterval(t)
  }, [])

  const submit = () => {
    if (invalid) return
    const job: Job = { id: newId(), form, source: 'manual', owner: 'admin', createdAt: NOW, finishedAt: null, progress: 0, state: 'queued', error: '', est }
    setJobs((all) => [job, ...all])
    setTab('all'); setTypeFilter(''); setSourceFilter(''); setQ('')
    setNotice(`已送出「${form.type}」，產生完成後可在下方清單下載`)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reuse = (j: Job) => {
    setForm({ ...j.form, note: j.form.note && j.source === 'manual' ? j.form.note : '' })
    setNotice(`已帶入 ${j.form.type} 的條件，可修改後再送出`)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const retry = (j: Job) => setJobs((all) => all.map((x) => (x.id === j.id ? { ...x, state: 'queued', progress: 0, error: '', createdAt: NOW, finishedAt: null } : x)))

  const counts = {
    all: jobs.length,
    active: jobs.filter((j) => isActive(j.state)).length,
    done: jobs.filter((j) => j.state === 'done').length,
    error: jobs.filter((j) => j.state === 'error').length,
  }
  const needle = q.trim().toLowerCase()
  const rows = jobs.filter((j) =>
    (tab === 'all' || (tab === 'active' ? isActive(j.state) : j.state === tab)) &&
    (!typeFilter || j.form.type === typeFilter) &&
    (!sourceFilter || j.source === sourceFilter) &&
    (!needle || j.id.includes(needle) || j.form.note.toLowerCase().includes(needle) || summarize(j.form).toLowerCase().includes(needle)),
  )
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [tab, typeFilter, sourceFilter, q, jobs.length], 15)

  return (
    <div ref={topRef} className="flex h-full min-h-[760px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="統計報表" />

      {/* ── 產生報表 ── */}
      <section className="shrink-0 rounded-card border border-border bg-surface p-5 shadow-card">
        <SectionTitle title="產生報表" />
        <div className="mt-4 flex gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Labeled label="報表類型">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...emptyForm(e.target.value as ReportType), cases: f.cases, office: f.office, format: f.format, encoding: f.encoding, note: f.note }))} className={`${CTL} w-[200px]`}>
                  {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Labeled>
              <p className="mb-2 min-w-0 flex-1 text-[12.5px] text-ink-mut">{meta.desc}</p>
            </div>

            {/* 範圍：案別（複選膠囊，空＝全部）／區處／群組 */}
            {(meta.scope || form.type === '台電DR執行清單') && (
              <Labeled label="案別" hint="不選＝全部案別">
                <div className="flex flex-wrap gap-1.5">
                  {CASES.map((c) => {
                    const on = form.cases.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set('cases', on ? form.cases.filter((x) => x !== c.id) : [...form.cases, c.id])}
                        className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${on ? 'border-brand bg-brand-soft text-brand' : 'border-border text-ink-sub hover:border-ink-mut'}`}
                      >
                        {caseFullName(c)}
                      </button>
                    )
                  })}
                </div>
              </Labeled>
            )}

            <div className="flex flex-wrap items-end gap-3">
              {meta.scope && (
                <>
                  <Labeled label="區處">
                    <select value={form.office} onChange={(e) => set('office', e.target.value)} className={`${CTL} w-[140px]`}>
                      <option value="">全部</option>
                      {OFFICES.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="群組" hint="選填">
                    <GroupSelect value={form.group} onChange={(v) => set('group', v)} className="w-[180px]" />
                  </Labeled>
                </>
              )}
              {meta.range && (
                <Labeled label="資料時間">
                  <div className={`${CTL} flex items-center gap-2`}>
                    <input type="date" value={form.from} max={form.to} onChange={(e) => set('from', e.target.value)} className="bg-transparent tabular-nums focus:outline-none" />
                    <span className="text-ink-mut">→</span>
                    <input type="date" value={form.to} min={form.from} onChange={(e) => set('to', e.target.value)} className="bg-transparent tabular-nums focus:outline-none" />
                    <span className="text-[12px] text-ink-mut">{days(form)} 天</span>
                  </div>
                </Labeled>
              )}
              {meta.extra === 'meterAttr' && (
                <>
                  <SelectField label="通訊方式" value={form.commMode} options={COMM_MODES} onChange={(v) => set('commMode', v)} />
                  <SelectField label="電表類別" value={form.meterClass} options={METER_CLASSES} onChange={(v) => set('meterClass', v)} />
                  <SelectField label="計費日" value={form.billingDay} options={Array.from({ length: 28 }, (_, i) => String(i + 1))} onChange={(v) => set('billingDay', v)} width={96} />
                </>
              )}
              {meta.extra === 'dr' && (
                <>
                  <Labeled label="開始日期">
                    <input type="date" value={form.drStart} onChange={(e) => set('drStart', e.target.value)} className={`${CTL} w-[150px] tabular-nums`} />
                  </Labeled>
                  <SelectField label="天數" value={form.drDays} options={['1', '2', '3', '5', '7']} onChange={(v) => set('drDays', v || '1')} width={88} noAll />
                </>
              )}
            </div>

            {meta.extra === 'dataTypes' && (
              <Labeled label="資料類型" hint="可複選；LP 每顆電表每天 96 筆，資料量最大">
                <div className="flex h-9 items-center gap-4">
                  {DATA_TYPES.map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                      <input type="checkbox" checked={form.dataTypes.includes(t)} onChange={() => set('dataTypes', form.dataTypes.includes(t) ? form.dataTypes.filter((x) => x !== t) : DATA_TYPES.filter((x) => x === t || form.dataTypes.includes(x)))} className="size-4 cursor-pointer accent-danger" />
                      {t}
                    </label>
                  ))}
                  {form.dataTypes.length === 0 && <span className="text-[12px] text-danger">請至少選一種</span>}
                </div>
              </Labeled>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t border-divider pt-3">
              <Labeled label="檔案格式">
                <div className="flex h-9 items-center gap-4">
                  {(['xlsx', 'csv'] as const).map((fm) => (
                    <label key={fm} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                      <input type="radio" name="fmt" checked={form.format === fm} onChange={() => set('format', fm)} className="size-4 cursor-pointer accent-danger" />
                      {fm === 'xlsx' ? 'Excel（.xlsx）' : 'CSV'}
                    </label>
                  ))}
                  {form.format === 'csv' && (
                    <select value={form.encoding} onChange={(e) => set('encoding', e.target.value as Form['encoding'])} className={`${CTL} w-[110px]`} title="舊版 Excel 開中文 CSV 需 Big5">
                      <option>UTF-8</option>
                      <option>Big5</option>
                    </select>
                  )}
                </div>
              </Labeled>
              <Labeled label="備註" hint="選填，方便在清單裡找">
                <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="例：月報對帳" className={`${CTL} w-[240px]`} />
              </Labeled>
            </div>
          </div>

          {/* 預估＋送出 */}
          <aside className="flex w-[320px] shrink-0 flex-col gap-3 rounded-xl bg-inset p-4">
            <div className="text-[13px] font-semibold text-ink">送出前預估</div>
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-ink-sub">{form.type === 'DCU狀態報表' ? 'DCU 數' : '電表數'}</dt><dd className="text-right font-semibold tabular-nums text-ink">約 {fmtN(est.meters)}</dd>
              <dt className="text-ink-sub">資料列數</dt><dd className="text-right font-semibold tabular-nums text-ink">約 {fmtN(est.rows)}</dd>
              <dt className="text-ink-sub">檔案大小</dt><dd className="text-right font-semibold tabular-nums text-ink">約 {fmtSize(est.mb)}</dd>
            </dl>
            {over ? (
              <div className="flex gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: statusTok.warning.bg, color: '#8A5A00' }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  超過 Excel 單一工作表上限 {fmtN(EXCEL_ROWS)} 列，將自動分成 <b>{est.files}</b> 個檔案並壓縮成 ZIP。
                  也可以<button type="button" onClick={() => set('format', 'csv')} className="mx-0.5 font-semibold underline">改用 CSV</button>（不受列數限制）或縮小範圍。
                </span>
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed text-ink-mut">
                {form.format === 'xlsx' ? `在 Excel 上限 ${fmtN(EXCEL_ROWS)} 列以內，單一檔案。` : 'CSV 不受列數限制，但用 Excel 開啟仍只顯示前 1,048,576 列。'}
              </p>
            )}
            <button
              onClick={submit}
              disabled={invalid}
              className="mt-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              <FileSpreadsheet size={16} />送出產生
            </button>
            {notice && <p className="text-[12px] font-semibold" style={{ color: statusTok.normal.fg }}>{notice}</p>}
          </aside>
        </div>
      </section>

      {/* ── 報表任務 ── */}
      <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <SectionTitle title="報表任務" />
          <span className="text-[12px] text-ink-mut">檔案保留 {RETAIN_DAYS} 天 · 自動排程每天 04:00～06:00 依案別產生</span>
          <span className="flex-1" />
          <PillTabs
            tabs={[
              { key: 'all', label: `全部 ${counts.all}` },
              { key: 'active', label: `進行中 ${counts.active}` },
              { key: 'done', label: `已完成 ${counts.done}` },
              { key: 'error', label: `失敗 ${counts.error}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${CTL} w-[160px]`}>
            <option value="">全部報表類型</option>
            {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={`${CTL} w-[120px]`}>
            <option value="">全部來源</option>
            <option value="manual">手動</option>
            <option value="auto">自動排程</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋 ID／備註／條件" className={`${CTL} w-[200px]`} />
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1240px] table-fixed border-collapse text-[13px]">
            {/* 2026-11-19 業主：列高維持原本設計（單行 py-3）—— 條件摘要獨立一欄、超長截斷，耗時／失敗原因放滑過提示 */}
            <colgroup>
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '128px' }} />
            </colgroup>
            <thead>
              <tr className="text-ink-sub">
                <Th className={STICKY_TH}>ID</Th>
                <Th className={STICKY_TH}>報表類型</Th>
                <Th className={STICKY_TH}>備註</Th>
                <Th className={STICKY_TH}>條件摘要</Th>
                <Th className={STICKY_TH}>來源</Th>
                <Th className={STICKY_TH}>建立時間</Th>
                <Th className={STICKY_TH}>狀態</Th>
                <Th className={STICKY_TH}>大小</Th>
                <Th className={STICKY_TH}>保留至</Th>
                <Th className={STICKY_TH} />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((j) => <JobRow key={j.id} j={j} onReuse={() => reuse(j)} onRetry={() => retry(j)} onDelete={() => setJobs((all) => all.filter((x) => x.id !== j.id))} />)}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-ink-mut">沒有符合條件的報表</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </section>
    </div>
  )
}

function JobRow({ j, onReuse, onRetry, onDelete }: { j: Job; onReuse: () => void; onRetry: () => void; onDelete: () => void }) {
  const m = STATE_META[j.state]
  const expires = j.createdAt + RETAIN_DAYS * DAY
  const leftDays = Math.ceil((expires - NOW) / DAY)
  const secs = j.finishedAt ? Math.max(1, Math.round((j.finishedAt - j.createdAt) / 1000)) : 0
  const zip = j.est.files > 1 && j.form.format === 'xlsx'
  const summary = summarize(j.form)
  const td = 'px-3 py-3 whitespace-nowrap'
  return (
    <tr className="border-b border-divider hover:bg-inset/40">
      <td className={`${td} truncate font-mono text-ink`} title={j.id}>{j.id}</td>
      <td className={`${td} truncate text-ink`} title={j.form.type}>{j.form.type}</td>
      <td className={`${td} truncate text-ink-sub`} title={j.form.note}>{j.form.note || '--'}</td>
      <td className={`${td} truncate text-ink-sub`} title={summary}>{summary}</td>
      <td className={`${td} text-ink-sub`}>
        <span className="inline-flex items-center gap-1" title={j.source === 'auto' ? '自動排程產生' : `${j.owner} 手動送出`}>
          {j.source === 'auto' ? <Bot size={14} /> : <User size={14} />}
          {j.source === 'auto' ? '自動' : j.owner}
        </span>
      </td>
      <td className={`${td} tabular-nums text-ink`}>{stamp(j.createdAt)}</td>
      <td className={td}>
        <span className="inline-flex items-center gap-2" title={j.state === 'done' ? `耗時 ${dur(secs)}` : j.state === 'error' ? j.error : undefined}>
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: m.tok.bg }}>
            <span className="size-1.5 rounded-full" style={{ background: m.tok.fg }} />{m.label}
          </span>
          {j.state === 'running' && <span className="text-[12px] tabular-nums text-ink-mut">{j.progress}%</span>}
        </span>
      </td>
      <td className={`${td} tabular-nums text-ink`} title={zip ? `${j.est.files} 個檔案（ZIP）` : undefined}>
        {j.state === 'done' ? fmtSize(j.est.mb) : <span className="text-ink-mut">約 {fmtSize(j.est.mb)}</span>}
        {zip && <span className="ml-1 text-[12px] text-ink-mut">ZIP</span>}
      </td>
      <td className={`${td} tabular-nums`}>
        {j.state === 'done'
          ? <span style={leftDays <= 1 ? { color: '#B45309', fontWeight: 600 } : undefined} title={leftDays <= 1 ? (leftDays <= 0 ? '今天到期' : '明天到期') : undefined}>{stamp(expires).slice(0, 5)}</span>
          : <span className="text-ink-mut">—</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {j.state === 'done' && <IconBtn title={zip ? `下載 ZIP（${j.est.files} 檔）` : '下載'} onClick={() => {}}><Download size={15} /></IconBtn>}
          {j.state === 'error' && <IconBtn title={`重試（${j.error}）`} onClick={onRetry}><RotateCw size={15} /></IconBtn>}
          <IconBtn title="用此條件再產生（帶回上方表單）" onClick={onReuse}><Copy size={15} /></IconBtn>
          {!isActive(j.state) && <IconBtn title="刪除" onClick={onDelete} danger><Trash2 size={15} /></IconBtn>}
        </div>
      </td>
    </tr>
  )
}

/* ───────────────────────── 小零件 ───────────────────────── */

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px] rounded-full bg-danger" />
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
    </div>
  )
}
function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}{hint && <span className="ml-2 text-ink-mut">{hint}</span>}</span>
      {children}
    </div>
  )
}
function SelectField({ label, value, options, onChange, width = 120, noAll }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void; width?: number; noAll?: boolean }) {
  return (
    <Labeled label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={CTL} style={{ width }}>
        {!noAll && <option value="">不限</option>}
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Labeled>
  )
}
function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className={`grid size-8 place-items-center rounded-lg text-ink-mut hover:bg-inset ${danger ? 'hover:text-danger' : 'hover:text-brand'}`}>
      {children}
    </button>
  )
}
