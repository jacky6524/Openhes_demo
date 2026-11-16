import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Th, SearchHead, StatusPill, EnabledState, StampLines, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PillTabs } from '@/components/shared/PillTabs'
import { PageTitle } from '@/components/shared/PageTitle'
import { SimpleModal, BTN_GHOST, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { DCU_LIST_ROWS, METER_LIST_ROWS, type DcuListRow, type MeterListRow } from '@/data/dcuListPage'
import { status as statusTok } from '@/tokens'

/**
 * 裝置管理 · 停用清單（設計稿「停用清單-1」DCU、「停用清單-2」Meter）。
 *
 * 兩個頁籤各一張表，只列狀態為「停用」的裝置（取自 DCU清單／電表清單的 enabled=false，
 * 兩邊的數字對得起來）。可搜尋的欄位表頭有搜尋圖示，輸入即篩選；無限捲動（不分頁）。
 * 右上角「更新時間」為 mock 固定值。
 *
 * 2026-11-03 業主意見：
 *   · 預設停在 Meter 頁籤（頁籤順序也改成 Meter 在前）
 *   · Meter 欄位比照電表清單（區處及營業區／狀態／連線狀態／電號／表號／地址／模組型號・序號／DCU序號／IP／最後LP／MN 時間）
 *   · 新增批次啟用：勾選後右上「批次啟用」，確認後該批裝置改回啟用、從停用清單移除。
 *     demo 直接改記憶體裡的 enabled，電表清單／DCU清單的狀態會跟著變，重新整理還原。TODO: 接啟用 API
 */
type Kind = 'dcu' | 'meter'
const TABS = [
  { key: 'meter', label: 'Meter 停用清單' },
  { key: 'dcu', label: 'DCU 停用清單' },
] as const

interface Col<R> {
  key: string
  label: string
  width?: string
  /** 有給才可在表頭搜尋 */
  search?: (r: R) => string
  /** 表頭與內容水平置中（狀態欄，2026-11-11 業主意見） */
  center?: boolean
  cell: (r: R) => ReactNode
}

const stale = (sameDay: boolean) => (sameDay ? undefined : statusTok.danger.fg)
const MONO_BIG = 'font-mono text-[14px] font-semibold text-ink break-all'

const METER_COLS: Col<MeterListRow>[] = [
  { key: 'office', label: '區處及營業區', width: '9%', search: (m) => m.office, cell: (m) => <span className="text-ink-sub">{m.office}</span> },
  { key: 'state', label: '狀態', width: '5%', center: true, cell: () => <EnabledState enabled={false} /> }, // 比照電表清單／DCU清單的狀態欄
  { key: 'online', label: '連線狀態', width: '7%', cell: (m) => <StatusPill status={m.online ? 'online' : 'offline'} /> },
  { key: 'elecNo', label: '電號', width: '10%', search: (m) => m.elecNo, cell: (m) => <span className={MONO_BIG}>{m.elecNo}</span> },
  { key: 'meterNo', label: '表號', width: '10%', search: (m) => m.meterNo, cell: (m) => <span className={MONO_BIG}>{m.meterNo}</span> },
  { key: 'address', label: '地址', width: '17%', search: (m) => m.address, cell: (m) => <span className="text-[14px] leading-snug text-ink">{m.address}</span> },
  {
    key: 'module', label: '模組型號 / 序號', width: '11%', search: (m) => `${m.moduleModel} ${m.moduleSerial}`,
    cell: (m) => (
      <div className="flex flex-col leading-snug">
        <span className="text-[13px] text-ink">{m.moduleModel}</span>
        {/* 比照電表清單：序號與型號同字級、不用等寬字（等寬字字身較矮看起來小一號，業主 2026-11-04／11-11） */}
        <span className="text-[13px] tabular-nums text-ink-sub break-all">{m.moduleSerial}</span>
      </div>
    ),
  },
  {
    key: 'dcuSerial', label: 'DCU序號', width: '10%', search: (m) => m.dcuSerial,
    cell: (m) => <span className="font-mono text-ink-sub break-all">{m.dcuSerial || <span className="font-sans text-ink-mut">無</span>}</span>,
  },
  { key: 'ip', label: 'IP', width: '9%', search: (m) => m.ip, cell: (m) => <span className="font-mono text-ink-sub whitespace-nowrap">{m.ip}</span> },
  { key: 'lastLp', label: '最後LP時間', width: '6%', cell: (m) => <span className="tabular-nums" style={{ color: stale(m.lastLpSameDay) }}><StampLines value={m.lastLp.slice(0, 16)} /></span> },
  { key: 'lastMn', label: '最後MN時間', width: '6%', cell: (m) => <span className="tabular-nums" style={{ color: stale(m.lastMnSameDay) }}><StampLines value={m.lastMn.slice(0, 16)} /></span> },
]

const DCU_COLS: Col<DcuListRow>[] = [
  { key: 'serial', label: '裝置序號', search: (d) => d.serial, cell: (d) => <span className="tabular-nums text-ink">{d.serial}</span> },
  { key: 'code', label: 'DCU 編號', search: (d) => d.code, cell: (d) => <span className="tabular-nums text-ink">{d.code}</span> },
]

export function DisabledList() {
  const [kind, setKind] = useState<Kind>('meter')
  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="flex items-center justify-between">
        <PageTitle title="停用清單" />
        <span className="text-[12px] tabular-nums text-ink-mut">更新時間: 2026/01/01 15:00:00</span>
      </div>
      <PillTabs tabs={TABS} value={kind} onChange={setKind} />
      {/* key：換頁籤就重置該頁籤的欄位搜尋與勾選 */}
      {kind === 'meter' ? (
        <DisabledTable key="meter" noun="電表" cols={METER_COLS} source={METER_LIST_ROWS} idOf={(m) => m.meterNo} fixed />
      ) : (
        <DisabledTable key="dcu" noun="DCU" cols={DCU_COLS} source={DCU_LIST_ROWS} idOf={(d) => d.serial} />
      )}
    </div>
  )
}

