import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  Pencil,
  RotateCw,
  Trash2,
  User,
} from 'lucide-react'
import { SquareChartIcon } from '@/components/shared/SquareChartIcon'
import { Th, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'
import { SimpleModal, BTN_GHOST, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { GroupSelect, MultiSelect } from '@/components/shared/QueryFields'
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
const CASE_OPTIONS = CASES.map((c) => ({ value: c.id, label: caseFullName(c) }))
const DATA_TYPES = ['LP', 'ALT', 'MN', 'EVENT', 'DRR'] as const
type DataType = (typeof DATA_TYPES)[number]
/** 每顆電表每天幾筆（預估用） */
const PER_DAY: Record<DataType, number> = { LP: 96, ALT: 24, MN: 1, EVENT: 2, DRR: 1 / 30 }

type ScheduleFreq = 'daily' | 'weekly' | 'monthly'
type ScheduleRangePreset = 'yesterday' | 'last3days' | 'last7days' | 'lastWeek' | 'lastMonth'

const FREQ_LABELS: Record<ScheduleFreq, string> = {
  daily: '每日',
  weekly: '每週',
  monthly: '每月',
}
const RANGE_PRESET_LABELS: Record<ScheduleRangePreset, string> = {
  yesterday: '昨日資料（前 1 日全天）',
  last3days: '近 3 日資料',
  last7days: '近 7 日資料',
  lastWeek: '上週全週（週一至週日）',
  lastMonth: '上月全月（1 日至月底）',
}
const WEEK_DAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
const TIME_OPTIONS = ['04:00', '04:30', '05:00', '05:30', '06:00', '07:00', '08:00', '12:00', '18:00', '23:00']

interface Schedule {
  id: string
  name: string
  type: ReportType
  cases: string[]
  office: string
  group: string
  freq: ScheduleFreq
  time: string // '04:00'
  dayOfWeek: number // 1..7 (for weekly)
  dayOfMonth: number // 1..28 (for monthly)
  rangePreset: ScheduleRangePreset
  format: 'xlsx' | 'csv'
  encoding: 'UTF-8' | 'Big5'
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number
  note: string
}

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

  // 排程相關選項
  mode: 'instant' | 'schedule'
  scheduleFreq: ScheduleFreq
  scheduleTime: string
  scheduleDayOfWeek: number
  scheduleDayOfMonth: number
  scheduleRange: ScheduleRangePreset
  scheduleName: string
  scheduleEnabled: boolean
}
const emptyForm = (type: ReportType = '電表狀態報表', mode: 'instant' | 'schedule' = 'instant'): Form => ({
  type, cases: [], office: '', group: '', from: '2026-11-12', to: '2026-11-18',
  commMode: '', meterClass: '', billingDay: '', dataTypes: ['LP'], drStart: '2026-11-18', drDays: '1',
  format: 'xlsx', encoding: 'UTF-8', note: '',
  mode,
  scheduleFreq: 'daily',
  scheduleTime: '04:00',
  scheduleDayOfWeek: 1,
  scheduleDayOfMonth: 1,
  scheduleRange: 'yesterday',
  scheduleName: `每日自動產生 - ${type}`,
  scheduleEnabled: true,
})

/* ───────────────────────── 預估 ───────────────────────── */

const EXCEL_ROWS = 1_048_576
/** mock：各案別電表數 */
const CASE_METERS: Record<string, number> = { case1: 82_000, case2: 126_000, case3: 64_000, case4: 91_000, case5: 73_000 }
const days = (f: Form) => {
  if (f.mode === 'schedule') {
    switch (f.scheduleRange) {
      case 'yesterday': return 1
      case 'last3days': return 3
      case 'last7days': case 'lastWeek': return 7
      case 'lastMonth': return 30
    }
  }
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
  if (f.commMode) meters = Math.round(meters / 3)
  if (f.meterClass) meters = Math.round(meters / 3)
  if (f.billingDay) meters = Math.round(meters / 28)
  let rows: number
  let bytes: number
  switch (f.type) {
    case 'DCU狀態報表': rows = Math.ceil(meters / 280); bytes = 260; break
    case '電表狀態報表': rows = meters; bytes = 240; break
    case '讀表資料': rows = Math.round(meters * 96); bytes = 64; break
    case '電表讀表問題報表': rows = Math.round(meters * 0.04 * 7); bytes = 180; break
    case '註冊錯誤報表': rows = Math.round(meters * 0.002 * 7); bytes = 200; break
    case '台電DR執行清單': rows = Math.round(meters * 0.08 * 3); bytes = 150; break
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
  const parts: string[] = []
  parts.push(f.cases.length ? f.cases.map((id) => CASES.find((c) => c.id === id)?.name ?? id).join('、') : '全部案別')
  if (f.office) parts.push(f.office)
  if (f.group) parts.push(`群組 ${f.group.split(':')[1]}`)
  if (f.commMode) parts.push(f.commMode)
  if (f.meterClass) parts.push(f.meterClass)
  if (f.billingDay) parts.push(`計費日 ${f.billingDay}`)
  if (f.mode === 'schedule') {
    parts.push(RANGE_PRESET_LABELS[f.scheduleRange])
  }
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
  ['電表狀態報表', 'auto', '每日全案別電表狀態例行報表', 4.1, 'done', '', {}],
  ['電表狀態報表', 'auto', '四五案電表狀態晨間排程', 4.3, 'done', '', { cases: ['case2'] }],
  ['DCU狀態報表', 'auto', '四五案 DCU 狀態每日例行報表', 4.4, 'done', '', { cases: ['case2'] }],
  ['電表讀表問題報表', 'auto', '電表讀表問題近3日自動追蹤', 4.7, 'done', '', {}],
  ['台電未穩定收值報表', 'auto', '台電未穩定收值每週追蹤報表', 5.0, 'done', '', {}],
  ['讀表資料', 'manual', '北南區處 LP 抽查', 5.3, 'error', '查詢逾時：資料量過大，請縮短區間或分案別產生', { dataTypes: ['LP'], from: '2026-10-19', to: '2026-11-18' }],
  ['台電DR執行清單', 'manual', '', 6.2, 'done', '', { drDays: '3' }],
  ['電表狀態報表', 'auto', '一案電表狀態例行報表', 28.3, 'done', '', { cases: ['case1'] }],
  ['電表狀態報表', 'auto', '四案電表狀態例行報表', 28.5, 'done', '', { cases: ['case4'] }],
  ['註冊錯誤報表', 'manual', '1117', 50.1, 'done', '', {}],
  ['DCU狀態報表', 'auto', '四五案 DCU 狀態每日例行報表', 52.3, 'done', '', { cases: ['case2'] }],
  ['電表狀態報表', 'auto', '每日全案別電表狀態例行報表', 148.2, 'done', '', {}],
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

const SEED_SCHEDULES: Schedule[] = [
  {
    id: 'sch-01',
    name: '每日全案別電表狀態例行報表',
    type: '電表狀態報表',
    cases: [],
    office: '',
    group: '',
    freq: 'daily',
    time: '04:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    rangePreset: 'yesterday',
    format: 'xlsx',
    encoding: 'UTF-8',
    enabled: true,
    lastRunAt: NOW - 5.5 * 3_600_000,
    nextRunAt: NOW + 18.5 * 3_600_000,
    note: '自動產生報表',
  },
  {
    id: 'sch-02',
    name: '四五案 DCU 狀態每日例行報表',
    type: 'DCU狀態報表',
    cases: ['case2'],
    office: '',
    group: '',
    freq: 'daily',
    time: '04:30',
    dayOfWeek: 1,
    dayOfMonth: 1,
    rangePreset: 'yesterday',
    format: 'xlsx',
    encoding: 'UTF-8',
    enabled: true,
    lastRunAt: NOW - 5.2 * 3_600_000,
    nextRunAt: NOW + 19.0 * 3_600_000,
    note: '自動產生報表',
  },
  {
    id: 'sch-03',
    name: '電表讀表問題近3日自動追蹤',
    type: '電表讀表問題報表',
    cases: [],
    office: '',
    group: '',
    freq: 'daily',
    time: '04:45',
    dayOfWeek: 1,
    dayOfMonth: 1,
    rangePreset: 'last3days',
    format: 'xlsx',
    encoding: 'UTF-8',
    enabled: true,
    lastRunAt: NOW - 4.9 * 3_600_000,
    nextRunAt: NOW + 19.25 * 3_600_000,
    note: '自動產生報表',
  },
  {
    id: 'sch-04',
    name: '台電未穩定收值每週追蹤報表',
    type: '台電未穩定收值報表',
    cases: [],
    office: '',
    group: '',
    freq: 'weekly',
    time: '05:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    rangePreset: 'lastWeek',
    format: 'xlsx',
    encoding: 'UTF-8',
    enabled: true,
    lastRunAt: NOW - 48.0 * 3_600_000,
    nextRunAt: NOW + 120.0 * 3_600_000,
    note: '自動產生報表',
  },
  {
    id: 'sch-05',
    name: '全區處月度讀表資料定時匯總',
    type: '讀表資料',
    cases: [],
    office: '',
    group: '',
    freq: 'monthly',
    time: '05:30',
    dayOfWeek: 1,
    dayOfMonth: 1,
    rangePreset: 'lastMonth',
    format: 'xlsx',
    encoding: 'UTF-8',
    enabled: false,
    lastRunAt: NOW - 432.0 * 3_600_000,
    nextRunAt: NOW + 288.0 * 3_600_000,
    note: '月報定時產出',
  },
]

/* ───────────────────────── 頁面 ───────────────────────── */

const CTL = 'h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
const STICKY_TH = 'sticky top-0 z-10 bg-inset'
type StateTab = 'all' | 'active' | 'done' | 'error'
const isActive = (s: JobState) => s === 'queued' || s === 'running'

export function StatsReport() {
  const [form, setForm] = useState<Form>(() => emptyForm())
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS)
  const [schedules, setSchedules] = useState<Schedule[]>(SEED_SCHEDULES)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<StateTab>('all')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [q, setQ] = useState('')
  const [errorModalJob, setErrorModalJob] = useState<Job | null>(null)
  const [copied, setCopied] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setNotice('') }

  const est = useMemo(() => estimate(form), [form])
  const meta = TYPE_META[form.type]
  const over = form.format === 'xlsx' && est.files > 1
  const invalid = form.mode === 'schedule' && !form.scheduleName.trim()

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
    if (form.mode === 'schedule') {
      if (editingScheduleId) {
        const schName = form.scheduleName.trim() || `自動產生報表 - ${form.type}`
        setSchedules((all) =>
          all.map((s) =>
            s.id === editingScheduleId
              ? {
                  ...s,
                  name: schName,
                  type: form.type,
                  cases: form.cases,
                  office: form.office,
                  group: form.group,
                  freq: form.scheduleFreq,
                  time: form.scheduleTime,
                  dayOfWeek: form.scheduleDayOfWeek,
                  dayOfMonth: form.scheduleDayOfMonth,
                  rangePreset: form.scheduleRange,
                  format: form.format,
                  encoding: form.encoding,
                  enabled: form.scheduleEnabled,
                  note: form.note || schName,
                }
              : s,
          ),
        )
        setNotice(`已更新排程設定「${schName}」`)
        setEditingScheduleId(null)
      } else {
        const schName = form.scheduleName.trim() || `自動產生報表 - ${form.type}`
        const newSch: Schedule = {
          id: `sch-${Date.now().toString(36)}`,
          name: schName,
          type: form.type,
          cases: form.cases,
          office: form.office,
          group: form.group,
          freq: form.scheduleFreq,
          time: form.scheduleTime,
          dayOfWeek: form.scheduleDayOfWeek,
          dayOfMonth: form.scheduleDayOfMonth,
          rangePreset: form.scheduleRange,
          format: form.format,
          encoding: form.encoding,
          enabled: form.scheduleEnabled,
          lastRunAt: null,
          nextRunAt: NOW + 18.5 * 3_600_000,
          note: form.note || schName,
        }
        setSchedules((all) => [newSch, ...all])
        setNotice(`已建立自動排程「${newSch.name}」（${FREQ_LABELS[newSch.freq]} ${newSch.time} 執行）`)
      }
    } else {
      const job: Job = { id: newId(), form, source: 'manual', owner: 'admin', createdAt: NOW, finishedAt: null, progress: 0, state: 'queued', error: '', est }
      setJobs((all) => [job, ...all])
      setTab('all'); setTypeFilter(''); setSourceFilter(''); setQ('')
      setNotice(`已送出「${form.type}」，產生完成後可在下方清單下載`)
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const editSchedule = (s: Schedule) => {
    setForm({
      ...emptyForm(s.type, 'schedule'),
      cases: s.cases,
      office: s.office,
      group: s.group,
      format: s.format,
      encoding: s.encoding,
      note: s.note,
      mode: 'schedule',
      scheduleFreq: s.freq,
      scheduleTime: s.time,
      scheduleDayOfWeek: s.dayOfWeek,
      scheduleDayOfMonth: s.dayOfMonth,
      scheduleRange: s.rangePreset,
      scheduleName: s.name,
      scheduleEnabled: s.enabled,
    })
    setEditingScheduleId(s.id)
    setShowScheduleModal(false)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const toggleSchedule = (id: string) => {
    setSchedules((all) =>
      all.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    )
  }

  const deleteSchedule = (id: string) => {
    setSchedules((all) => all.filter((s) => s.id !== id))
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
    (!needle || j.id.includes(needle) || j.form.note.toLowerCase().includes(needle) || summarize(j.form).toLowerCase().includes(needle) || j.error.toLowerCase().includes(needle)),
  )
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [tab, typeFilter, sourceFilter, q, jobs.length], 15)

  return (
    <div ref={topRef} className="flex h-full min-h-[760px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="統計報表" icon={<SquareChartIcon size={20} className="text-brand" />} />

      {/* ── 產生報表 ── */}
      <section className="shrink-0 rounded-card border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle title="產生報表" />

          <div className="flex items-center gap-2">
            {editingScheduleId && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand">
                <span>編輯排程中</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingScheduleId(null)
                    set('scheduleName', `每日自動產生 - ${form.type}`)
                  }}
                  className="ml-1 text-[11px] underline hover:opacity-80"
                >
                  取消
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand transition-colors"
            >
              <Clock size={14} />
              <span>排程管理</span>
            </button>
          </div>
        </div>

        {/* 標題下方：手動產生 / 排程設定 圓角膠囊 Tab（參考 MDMS 查詢） */}
        <div className="mt-3">
          <PillTabs
            tabs={[
              { key: 'instant', label: '手動產生' },
              { key: 'schedule', label: '排程設定' },
            ]}
            value={form.mode}
            onChange={(m) => {
              set('mode', m)
              if (m === 'instant') setEditingScheduleId(null)
            }}
          />
        </div>

        {/* ── 篩選條件 ── */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="報表類型">
              <select
                value={form.type}
                onChange={(e) => {
                  const newType = e.target.value as ReportType
                  setForm((f) => ({
                    ...emptyForm(newType, f.mode),
                    cases: f.cases,
                    office: f.office,
                    group: f.group,
                    commMode: f.commMode,
                    meterClass: f.meterClass,
                    billingDay: f.billingDay,
                    format: f.format,
                    encoding: f.encoding,
                    note: f.note,
                    scheduleFreq: f.scheduleFreq,
                    scheduleTime: f.scheduleTime,
                    scheduleRange: f.scheduleRange,
                    scheduleName: `每日自動產生 - ${newType}`,
                  }))
                }}
                className={`${CTL} w-[190px] font-medium`}
              >
                {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Labeled>

            <Labeled label="案別" hint="可複選">
              <MultiSelect
                options={CASE_OPTIONS}
                value={form.cases}
                onChange={(cases) => set('cases', cases)}
                placeholder="全部案別"
                width={200}
              />
            </Labeled>

            <Labeled label="區處">
              <select value={form.office} onChange={(e) => set('office', e.target.value)} className={`${CTL} w-[130px]`}>
                <option value="">全部</option>
                {OFFICES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Labeled>

            <Labeled label="群組" hint="選填">
              <GroupSelect value={form.group} onChange={(v) => set('group', v)} className="w-[170px]" />
            </Labeled>

            <SelectField label="通訊方式" value={form.commMode} options={COMM_MODES} onChange={(v) => set('commMode', v)} width={110} />
            <SelectField label="電表類別" value={form.meterClass} options={METER_CLASSES} onChange={(v) => set('meterClass', v)} width={110} />
            <SelectField label="計費日" value={form.billingDay} options={Array.from({ length: 28 }, (_, i) => String(i + 1))} onChange={(v) => set('billingDay', v)} width={90} />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="檔案格式">
              <div className="flex h-9 w-[190px] items-center gap-4">
                {(['xlsx', 'csv'] as const).map((fm) => (
                  <label key={fm} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink whitespace-nowrap">
                    <input type="radio" name="fmt" checked={form.format === fm} onChange={() => set('format', fm)} className="size-4 cursor-pointer accent-danger" />
                    {fm === 'xlsx' ? 'Excel（.xlsx）' : 'CSV'}
                  </label>
                ))}
              </div>
            </Labeled>
            {form.format === 'csv' && (
              <Labeled label="編碼">
                <select value={form.encoding} onChange={(e) => set('encoding', e.target.value as Form['encoding'])} className={`${CTL} w-[90px]`} title="舊版 Excel 開中文 CSV 需 Big5">
                  <option>UTF-8</option>
                  <option>Big5</option>
                </select>
              </Labeled>
            )}
            <Labeled label="備註" hint="選填，方便在清單裡找">
              <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="例：月報對帳、第4季抽查" className={`${CTL} w-[260px]`} />
            </Labeled>

            {form.mode === 'instant' && (
              <button
                type="button"
                onClick={submit}
                disabled={invalid}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-ink px-4 text-[13px] font-semibold text-white shadow hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                產生報表
              </button>
            )}
          </div>

          {/* 排程專屬設定區塊（置於檔案格式下方） */}
          {form.mode === 'schedule' && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-brand/20 bg-brand-soft/20 p-3.5">
              <Labeled label="排程週期">
                <select
                  value={form.scheduleFreq}
                  onChange={(e) => set('scheduleFreq', e.target.value as ScheduleFreq)}
                  className={`${CTL} w-[110px] bg-surface font-medium`}
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每週</option>
                  <option value="monthly">每月</option>
                </select>
              </Labeled>

              {form.scheduleFreq === 'weekly' && (
                <Labeled label="執行星期">
                  <select
                    value={form.scheduleDayOfWeek}
                    onChange={(e) => set('scheduleDayOfWeek', Number(e.target.value))}
                    className={`${CTL} w-[110px] bg-surface`}
                  >
                    {WEEK_DAYS.map((w, idx) => (
                      <option key={w} value={idx + 1}>{w}</option>
                    ))}
                  </select>
                </Labeled>
              )}

              {form.scheduleFreq === 'monthly' && (
                <Labeled label="每月日期">
                  <select
                    value={form.scheduleDayOfMonth}
                    onChange={(e) => set('scheduleDayOfMonth', Number(e.target.value))}
                    className={`${CTL} w-[110px] bg-surface`}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>每月 {d} 日</option>
                    ))}
                  </select>
                </Labeled>
              )}

              <Labeled label="執行時間">
                <select
                  value={form.scheduleTime}
                  onChange={(e) => set('scheduleTime', e.target.value)}
                  className={`${CTL} w-[110px] bg-surface font-mono`}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Labeled>

              <Labeled label="資料相對區間">
                <select
                  value={form.scheduleRange}
                  onChange={(e) => set('scheduleRange', e.target.value as ScheduleRangePreset)}
                  className={`${CTL} w-[200px] bg-surface`}
                >
                  <option value="yesterday">昨日資料（前 1 日全天）</option>
                  <option value="last3days">近 3 日資料</option>
                  <option value="last7days">近 7 日資料</option>
                  <option value="lastWeek">上週全週（週一至週日）</option>
                  <option value="lastMonth">上月全月（1 日至月底）</option>
                </select>
              </Labeled>

              <Labeled label="排程名稱">
                <input
                  value={form.scheduleName}
                  onChange={(e) => set('scheduleName', e.target.value)}
                  placeholder="請輸入排程名稱"
                  className={`${CTL} w-[260px] bg-surface`}
                />
              </Labeled>

              <button
                type="button"
                onClick={submit}
                disabled={invalid}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-ink px-4 text-[13px] font-semibold text-white shadow hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {editingScheduleId ? '更新排程設定' : '儲存排程設定'}
              </button>
            </div>
          )}
        </div>

        {/* ── 下方：送出前預估區塊 ── */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-inset/50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px]">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <span className="size-2 rounded-full bg-brand" />
              <span>{form.mode === 'schedule' ? '排程單期預估' : '送出前預估'}</span>
            </div>
            <div className="flex items-center gap-4 text-ink-sub">
              <span>{form.type === 'DCU狀態報表' ? 'DCU 數' : '電表數'}：<b className="tabular-nums font-semibold text-ink">約 {fmtN(est.meters)}</b></span>
              <span className="text-border">|</span>
              <span>每期資料列數：<b className="tabular-nums font-semibold text-ink">約 {fmtN(est.rows)}</b></span>
              <span className="text-border">|</span>
              <span>每期檔案大小：<b className="tabular-nums font-semibold text-ink">約 {fmtSize(est.mb)}</b></span>
            </div>
            {form.mode === 'schedule' && (
              <span className="text-[12.5px] font-medium text-brand">
                （排程規則：{FREQ_LABELS[form.scheduleFreq]} {form.scheduleTime} 自動產出 · {RANGE_PRESET_LABELS[form.scheduleRange]}）
              </span>
            )}
            {over ? (
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: '#B45309' }}>
                <AlertTriangle size={15} className="shrink-0" />
                <span>
                  超過 Excel 上限，將自動分成 <b>{est.files}</b> 個檔案（ZIP），亦可<button type="button" onClick={() => set('format', 'csv')} className="ml-1 font-semibold underline">改用 CSV</button>
                </span>
              </div>
            ) : form.mode !== 'schedule' ? (
              <span className="text-[12px] text-ink-mut">
                {form.format === 'xlsx' ? '（在 Excel 上限 1,048,576 列以內，單一檔案。）' : '（CSV 格式不受列數限制）'}
              </span>
            ) : null}
          </div>

          {notice && <span className="text-[12.5px] font-semibold" style={{ color: statusTok.normal.fg }}>{notice}</span>}
        </div>
      </section>

      {/* ── 報表任務 ── */}
      <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <SectionTitle title="報表任務" />
          <span className="text-[12px] text-ink-mut">檔案保留 {RETAIN_DAYS} 天 · 自動排程每天 04:00～06:00 依案別產生</span>
          <span className="flex-1" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${CTL} w-[160px]`}>
            <option value="">全部報表類型</option>
            {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={`${CTL} w-[120px]`}>
            <option value="">全部來源</option>
            <option value="manual">手動</option>
            <option value="auto">自動排程</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋 ID／備註／條件／失敗原因" className={`${CTL} w-[220px]`} />
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
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1280px] table-fixed border-collapse text-[13px]">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '96px' }} />
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
                <Th className={STICKY_TH}>失敗原因</Th>
                <Th className={STICKY_TH}>大小</Th>
                <Th className={STICKY_TH}>保留至</Th>
                <Th className={STICKY_TH} />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((j) => (
                <JobRow
                  key={j.id}
                  j={j}
                  onRetry={() => retry(j)}
                  onDelete={() => setJobs((all) => all.filter((x) => x.id !== j.id))}
                  onShowError={(job) => setErrorModalJob(job)}
                />
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-ink-mut">沒有符合條件的報表</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </section>

      {errorModalJob && (
        <SimpleModal
          title="報表產生失敗原因"
          onClose={() => {
            setErrorModalJob(null)
            setCopied(false)
          }}
          width={520}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (errorModalJob.error) {
                    navigator.clipboard.writeText(errorModalJob.error)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }
                }}
                className={`${BTN_GHOST} flex items-center gap-1.5`}
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                <span>{copied ? '已複製' : '複製原因'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  retry(errorModalJob)
                  setErrorModalJob(null)
                }}
                className={`${BTN_PRIMARY} flex items-center gap-1.5`}
              >
                <RotateCw size={14} />
                <span>重新產生</span>
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-inset/50 p-3 text-[12px]">
              <div>
                <span className="text-ink-mut">任務 ID：</span>
                <span className="font-mono text-ink ml-1">{errorModalJob.id}</span>
              </div>
              <div>
                <span className="text-ink-mut">報表類型：</span>
                <span className="font-medium text-ink ml-1">{errorModalJob.form.type}</span>
              </div>
              <div>
                <span className="text-ink-mut">建立時間：</span>
                <span className="text-ink ml-1">{stamp(errorModalJob.createdAt)}</span>
              </div>
              <div>
                <span className="text-ink-mut">來源：</span>
                <span className="text-ink ml-1">{errorModalJob.source === 'auto' ? '自動排程' : `${errorModalJob.owner} 手動送出`}</span>
              </div>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-ink-sub block mb-1.5">完整失敗原因</label>
              <div className="rounded-xl border border-danger/25 bg-danger/5 p-3.5 font-mono text-[13px] leading-relaxed text-danger select-all whitespace-pre-wrap break-words">
                {errorModalJob.error || '未知錯誤'}
              </div>
            </div>

            {errorModalJob.form.note && (
              <div className="text-[12px] text-ink-mut">
                <span className="font-medium">備註：</span>{errorModalJob.form.note}
              </div>
            )}
          </div>
        </SimpleModal>
      )}

      {/* ── 排程管理彈窗 ── */}
      {showScheduleModal && (
        <SimpleModal
          title="排程管理"
          onClose={() => setShowScheduleModal(false)}
          width={880}
          actions={
            <button
              type="button"
              onClick={() => {
                setShowScheduleModal(false)
                setNotice('排程設定已更新')
              }}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              儲存
            </button>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-inset/60 text-ink-sub">
                    <th className="px-3.5 py-2.5 font-medium">排程名稱 / 報表類型</th>
                    <th className="px-3.5 py-2.5 font-medium">週期與時間</th>
                    <th className="px-3.5 py-2.5 font-medium">資料區間</th>
                    <th className="px-3.5 py-2.5 font-medium text-center">狀態</th>
                    <th className="px-3.5 py-2.5 font-medium">下次執行</th>
                    <th className="px-3.5 py-2.5 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedules.map((s) => {
                    const timeStr =
                      s.freq === 'daily'
                        ? `每日 ${s.time}`
                        : s.freq === 'weekly'
                        ? `每${WEEK_DAYS[s.dayOfWeek - 1]} ${s.time}`
                        : `每月 ${s.dayOfMonth} 日 ${s.time}`
                    return (
                      <tr key={s.id} className="hover:bg-inset/30 transition-colors">
                        <td className="px-3.5 py-3">
                          <div className="font-semibold text-ink">{s.name}</div>
                          <div className="flex items-center gap-2 text-[12px] text-ink-mut mt-0.5">
                            <span className="rounded bg-brand-soft px-1.5 py-0.2 text-[11px] font-medium text-brand">
                              {s.type}
                            </span>
                            <span>{s.cases.length ? s.cases.join('、') : '全部案別'}</span>
                            {s.office && <span>· {s.office}</span>}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 tabular-nums font-medium text-ink">
                          {timeStr}
                        </td>
                        <td className="px-3.5 py-3 text-[12.5px] text-ink-sub">
                          {RANGE_PRESET_LABELS[s.rangePreset] || s.rangePreset}
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSchedule(s.id)}
                            title={s.enabled ? '點擊停用排程' : '點擊啟用排程'}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              s.enabled ? 'bg-normal' : 'bg-border-strong'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                s.enabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-3.5 py-3 tabular-nums text-[12.5px] text-ink-sub">
                          {s.enabled ? stamp(s.nextRunAt) : <span className="text-ink-mut">已停用</span>}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => editSchedule(s)}
                              title="編輯此排程設定"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] font-medium text-ink-sub hover:bg-inset hover:text-ink"
                            >
                              <Pencil size={11} />
                              <span>編輯</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSchedule(s.id)}
                              title="刪除此排程"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-mut hover:text-danger hover:bg-danger/10"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {schedules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-mut">
                        目前尚無自動排程設定。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  )
}

function JobRow({
  j,
  onRetry,
  onDelete,
  onShowError,
}: {
  j: Job
  onRetry: () => void
  onDelete: () => void
  onShowError: (j: Job) => void
}) {
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
      <td className={`${td} truncate`}>
        {j.state === 'error' && j.error ? (
          <button
            type="button"
            onClick={() => onShowError(j)}
            className="group flex max-w-full items-center gap-1.5 text-left text-danger hover:underline focus:outline-none"
            title={`${j.error}（點擊查看完整原因）`}
          >
            <span className="truncate font-medium">{j.error}</span>
          </button>
        ) : (
          <span className="text-ink-mut">—</span>
        )}
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
function SelectField({ label, value, options, onChange, width, noAll }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void; width?: number; noAll?: boolean }) {
  return (
    <Labeled label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${CTL} ${width ? '' : 'w-full'}`} style={width ? { width } : undefined}>
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
