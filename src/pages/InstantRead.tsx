import { useMemo, useRef, useState } from 'react'
import { Check, Files, RotateCw, X } from 'lucide-react'
import { Th, SortHead, StampLines, InfiniteFooter, useInfiniteRows, RED, type SortDir } from '@/components/table/tableBits'
import { fmtDate } from '@/lib/format'
import { SimpleModal, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { PageTitle } from '@/components/shared/PageTitle'
import { TargetSearchMulti, FIELD_BOX, parseTargets, type TargetMode } from '@/components/shared/TargetSearch'
import { READ_TASKS, taskMeters, meterReadings, type ReadTask } from '@/data/readTasks'
import { ODR_TYPES, dataTypeOf, type OdrKey } from '@/data/readDataTypes'
import { useDeviceGroups, type DeviceGroup, type GroupKind } from '@/store/useDeviceGroups'
import { Field, GroupSelect, QueryButtons, RangeInput } from '@/components/shared/QueryFields'

/**
 * 讀表管理 · 即時讀表（設計稿「即時讀表-1」列表、「即時讀表-2」ondemand 讀取結果彈窗）。
 *
 * 上方查詢條件每按一次「搜尋」就開一個頁籤「報表列表 (N)」（N＝該條件的結果筆數，可關閉），
 * 頁籤內再有一組「排程時間」區間只篩這個頁籤。列表無限捲動（業主不要頁碼）。
 * 點一列開彈窗：基本資料＋每顆電表有沒有回報；點已回報的電表，右側看讀值。
 * 資料全為 mock（data/readTasks.ts）。
 *
 * 2026-11-03 業主意見：群組改成下拉（內容＝裝置群組頁的群組；DCU群組比對電表所屬 DCU、
 * 電表群組比對表號）；資料類型拿掉 ALL；讀表備註移到最後；
 * 時間一律 24 小時制、以 15 分為單位；資料時間單次上限一個月。
 * 2026-11-04 業主意見：群組回到「搜尋模式」與表號／電號同層級的單選，選群組時輸入框換成群組下拉。
 * 同日依設計稿「即時讀表01.png」：搜尋模式改成膠囊頁籤（表號／電號／群組），表號、電號改為
 * 多行輸入框，可輸入一筆或貼上多筆（換行分隔），任一筆對上任務裡的電表就算命中（TargetSearchMulti）。
 */
// 資料類型下拉：7 項、與 MDMS上拋共用（data/readDataTypes.ts，2026-11-04 業主指定）

interface Query {
  mode: TargetMode
  text: string // 表號／電號模式的輸入（多筆以換行分隔）
  group: string // 群組模式選的群組：`${kind}:${群組名}`，'' ＝未選
  note: string
  dataType: OdrKey
  from: string // YYYY-MM-DDTHH:mm（分鐘只會是 00／15／30／45）
  to: string
  lastN: string
  overdue: string
}
const EMPTY: Query = { mode: 'meterNo', text: '', group: '', note: '', dataType: 'MN', from: '', to: '', lastN: '', overdue: '' }

type Groups = Record<GroupKind, DeviceGroup[]>

const stamp = (v: string) => v.replace('T', ' ')

function matches(t: ReadTask, q: Query, groups: Groups) {
  if (q.mode === 'group' && q.group) {
    const i = q.group.indexOf(':')
    const kind = q.group.slice(0, i) as GroupKind
    const ids = new Set(groups[kind]?.find((g) => g.name === q.group.slice(i + 1))?.ids ?? [])
    const field = kind === 'dcu' ? 'dcuSerial' : 'meterNo'
    if (!taskMeters(t).some((m) => ids.has(m[field]))) return false
  }
  if (q.note.trim() && !t.note.toLowerCase().includes(q.note.trim().toLowerCase())) return false
  if (t.dataType !== q.dataType) return false
  // common／del_total_kwh 是即時值（後端 needTimePeriod=false），不吃資料時間條件
  const timed = dataTypeOf(q.dataType).needTimePeriod
  if (timed && q.from && t.dataStart.slice(0, 16) < stamp(q.from)) return false
  if (timed && q.to && t.dataEnd.slice(0, 16) > stamp(q.to)) return false
  if (q.overdue && t.overdue < Number(q.overdue)) return false
  const targets = parseTargets(q.text).map((s) => s.toLowerCase())
  if (q.mode !== 'group' && targets.length) {
    const key = q.mode
    return taskMeters(t).some((m) => {
      const v = m[key].toLowerCase()
      return targets.some((x) => v.includes(x))
    })
  }
  return true
}

/** 套用整組查詢；「最後資料(筆)」＝最近的 N 筆（依讀取開始時間新→舊） */
function runQuery(q: Query, groups: Groups): ReadTask[] {
  const hit = READ_TASKS.filter((t) => matches(t, q, groups))
  const n = parseInt(q.lastN, 10)
  if (!(n > 0)) return hit
  return [...hit].sort((a, b) => b.readStart.localeCompare(a.readStart)).slice(0, n)
}

/** 頁籤在按搜尋當下就把結果算好，之後群組被改也不影響已開的頁籤 */
interface Tab { id: number; rows: ReadTask[] }

export function InstantRead() {
  const groups = useDeviceGroups((s) => s.groups)
  const [draft, setDraft] = useState<Query>(EMPTY)
  const nextId = useRef(2)
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: 1, rows: runQuery(EMPTY, groups) }])
  const [activeId, setActiveId] = useState(1)
  const set = <K extends keyof Query>(k: K, v: Query[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const search = () => {
    const id = nextId.current++
    setTabs((ts) => [...ts, { id, rows: runQuery(draft, groups) }])
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
    <div className="flex h-full min-h-[680px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="即時讀表" icon={<Files size={20} className="text-brand" />} />

      <div className="flex flex-col gap-2">
        <TargetSearchMulti
          mode={draft.mode}
          text={draft.text}
          onMode={(m) => set('mode', m)}
          onText={(v) => set('text', v)}
          onSubmit={search}
          groupInput={<GroupSelect value={draft.group} onChange={(v) => set('group', v)} />}
        />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="選擇資料類型">
            <select value={draft.dataType} onChange={(e) => set('dataType', e.target.value as OdrKey)} className={`${FIELD_BOX} w-[200px]`}>
              {ODR_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          {/* common／del_total_kwh 讀的是即時值（後端 needTimePeriod=false）→ 資料時間停用 */}
          <Field label="資料時間" hint={dataTypeOf(draft.dataType).needTimePeriod ? '單次查詢上限 1 個月' : '此類型讀取即時值，不需資料時間'}>
            <fieldset disabled={!dataTypeOf(draft.dataType).needTimePeriod} className="disabled:cursor-not-allowed disabled:opacity-50">
              <RangeInput from={draft.from} to={draft.to} maxMonths={1} onChange={(from, to) => setDraft((d) => ({ ...d, from, to }))} />
            </fieldset>
          </Field>
          <Field label="最後資料 (筆)">
            <input value={draft.lastN} onChange={(e) => set('lastN', e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="全部" className={`${FIELD_BOX} w-[120px]`} />
          </Field>
          <Field label="設定逾期時間 (10分鐘起)">
            <input value={draft.overdue} onChange={(e) => set('overdue', e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="10" className={`${FIELD_BOX} w-[176px]`} />
          </Field>
          <Field label="讀表備註">
            <input value={draft.note} onChange={(e) => set('note', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Input" className={`${FIELD_BOX} w-[240px]`} />
          </Field>
          <QueryButtons onClear={clear} onSearch={search} />
        </div>
      </div>

      {/* 撐滿剩餘高度，表格在卡片內自己捲（2026-11-06） */}
      <div className="flex min-h-0 flex-1 flex-col rounded-card bg-surface border border-border shadow-card">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-[15px] font-semibold text-ink">即時讀表紀錄</h2>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-1 border-b border-border px-4">
          {tabs.map((t) => {
            const on = t.id === active.id
            return (
              <div key={t.id} className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] ${on ? 'font-semibold text-brand' : 'text-ink-mut'}`}>
                <button onClick={() => setActiveId(t.id)} className="whitespace-nowrap">報表列表 ({t.rows.length})</button>
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
        <TaskPanel key={active.id} base={active.rows} />
      </div>
    </div>
  )
}

/* ───────────────────────── 頁籤內容：排程時間＋表格 ───────────────────────── */

type SortKey = 'no' | 'instanceId' | 'dataType' | 'readStart' | 'readEnd' | 'dataStart' | 'dataEnd' | 'overdue' | 'doneAt' | 'replied'

function TaskPanel({ base }: { base: ReadTask[] }) {
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

  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [base, sched, sortKey, sortDir], 30)
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: SortKey, label: string) => (
    <Th className="sticky top-0 z-10 bg-inset"><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></Th>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div className="flex items-end gap-2 py-3">
        <Field label="排程時間">
          <RangeInput from={draft.from} to={draft.to} onChange={(from, to) => setDraft({ from, to })} />
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div ref={scrollRef} className="min-h-[240px] flex-1 overflow-auto">
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
                  <td className="px-3 py-2.5 text-ink whitespace-nowrap">{dataTypeOf(t.dataType).label}</td>
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

/** ondemand 結果兩張表的列高與共用樣式（左右列要對齊，高度必須固定） */
const ROW_H = 38
const HEAD = 'sticky top-0 z-10 bg-inset'
const CELL = 'px-3 tabular-nums text-ink align-middle'

function ResultModal({ task, onClose }: { task: ReadTask; onClose: () => void }) {
  const meters = useMemo(() => taskMeters(task), [task])
  /**
   * 2026-11-04 業主意見：資料時間、累積電量要跟電表同步捲動、全部直接列出（方便對照），
   * 不再「點左邊一顆電表 → 右邊看讀值」。同日第二版：讀值獨立成右邊一張表，但與左表同步下滑。
   *   左表  電號／表號／回報，一顆電表一列，列高＝它的讀值筆數 × ROW_H
   *   右表  資料時間／累積電量，一筆讀值一列（負載資料每顆 4 筆、午夜資料 1 筆；沒回報一列「—」）
   * 兩張表放在同一個捲動容器裡並排 —— 天生同步，不用監聽 scroll 互相對齊；表頭各自 sticky。
   */
  const groups = useMemo(
    () => meters.map((m) => ({ m, readings: m.replied ? meterReadings(task, m) : [] as Array<[string, string]> })),
    [meters, task],
  )
  const { visible, sentinelRef, hasMore } = useInfiniteRows(groups.length, [task.no], 20)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shown = groups.slice(0, visible)
  /** 右表讀值欄的欄名依類型（累積電量／電壓／最大需量／事件碼） */
  const valueLabel = dataTypeOf(task.dataType).valueLabel

  /** 下載全部＝兩張表合併（一筆讀值一列；沒回報的電表讀值留空） */
  const download = () => {
    const lines = [`電號,表號,回報,資料時間,${valueLabel}`]
    for (const { m, readings } of groups) {
      const head = `${m.elecNo},${m.meterNo},${m.replied ? 'Y' : 'N'}`
      if (readings.length === 0) lines.push(`${head},,`)
      else for (const [t, v] of readings) lines.push(`${head},${fmtDate(t)},${v}`)
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    a.download = `ondemand-${task.instanceId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const info: Array<[string, string]> = [
    ['資料類型', dataTypeOf(task.dataType).odr ?? ''], // 後端 demand-types 的 name
    ['Task ID', task.instanceId],
    ['讀表數量', String(task.total)],
    ['資料開始時間', fmtDate(task.dataStart)],
    ['已回報電表數', String(task.replied)],
    ['資料結束時間', fmtDate(task.dataEnd)],
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

        <div className="overflow-hidden rounded-lg border border-border">
          <div ref={scrollRef} className="max-h-[460px] overflow-auto">
            {/* 兩張表並排在同一個捲動區、一起捲動；2026-11-06 設計稿：中間不留空隙、表頭連成一條，
                右表左側一條分隔線，視覺上是一張表 */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
              <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr className="text-ink-sub">
                    <Th className={HEAD}>電號</Th>
                    <Th className={HEAD}>表號</Th>
                    <Th className={HEAD}>回報</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ m, readings }, gi) => (
                    <tr key={gi} style={{ height: Math.max(1, readings.length) * ROW_H }}>
                      <td className={`${CELL} border-b border-border`}>{m.elecNo}</td>
                      <td className={`${CELL} border-b border-border`}>{m.meterNo}</td>
                      <td className="border-b border-border px-3 align-middle">
                        {m.replied ? <Check size={16} className="text-danger" /> : <X size={16} className="text-ink-mut" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="w-full table-fixed border-separate border-spacing-0 border-l border-border text-[13px]">
                <colgroup>
                  <col style={{ width: '56%' }} />
                  <col style={{ width: '44%' }} />
                </colgroup>
                <thead>
                  <tr className="text-ink-sub">
                    <Th className={HEAD}>資料時間</Th>
                    <Th className={HEAD}>{valueLabel}</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.flatMap(({ readings }, gi) => {
                    const rows: Array<[string, string] | null> = readings.length ? readings : [null]
                    return rows.map((r, ri) => {
                      // 每顆電表的最後一筆畫深一點的線，和左表的電表分隔線對齊
                      const line = ri === rows.length - 1 ? 'border-b border-border' : 'border-b border-divider'
                      return (
                        <tr key={`${gi}-${ri}`} style={{ height: ROW_H }}>
                          <td className={`${CELL} ${line}`}>{r ? fmtDate(r[0]) : <span className="text-ink-mut">—</span>}</td>
                          <td className={`${CELL} ${line}`}>{r ? r[1] : <span className="text-ink-mut">—</span>}</td>
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
            <div ref={sentinelRef} />
          </div>
          <InfiniteFooter loaded={Math.min(visible, groups.length)} total={groups.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
        </div>
      </div>
    </SimpleModal>
  )
}