function DisabledTable<R extends { enabled: boolean }>({
  noun, cols, source, idOf, fixed = false,
}: {
  noun: string
  cols: Col<R>[]
  source: R[]
  idOf: (r: R) => string
  /** 欄寬照 cols 的 width 固定（Meter 欄位多，比照電表清單不出現左右捲軸） */
  fixed?: boolean
}) {
  const [q, setQ] = useState<Record<string, string>>({})
  const [openCol, setOpenCol] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [version, setVersion] = useState(0) // 批次啟用改的是共用資料，靠這個讓清單重算
  const [notice, setNotice] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(
    () =>
      source.filter(
        (r) =>
          !r.enabled &&
          cols.every((c) => !c.search || !q[c.key]?.trim() || c.search(r).toLowerCase().includes(q[c.key].trim().toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, cols, q, version],
  )
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [q, version], 10)

  const ids = rows.map(idOf)
  const allChecked = ids.length > 0 && ids.every((id) => checked.has(id))
  const someChecked = ids.some((id) => checked.has(id))
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(ids))

  const enableChecked = () => {
    let n = 0
    for (const r of source) if (!r.enabled && checked.has(idOf(r))) { r.enabled = true; n++ }
    setChecked(new Set())
    setConfirm(false)
    setVersion((v) => v + 1)
    setNotice(`已啟用 ${n} 個${noun}`)
    window.setTimeout(() => setNotice(''), 3000)
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12px] text-ink-sub">
          {checked.size > 0
            ? <>已勾選 <b className="text-ink">{checked.size}</b> / 共 <b className="text-ink">{rows.length}</b> 個停用{noun}</>
            : <>共 <b className="text-ink">{rows.length}</b> 個停用{noun}</>}
          {notice && <span className="ml-3 font-semibold" style={{ color: statusTok.normal.fg }}>{notice}</span>}
        </span>
        <div className="flex items-center gap-2">
          {checked.size > 0 && <button onClick={() => setChecked(new Set())} className={BTN_GHOST}>取消</button>}
          <button
            onClick={() => setConfirm(true)}
            disabled={checked.size === 0}
            title={checked.size === 0 ? `請先勾選要啟用的${noun}` : undefined}
            className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            批次啟用{checked.size > 0 && ` (${checked.size})`}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[calc(100vh-340px)] min-h-[300px] overflow-auto">
        <table className={`w-full text-[13px] border-collapse ${fixed ? 'table-fixed' : ''}`}>
          {fixed && (
            <colgroup>
              <col style={{ width: '44px' }} />
              {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>
          )}
          <thead>
            <tr className="text-ink-sub">
              <Th className="sticky top-0 z-10 w-[44px] bg-inset">
                <Check checked={allChecked} indeterminate={!allChecked && someChecked} onChange={toggleAll} />
              </Th>
              {cols.map((c) => (
                <Th key={c.key} className={`sticky top-0 z-10 bg-inset !whitespace-normal ${c.center ? '!text-center' : ''}`}>
                  {c.search ? (
                    <SearchHead
                      label={c.label}
                      value={q[c.key] ?? ''}
                      open={openCol === c.key}
                      onToggle={() => setOpenCol(openCol === c.key ? null : c.key)}
                      onChange={(v) => setQ((s) => ({ ...s, [c.key]: v }))}
                    />
                  ) : c.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visible).map((r) => {
              const id = idOf(r)
              return (
                <tr key={id} onClick={() => toggle(id)} className={`cursor-pointer border-b border-divider align-middle hover:bg-inset/40 ${checked.has(id) ? 'bg-brand-soft-hover' : ''}`}>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Check checked={checked.has(id)} onChange={() => toggle(id)} />
                  </td>
                  {cols.map((c) => <td key={c.key} className={`px-3 py-3 ${c.center ? 'text-center' : ''}`}>{c.cell(r)}</td>)}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-3 py-10 text-center text-ink-mut">沒有符合條件的停用裝置</td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />

      {confirm && (
        <SimpleModal
          title="批次啟用"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button onClick={() => setConfirm(false)} className={BTN_GHOST}>取消</button>
              <button onClick={enableChecked} className={BTN_PRIMARY}>確認啟用</button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink">
            確定要啟用勾選的 <b>{checked.size}</b> 個{noun}嗎？
            <br />
            <span className="text-ink-sub">啟用後會從停用清單移除，並重新列入連線率與讀表率統計。</span>
          </p>
        </SimpleModal>
      )}
    </div>
  )
}

function Check({ checked, indeterminate, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
      onChange={onChange}
      className="size-4 cursor-pointer accent-danger"
    />
  )
}
