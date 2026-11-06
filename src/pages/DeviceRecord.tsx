import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Th, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PillTabs } from '@/components/shared/PillTabs'
import { PageTitle } from '@/components/shared/PageTitle'

/**
 * 裝置管理 · 裝置紀錄（Figma 4182:31479 DCU 修改紀錄／4188:27161 Meter 修改紀錄）。
 *
 * 兩個頁籤各一組篩選與表格；表格的「修改前/後」欄位上下兩行（前在上、後在下，沒改為 -）。
 * 篩選在按「搜尋」時才套用，「清除條件」回到預設。資料全為 mock。
 */
type Kind = 'dcu' | 'meter'
// 2026-11-06 業主意見：Meter 排前面、預設 Meter
const TABS = [
  { key: 'meter', label: 'Meter 修改紀錄' },
  { key: 'dcu', label: 'DCU 修改紀錄' },
] as const

/** 單格：字串＝一行；[前, 後]＝兩行 */
type V = string | [string, string]
interface Col { key: string; label: string; sub?: string }
type Row = Record<string, V> & { _date: string }

const DCU_COLS: Col[] = [
  { key: 'office', label: '區處及營業區' },
  { key: 'code', label: 'DCU編號', sub: '(修改前/後)' },
  { key: 'serial', label: 'DCU序號', sub: '(修改前/後)' },
  { key: 'channel', label: '頻道組別', sub: '(修改前/後)' },
  { key: 'whitelist', label: '白名單' },
  { key: 'mode', label: '模式', sub: '(修改前/後)' },
  { key: 'contract', label: '合約編號', sub: '(修改前/後)' },
  { key: 'note', label: '備註', sub: '(修改前/後)' },
  { key: 'note2', label: '備註2', sub: '(修改前/後)' },
  { key: 'time', label: '修改時間' },
  { key: 'who', label: '操作者' },
]
const METER_COLS: Col[] = [
  { key: 'office', label: '區處及營業區' },
  { key: 'elecNo', label: '電號', sub: '(修改前/後)' },
  { key: 'meterNo', label: '表號', sub: '(修改前/後)' },
  { key: 'address', label: '地址' },
  { key: 'model', label: '模組型號', sub: '(修改前/後)' },
  { key: 'code', label: 'DCU編號', sub: '(修改前/後)' },
  { key: 'serial', label: 'DCU序號', sub: '(修改前/後)' },
  { key: 'fanMac', label: 'FAN MAC', sub: '(修改前/後)' },
  { key: 'contract', label: '合約編號', sub: '(修改前/後)' },
  { key: 'cycle', label: '閱票日序', sub: '(修改前/後)' },
  { key: 'note', label: '備註', sub: '(修改前/後)' },
  { key: 'note2', label: '備註2', sub: '(修改前/後)' },
  { key: 'note3', label: '備註3', sub: '(修改前/後)' },
  { key: 'time', label: '修改時間' },
]

const MODES_DCU = ['FAN MAC', 'DCU序號', 'DCU編號']
const MODES_METER = ['FAN MAC', '電號', '表號']
const WHITELISTS = ['空白黑名單', '已加入白名單']
const STATES = ['停用', '啟用']
const DCU_MODE_V = ['被動', '主動']

const mkDcu = (): Row[] => Array.from({ length: 40 }, (_, i) => ({
  _date: '2025-01-01',
  office: 'TP-台北區處-01',
  code: ['B5122DC39-1', 'B5122DC39-2'],
  serial: ['AE1092D00630', 'AE1092D00635'],
  channel: ['A', '-'],
  whitelist: WHITELISTS[0],
  mode: [DCU_MODE_V[i < 2 ? 0 : 1], '-'],
  contract: ['108-FET', '-'],
  note: ['108-P11', '-'],
  note2: ['1150324', '1150424'],
  time: '2025/01/01 10:30:00',
  who: 'FET-吳佳芸 修改',
  _state: STATES[i % 5 === 0 ? 1 : 0],
  _comm: i % 4 === 0 ? 'RF' : 'PLC',
  _sync: i % 3 === 0 ? 'Y' : 'N',
  _chan: 'A群組',
  _fan: `18BE92FFFF${String(18548 + i).padStart(6, '0')}`,
} as Row))
const mkMeter = (): Row[] => Array.from({ length: 40 }, (_, i) => ({
  _date: '2025-01-01',
  office: 'TP-台北區處-01',
  elecNo: ['C0000000100', 'C0000000110'],
  meterNo: ['C0000000100', 'C0000000110'],
  address: '台北市大安區敦化南路二段77號',
  model: ['SGCM-W62-TFA', 'SGCM-W32-TFA'],
  code: ['DCU_0010', 'DCU_0014'],
  serial: ['AE1092D00630', 'AE1092D00635'],
  fanMac: ['108-FET', '-'],
  contract: ['108-FET', '-'],
  cycle: ['02', '04'],
  note: ['108-P11', '-'],
  note2: ['1150324', '1150424'],
  note3: ['1150324', '1150424'],
  time: '2025/01/01 10:30:00',
  _state: STATES[i % 5 === 0 ? 1 : 0],
  _fan: `18BE92FFFF${String(18548 + i).padStart(6, '0')}`,
} as Row))

