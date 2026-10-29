import { useMemo, useRef, useState } from 'react'
import { Th, SearchHead, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PillTabs } from '@/components/shared/PillTabs'
import { PageTitle } from '@/components/shared/PageTitle'
import { DCU_LIST_ROWS, METER_LIST_ROWS } from '@/data/dcuListPage'

/**
 * 裝置管理 · 停用清單（設計稿「停用清單-1」DCU、「停用清單-2」Meter）。
 *
 * 兩個頁籤各一張表，只列狀態為「停用」的裝置（取自 DCU清單／電表清單的 enabled=false，
 * 兩邊的數字對得起來）。每個欄位表頭有搜尋圖示，輸入即篩選；無限捲動（不分頁）。
 * 右上角「更新時間」為 mock 固定值。
 */
type Kind = 'dcu' | 'meter'
const TABS = [
  { key: 'dcu', label: 'DCU 停用清單' },
  { key: 'meter', label: 'Meter 停用清單' },
] as const

interface Col { key: string; label: string }
const COLS: Record<Kind, Col[]> = {
  dcu: [{ key: 'serial', label: '裝置序號' }, { key: 'code', label: 'DCU 編號' }],
  meter: [{ key: 'meterNo', label: '表號' }, { key: 'elecNo', label: '電號' }, { key: 'mac', label: 'MAC' }],
}

type Row = Record<string, string>
const DATA: Record<Kind, Row[]> = {
  dcu: DCU_LIST_ROWS.filter((d) => !d.enabled).map((d) => ({ serial: d.serial, code: d.code })),
  meter: METER_LIST_ROWS.filter((m) => !m.enabled).map((m) => ({ meterNo: m.meterNo, elecNo: m.elecNo, mac: m.fanMac })),
}

export function DisabledList() {
  const [kind, setKind] = useState<Kind>('dcu')
  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="flex items-center justify-between">
        <PageTitle title="停用清單" />
        <span className="text-[12px] tabular-nums text-ink-mut">更新時間: 2026.01.01 15:00:00</span>
      </div>
      <PillTabs tabs={TABS} value={kind} onChange={setKind} />
      {/* key：換頁籤就重置該頁籤的欄位搜尋 */}
      <DisabledTable key={kind} kind={kind} />
    </div>
  )
}

function DisabledTable({ kind }: { kind: Kind }) {
  const cols = COLS[kind]
  const [q, setQ] = useState<Record<string, string>>({})
  const [openCol, setOpenCol] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(
    () => DATA[kind].filter((r) => cols.every((c) => !q[c.key]?.trim() || r[c.key].toLowerCase().includes(q[c.key].trim().toLowerCase()))),
    [kind, cols, q],
  )
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [kind, q], 10)

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div ref={scrollRef} className="max-h-[calc(100vh-290px)] min-h-[300px] overflow-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-ink-sub">
              {cols.map((c) => (
                <Th key={c.key} className="sticky top-0 z-10 bg-inset">
                  <div className="flex items-center justify-between">
                    <SearchHead
                      label={c.label}
                      value={q[c.key] ?? ''}
                      open={openCol === c.key}
                      onToggle={() => setOpenCol(openCol === c.key ? null : c.key)}
                      onChange={(v) => setQ((s) => ({ ...s, [c.key]: v }))}
                    />
                  </div>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visible).map((r, i) => (
              <tr key={i} className="border-b border-divider">
                {cols.map((c) => <td key={c.key} className="px-3 py-3 tabular-nums text-ink">{r[c.key]}</td>)}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-ink-mut">沒有符合條件的停用裝置</td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  )
}
