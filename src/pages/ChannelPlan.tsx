import { useRef, useState } from 'react'
import { Th, FilterHead, MenuItem, InfiniteFooter, useInfiniteRows } from '@/components/table/tableBits'
import { PageTitle } from '@/components/shared/PageTitle'
import { SpectrumChart } from '@/components/module/SpectrumChart'
import { VENDORS, VENDOR_COLOR, CHANNEL_ROWS, rowKey, type Vendor, type ChannelRow } from '@/data/channelPlan'

/**
 * 裝置模組 → 頻道規劃。
 *
 * 2026-11-04 業主意見：頻譜圖放在表格下方、版面撐滿視窗（表格吃剩下高度並自捲，頻譜圖固定在底部）。
 * 2026-11-11 業主意見：
 *   · 頻點改照業主提供的「頻點資料」：欄位 案別／HES設定／CCM1／頻點1／CCM2／頻點2（資料見 data/channelPlan.ts）
 *   · 分類維持**廠商**（業主：不要以案別分）；HES 設定 → 廠商 的對照目前是 mock
 *   · 頻點容易集中在一小段 → 頻譜圖可動態拉伸（見 components/module/SpectrumChart.tsx）
 * 表格篩選廠商時，頻譜圖其他廠商淡化；滑過表格某列，頻譜圖上該組頻點加框。
 */
const ALL = 'ALL'
const fmt = (f: number) => (Math.round(f * 100) / 100).toString()

export function ChannelPlan() {
  const [vendor, setVendor] = useState<string>(ALL)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const rows = CHANNEL_ROWS.filter((r) => vendor === ALL || r.vendor === vendor)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [vendor], 30)

  return (
    <div className="flex h-full min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="頻道規劃" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div ref={scrollRef} className="min-h-[220px] flex-1 overflow-auto">
          <table className="w-full table-fixed text-[13px] border-collapse">
            <colgroup>
              <col style={{ width: '160px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col /><col /><col /><col />
            </colgroup>
            <thead>
              <tr className="text-ink-sub">
                <Th className="sticky top-0 z-20 bg-inset">
                  <FilterHead label={vendor === ALL ? '廠商' : `廠商：${vendor}`} open={open} onToggle={() => setOpen((o) => !o)}>
                    {[ALL, ...VENDORS].map((c) => (
                      <MenuItem key={c} active={vendor === c} onClick={() => { setVendor(c); setOpen(false) }}>{c}</MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                {['案別', 'HES設定', 'CCM1', '頻點1（MHz）', 'CCM2', '頻點2（MHz）'].map((c) => (
                  <Th key={c} className="sticky top-0 z-10 bg-inset">{c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((r) => {
                const k = rowKey(r)
                return (
                  <tr
                    key={k}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover(null)}
                    className="border-b border-divider hover:bg-inset/40"
                  >
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 font-semibold text-ink">
                        <span className="size-2.5 rounded-sm" style={{ background: VENDOR_COLOR[r.vendor] }} />{r.vendor}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-sub">{r.caseId}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{r.hes}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink">{r.ccm1}</td>
                    <FreqCell r={r} field="f1" />
                    <td className="px-3 py-2.5 tabular-nums text-ink">{r.ccm2 ?? '-'}</td>
                    <FreqCell r={r} field="f2" />
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div ref={sentinelRef} />
        </div>
        <InfiniteFooter loaded={Math.min(visible, rows.length)} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>

      <SpectrumChart rows={CHANNEL_ROWS} focus={vendor === ALL ? null : (vendor as Vendor)} highlight={hover} />
    </div>
  )
}

/** 頻點欄：與 CCM 換算對不上的（原始資料疑似筆誤）用橘字＋說明，不擅自更正 */
function FreqCell({ r, field }: { r: ChannelRow; field: 'f1' | 'f2' }) {
  const v = r[field]
  if (v === null) return <td className="px-3 py-2.5 text-ink">-</td>
  const bad = r.suspect?.field === field ? r.suspect.expected : null
  return (
    <td className="px-3 py-2.5 tabular-nums">
      {bad === null ? (
        <span className="text-ink">{fmt(v)}</span>
      ) : (
        <span className="text-[#B45309]" title={`依 CCM 換算應為 ${fmt(bad)}，原始資料為 ${fmt(v)}，待業主確認`}>
          {fmt(v)} <span className="text-[12px]">（換算應為 {fmt(bad)}，待確認）</span>
        </span>
      )}
    </td>
  )
}