const flat = (v: V | undefined) => (Array.isArray(v) ? v.join(' ') : v ?? '')

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

interface Q {
  mode: string; text: string; office: string
  a: string; b: string; c: string; d: string; e: string; f: string // 依頁籤各自的下拉（見下方 FIELDS）
  from: string; to: string; dcuText: string
}
const EMPTY: Q = { mode: 'FAN MAC', text: '', office: '', a: 'ALL', b: 'ALL', c: 'ALL', d: 'ALL', e: 'ALL', f: 'ALL', from: '2025-01-01', to: '2025-01-01', dcuText: '' }

export function DeviceRecord() {
  const [kind, setKind] = useState<Kind>('meter')
  const [draft, setDraft] = useState<Q>(EMPTY)
  const [applied, setApplied] = useState<Q>(EMPTY)
  const scrollRef = useRef<HTMLDivElement>(null)
  const set = <K extends keyof Q>(k: K, v: Q[K]) => setDraft((x) => ({ ...x, [k]: v }))

  const data = useMemo(() => ({ dcu: mkDcu(), meter: mkMeter() }), [])
  const cols = kind === 'dcu' ? DCU_COLS : METER_COLS

  const apply = () => { setApplied(draft) }
  const clear = () => { setDraft(EMPTY); setApplied(EMPTY) }
  const switchKind = (k: Kind) => { setKind(k); setDraft(EMPTY); setApplied(EMPTY) }

  const rows = useMemo(() => {
    const t = applied.text.trim().toLowerCase()
    const o = applied.office.trim().toLowerCase()
    const dq = applied.dcuText.trim().toLowerCase()
    return data[kind].filter((r) => {
      if (r._date < applied.from || r._date > applied.to) return false
      if (o && !flat(r.office).toLowerCase().includes(o)) return false
      // 狀態下拉：dcu 頁在 a、meter 頁在 d（見下方表單）
      const st = kind === 'dcu' ? applied.a : applied.d
      if (st !== 'ALL' && flat(r._state) !== st) return false
      if (kind === 'dcu') {
        if (applied.b !== 'ALL' && flat(r._comm) !== applied.b) return false
        if (applied.d !== 'ALL' && flat(r._sync) !== applied.d) return false
      }
      if (t) {
        const key = applied.mode === 'FAN MAC' ? flat(r._fan)
          : applied.mode === 'DCU序號' ? flat(r.serial)
          : applied.mode === 'DCU編號' ? flat(r.code)
          : applied.mode === '電號' ? flat(r.elecNo)
          : flat(r.meterNo)
        if (!key.toLowerCase().includes(t)) return false
      }
      if (kind === 'meter' && applied.b !== 'ALL' && flat(r.model[0] as string) !== applied.b) return false
      if (kind === 'meter' && dq && !(flat(r.code) + flat(r.serial)).toLowerCase().includes(dq)) return false
      return true
    })
  }, [data, kind, applied])

  // 無限捲動（業主不要頁碼）：換頁籤或條件變動回到第一批
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [kind, applied], 10)
  const pageRows = rows.slice(0, visible)

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="裝置紀錄" />
      <PillTabs tabs={TABS} value={kind} onChange={switchKind} />

      {/* 篩選（搜尋列＋條件列） */}
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <F label="搜尋">
            <select value={draft.mode} onChange={(e) => set('mode', e.target.value)} className={`${BOX} w-[144px]`}>
              {(kind === 'dcu' ? MODES_DCU : MODES_METER).map((m) => <option key={m}>{m}</option>)}
            </select>
          </F>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
            <input value={draft.text} onChange={(e) => set('text', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="搜尋" className={`${BOX} w-[240px] pl-9`} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <F label="營業區">
            <input value={draft.office} onChange={(e) => set('office', e.target.value)} placeholder="請輸入" className={`${BOX} w-[144px]`} />
          </F>
          {kind === 'dcu' ? (
            <>
              <F label="選擇DCU"><Sel v={draft.c} on={(v) => set('c', v)} opts={['B5122DC39', 'B5122DC40']} /></F>
              <F label="狀態"><Sel v={draft.a} on={(v) => set('a', v)} opts={STATES} /></F>
              <F label="通訊方式"><Sel v={draft.b} on={(v) => set('b', v)} opts={['RF', 'PLC']} allLabel="所有型號" /></F>
              <F label="頻道組別"><Sel v={draft.e} on={(v) => set('e', v)} opts={['A群組', 'B群組']} /></F>
              <F label="可同步"><Sel v={draft.d} on={(v) => set('d', v)} opts={['Y', 'N']} /></F>
              <F label="電表群組"><Sel v={draft.f} on={(v) => set('f', v)} opts={['群組A', '群組B']} /></F>
            </>
          ) : (
            <>
              <F label="電表分類"><Sel v={draft.a} on={(v) => set('a', v)} opts={['住宅', '商業']} /></F>
              <F label="選擇模組"><Sel v={draft.b} on={(v) => set('b', v)} opts={['SGCM-W62-TFA', 'SGCM-W32-TFA']} allLabel="所有型號" /></F>
              <F label="狀態"><Sel v={draft.d} on={(v) => set('d', v)} opts={STATES} /></F>
              <F label="群組"><Sel v={draft.e} on={(v) => set('e', v)} opts={['A群組', 'B群組']} /></F>
            </>
          )}
          <F label="資料時間">
            <div className="flex items-center gap-1.5">
              <input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} className={BOX} />
              <span className="text-ink-mut">→</span>
              <input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} className={BOX} />
            </div>
          </F>
          {kind === 'meter' && (
            <F label="DCU搜尋">
              <input value={draft.dcuText} onChange={(e) => set('dcuText', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="DCU編號／序號" className={`${BOX} w-[170px]`} />
            </F>
          )}
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">清除條件</button>
          <button onClick={apply} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">搜尋</button>
        </div>
      </div>

      {/* 表格：自己捲、表頭釘住 */}
      <div className="rounded-card bg-surface border border-border shadow-card overflow-hidden">
        <div ref={scrollRef} className="max-h-[calc(100vh-350px)] min-h-[240px] overflow-auto">
          <table className="w-full min-w-[1400px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                {cols.map((c) => (
                  <Th key={c.key} className="sticky top-0 z-10 bg-inset align-top">
                    <div>{c.label}</div>
                    {c.sub && <div className="text-[12px] font-normal text-ink-mut">{c.sub}</div>}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={i} className="border-b border-divider hover:bg-inset/40">
                  {cols.map((c) => <td key={c.key} className="px-3 py-2.5 align-middle text-ink"><Cell v={r[c.key]} /></td>)}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-ink-mut">查無符合條件的修改紀錄</td></tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={pageRows.length} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
    </div>
  )
}

function Cell({ v }: { v: V | undefined }) {
  if (Array.isArray(v)) {
    return <div className="leading-[1.35]"><div>{v[0]}</div><div>{v[1]}</div></div>
  }
  const s = v ?? ''
  // 修改時間／操作者等長字串：時間拆兩行，與電表清單的日期時間做法一致
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(s)
  if (m) return <div className="leading-[1.35] tabular-nums"><div>{m[1]}</div><div>{m[2]}</div></div>
  const w = /^(.+?) (修改)$/.exec(s)
  if (w) return <div className="leading-[1.35]"><div>{w[1]}</div><div>{w[2]}</div></div>
  return <>{s}</>
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">{label}</span>
      {children}
    </label>
  )
}

function Sel({ v, on, opts, allLabel = 'ALL' }: { v: string; on: (v: string) => void; opts: string[]; allLabel?: string }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value)} className={`${BOX} w-[144px]`}>
      <option value="ALL">{allLabel}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
