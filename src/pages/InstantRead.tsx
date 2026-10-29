import { useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, RotateCw, X } from 'lucide-react'
import { Th, SortHead, StampLines, InfiniteFooter, useInfiniteRows, RED, type SortDir } from '@/components/table/tableBits'
import { SimpleModal, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { PageTitle } from '@/components/shared/PageTitle'
import { TargetSearch, FIELD_BOX, type TargetMode } from '@/components/shared/TargetSearch'
import { READ_TASKS, taskMeters, meterReadings, type ReadTask, type TaskMeter } from '@/data/readTasks'

/**
 * 讀表管理 · 即時讀表（設計稿「即時讀表-1」列表、「即時讀表-2」ondemand 讀取結果彈窗）。
 *
 * 上方查詢條件每按一次「搜尋」就開一個頁籤「報表列表 (N)」（N＝該條件的結果筆數，可關閉），
 * 頁籤內再有一組「排程時間」區間只篩這個頁籤。列表無限捲動（業主不要頁碼）。
 * 點一列開彈窗：基本資料＋每顆電表有沒有回報；點已回報的電表，右側看讀值。
 * 資料全為 mock（data/readTasks.ts）。
 */
const DATA_TYPES = ['ALL', '午夜資料', '負載資料'] as const

interface Query {
  mode: TargetMode
  text: string
  note: string
  dataType: (typeof DATA_TYPES)[number]
  from: string // datetime-local：YYYY-MM-DDTHH:mm
  to: string
  lastN: string
  overdue: string
}
const EMPTY: Query = { mode: 'meterNo', text: '', note: '', dataType: 'ALL', from: '', to: '', lastN: '', overdue: '' }

const stamp = (v: string) => v.replace('T', ' ')

function matches(t: ReadTask, q: Query) {
  if (q.note.trim() && !t.note.toLowerCase().includes(q.note.trim().toLowerCase())) return false
  if (q.dataType !== 'ALL' && t.dataType !== q.dataType) return false
  if (q.from && t.dataStart.slice(0, 16) < stamp(q.from)) return false
  if (q.to && t.dataEnd.slice(0, 16) > stamp(q.to)) return false
  if (q.overdue && t.overdue < Number(q.overdue)) return false
  const text = q.text.trim().toLowerCase()
  if (text) {
    const mode = q.mode
    if (mode === 'group') return t.group.toLowerCase().includes(text)
    return taskMeters(t).some((m) => m[mode].toLowerCase().includes(text))
  }
  return true
}

/** 套用整組查詢；「最後資料(筆)」＝最近的 N 筆（依讀取開始時間新→舊） */
function runQuery(q: Query): ReadTask[] {
  const hit = READ_TASKS.filter((t) => matches(t, q))
  const n = parseInt(q.lastN, 10)
  if (!(n > 0)) return hit
  return [...hit].sort((a, b) => b.readStart.localeCompare(a.readStart)).slice(0, n)
}

interface Tab { id: number; query: Query; count: number }

export function InstantRead() {
  const [draft, setDraft] = useState<Query>(EMPTY)
  const nextId = useRef(2)
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, query: EMPTY, count: READ_TASKS.length }])
  const [activeId, setActiveId] = useState(1)
  const set = <K extends keyof Query>(k: K, v: Query[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const search = () => {
    const id = nextId.current++
    setTabs((ts) => [...ts, { id, query: draft, count: runQuery(draft).length }])
    setActiveId(id)
  }
  const clear = () => setDraft(EMPTY)
  const closeTab = (id: number) => {
    const i = tabs.findIndex((t) => t.id === id)
    const rest = tabs.filter((t) => t.id !== id)
    setTabs(rest)
    if (id === activeId) setActiveId(rest[Math.max(0, i - 1)].id)
  }
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="即時讀表" />

      <div className="flex flex-col gap-2">
        <TargetSearch label="搜尋模式" mode={draft.mode} text={draft.text} onMode={(m) => set('mode', m)} onText={(v) => set('text', v)} onEnter={search} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="讀表備註">
            <input value={draft.note} onChange={(e) => set('note', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Input" className={`${FIELD_BOX} w-[240px]`} />
          </Field>
          <Field label="選擇資料類型">
            <select value={draft.dataType} onChange={(e) => set('dataType', e.target.value as Query['dataType'])} className={`${FIELD_BOX} w-[144px]`}>
              {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="資料時間">
            <RangeInput from={draft.from} to={draft.to} onFrom={(v) => set('from', v)} onTo={(v) => set('to', v)} />
          </Field>
          <Field label="最後資料 (筆)">
            <input value={draft.lastN} onChange={(e) => set('lastN', e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="全部" className={`${FIELD_BOX} w-[120px]`} />
          </Field>
          <Field label="設定逾期時間 (10分鐘起)">
            <input value={draft.overdue} onChange={(e) => set('overdue', e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="10" className={`${FIELD_BOX} w-[176px]`} />
          </Field>
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button onClick={search} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            搜尋
          </button>
        </div>
      </div>

      <div className="rounded-card bg-surface border border-border shadow-card">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-[15px] font-semibold text-ink">即時讀表紀錄</h2>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-1 border-b border-border px-4">
          {tabs.map((t) => {
            const on = t.id === active.id
            return (
              <div key={t.id} className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] ${on ? 'font-semibold text-brand' : 'text-ink-mut'}`}>
                <button onClick={() => setActiveId(t.id)} className="whitespace-nowrap">報表列表 ({t.count})</button>
                {tabs.length > 1 && (
                  <button onClick={() => closeTab(t.id)} title="關閉頁籤" className="grid size-4 place-items-center rounded hover:bg-inset hover:text-ink">
                    <X size={13} />
                  </button>
                )}
                {on && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-brand" />}
              </div>
            )
          })}
        </div>
        {/* key：換頁籤就重置該頁籤自己的排程時間與排序 */}
        <TaskPanel key={active.id} query={active.query} />
      </div>
    </div>
  )
}

/* ───────────────────────── 頁籤內容：排程時間＋表格 ───────────────────────── */

type SortKey = 'no' | 'instanceId' | 'dataType' | 'readStart' | 'readEnd' | 'dataStart' | 'dataEnd' | 'overdue' | 'doneAt' | 'replied'

function TaskPanel({ query }: { query: Query }) {
  const base = useMemo(() => runQuery(query), [query])
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [sched, setSched] = useState({ from: '', to: '' })
  const [sortKey, setSortKey] = useState<SortKey>('no')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [open, setOpen] = useState<ReadTask | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const hit = base.filter(
      (t) => (!sched.from || t.readStart.slice(0, 16) >= stamp(sched.from)) && (!sched.to || t.readStart.slice(0, 16) <= stamp(sched.to)),
    )
    const val = (t: ReadTask) => (sortKey === 'replied' ? t.replied / t.total : t[sortKey])
    return [...hit].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sortDir === 'asc' ? c : -c
    })
  }, [base, sched, sortKey, sortDir])

  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [query, sched, sortKey, sortDir], 30)
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: SortKey, label: string) => (
    <Th className="sticky top-0 z-10 bg-inset"><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )

  return (
    <div className="px-4 pb-4">
      <div className="flex items-end gap-2 py-3">
        <Field label="排程時間">
          <RangeInput from={draft.from} to={draft.to} onFrom={(v) => setDraft((d) => ({ ...d, from: v }))} onTo={(v) => setDraft((d) => ({ ...d, to: v }))} />
        </Field>
        <button onClick={() => setSched(draft)} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink hover:border-brand hover:text-brand">
          搜尋
        </button>
        <button
          onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="重新整理"
          className="ml-auto grid size-8 place-items-center rounded-lg text-ink-mut hover:bg-inset hover:text-ink"
        >
          <RotateCw size={16} />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div ref={scrollRef} className="max-h-[calc(100vh-470px)] min-h-[240px] overflow-auto">
          <table className="w-full min-w-[1180px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                {head('no', 'NO')}
                {head('instanceId', 'Instance ID / Task ID')}
                <Th className="sticky top-0 z-10 bg-inset">備註</Th>
                {head('dataType', '資料類型')}
                {head('readStart', '讀取開始時間')}
                {head('readEnd', '讀取結束時間')}
                {head('dataStart', '資料開始時間')}
                {head('dataEnd', '資料結束時間')}
                {head('overdue', '設定逾期時間 (分)')}
                {head('doneAt', '讀取完成時間')}
                {head('replied', '已回報電表數/總數')}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((t) => (
                <tr key={t.no} onClick={() => setOpen(t)} className="cursor-pointer border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5 tabular-nums text-ink">{t.no}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-ink"><span className="block w-[150px] break-all leading-tight">{t.instanceId}</span></td>
                  <td className="px-3 py-2.5 text-ink whitespace-nowrap">{t.note}</td>
                  <td className="px-3 py-2.5 text-ink whitespace-nowrap">{t.dataType}</td>
                  {[t.readStart, t.readEnd, t.dataStart, t.dataEnd].map((v, i) => (
                    <td key={i} className="px-3 py-2.5 tabular-nums text-ink"><StampLines value={v.slice(0, 16)} /></td>
                  ))}
                  <td className="px-3 py-2.5 tabular-nums text-ink">{t.overdue}</td>
                  <td className="px-3 py-2.5 tabular-nums text-ink"><StampLines value={t.doneAt.slice(0, 16)} /></td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums" style={t.replied < t.total ? { color: RED } : undefined}>
                    {t.replied} / {t.total}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-ink-mut">查無符合條件的讀表紀錄</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>

      {open && <ResultModal task={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/* ───────────────────────── ondemand 讀取結果彈窗 ───────────────────────── */

function ResultModal({ task, onClose }: { task: ReadTask; onClose: () => void }) {
  const meters = useMemo(() => taskMeters(task), [task])
  const [picked, setPicked] = useState<TaskMeter | null>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(meters.length, [task.no], 10)
  const scrollRef = useRef<HTMLDivElement>(null)

  const download = () => {
    const csv = ['電號,表號,回報', ...meters.map((m) => `${m.elecNo},${m.meterNo},${m.replied ? 'Y' : 'N'}`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `ondemand-${task.instanceId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const info: Array<[string, string]> = [
    ['資料類型', task.typeKey],
    ['Task ID', task.instanceId],
    ['讀表數量', String(task.total)],
    ['資料開始時間', task.dataStart],
    ['已回報電表數', String(task.replied)],
    ['資料結束時間', task.dataEnd],
  ]

  return (
    <SimpleModal
      title="ondemand讀取結果"
      onClose={onClose}
      width={1100}
      actions={<button onClick={download} className={BTN_PRIMARY}>下載全部</button>}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg">
          {info.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 px-2 py-2 text-[13px] [&:nth-child(4n+1)]:bg-inset [&:nth-child(4n+2)]:bg-inset">
              <span className="flex w-[130px] shrink-0 items-center gap-2 text-ink-sub">
                <span className="size-1.5 rounded-full" style={{ background: '#2B7FFF' }} />{k}
              </span>
              <span className="min-w-0 truncate tabular-nums text-ink">{v}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div className="overflow-hidden rounded-lg border border-border">
            <div ref={scrollRef} className="max-h-[420px] overflow-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-ink-sub">
                    <Th className="sticky top-0 z-10 bg-inset">電號</Th>
                    <Th className="sticky top-0 z-10 bg-inset">表號</Th>
                    <Th className="sticky top-0 z-10 bg-inset">回報</Th>
                  </tr>
                </thead>
                <tbody>
                  {meters.slice(0, visible).map((m, i) => {
                    const on = picked === m
                    return (
                      <tr
                        key={i}
                        onClick={() => setPicked(m)}
                        className={`cursor-pointer border-b border-divider hover:bg-inset/40 ${on ? 'bg-brand-soft-hover' : ''}`}
                      >
                        <td className="px-3 py-2.5 tabular-nums text-ink">{m.elecNo}</td>
                        <td className="px-3 py-2.5 tabular-nums text-ink">{m.meterNo}</td>
                        <td className="px-3 py-2.5">
                          {m.replied ? <Check size={16} className="text-danger" /> : <X size={16} className="text-ink-mut" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div ref={sentinelRef} />
            </div>
            <InfiniteFooter loaded={visible} total={meters.length} hasMore={hasMore} />
          </div>

          <div className="rounded-lg bg-inset/60 p-4">
            {picked && picked.replied ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-[14px] font-semibold text-ink">{picked.meterNo} 讀值</h3>
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="text-ink-sub"><Th>資料時間</Th><Th>累積電量 (kWh)</Th></tr>
                  </thead>
                  <tbody>
                    {meterReadings(task, picked).map(([t, v]) => (
                      <tr key={t} className="border-b border-divider">
                        <td className="px-3 py-2 tabular-nums text-ink">{t}</td>
                        <td className="px-3 py-2 tabular-nums text-ink">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <h3 className="text-[14px] font-semibold text-ink">無資料</h3>
            )}
          </div>
        </div>
      </div>
    </SimpleModal>
  )
}

/* ───────────────────────── 小零件 ───────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">{label}</span>
      {children}
    </label>
  )
}

function RangeInput({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const inner = 'bg-transparent text-[13px] tabular-nums text-ink focus:outline-none'
  return (
    <div className={`${FIELD_BOX} flex items-center gap-2 py-[5px]`}>
      <input type="datetime-local" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className={inner} />
      <ArrowRight size={14} className="text-ink-mut" />
      <input type="datetime-local" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className={inner} />
    </div>
  )
}
