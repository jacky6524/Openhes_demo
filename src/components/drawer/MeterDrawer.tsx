import { useMemo, useState } from 'react'
import { ArrowLeft, Copy, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { useDashboard } from '@/store/useDashboard'
import { dcusForRegion } from '@/data/meters'
import { classify, THRESHOLDS } from '@/config/thresholds'
import { fmtInt } from '@/lib/format'
import { health as healthTok } from '@/tokens'
import type { Dcu, Health } from '@/types'

/**
 * Deepest-level detail drawer (§4.5): slides over the cross-compare module and
 * lists ALL the region's DCUs. This is the ONLY place individual DCUs appear.
 * Columns: DCU序號 / LP狀態 / 電表總數 / 連線數 / LP讀表數 / 連線率 / LP讀表率 —
 * 每個欄位皆可排序，預設以 LP 狀態由差→好排序。LP狀態 uses the SAME LP-rate
 * thresholds as the map, so drawer ↔ map stay consistent；DCU序號 click-to-copy。
 * 標題以「返回」鍵回到 L2 縣市層（不再使用叉叉）。
 *
 * 外觀對齊前端 `.dcu-detail-panel`：
 *   header  min-height 54 / padding 10 16；返回鍵 30×30 圓角 6，hover #f5eff1/#b83257
 *           標題 18px、附註 13px #9a8c91
 *   head    sticky、bg #f4f1f2、11px/700 #6f6267
 *   row     min-height 39、下框 #eee6e8、欄間左框 #f0e9eb、12px #3a3336
 *   pill    radius 6 / 11px/800 / 前置 6px 圓點（正常 / 注意 / 警告）
 */

type SortKey = 'serial' | 'status' | 'meterTotal' | 'connected' | 'read' | 'connectRate' | 'lpRate'
type SortDir = 'asc' | 'desc'

/** LP狀態 derived from lpRate — identical logic to the map's LP colouring */
function lpStatus(lpRate: number): Health {
  return classify(lpRate, THRESHOLDS.lp)
}
const STATUS_RANK: Record<Health, number> = { good: 0, warning: 1, alert: 2 }

export function MeterDrawer() {
  const region = useDashboard((s) => s.drawerRegion)
  const close = useDashboard((s) => s.closeDrawer)
  const goBack = useDashboard((s) => s.goBack)
  // 帶出該區域所有 DCU（不做取樣上限）
  const dcus = useMemo(() => (region ? dcusForRegion(region, 999) : []), [region])

  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [copied, setCopied] = useState<string | null>(null)

  const rows = useMemo(() => {
    const arr = [...dcus]
    arr.sort((a, b) => {
      let d = 0
      if (sortKey === 'serial') d = a.serial.localeCompare(b.serial)
      else if (sortKey === 'status') d = STATUS_RANK[lpStatus(a.lpRate)] - STATUS_RANK[lpStatus(b.lpRate)]
      else d = a[sortKey] - b[sortKey]
      return sortDir === 'asc' ? d : -d
    })
    return arr
  }, [dcus, sortKey, sortDir])

  // 返回：關閉詳情並退回上一層（L3 → L2 縣市）
  const backToL2 = () => {
    close()
    goBack()
  }

  if (!region) return null

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'serial' ? 'asc' : 'desc')
    }
  }

  const copySerial = (serial: string) => {
    navigator.clipboard?.writeText(serial).then(
      () => {
        setCopied(serial)
        window.setTimeout(() => setCopied((c) => (c === serial ? null : c)), 1200)
      },
      () => {},
    )
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-card border-[0.5px] border-card-border bg-surface shadow-drawer animate-[slideIn_240ms_ease]">
      {/* .dcu-detail-header */}
      <header className="flex min-h-[54px] shrink-0 items-center justify-start gap-2.5 px-4 py-2.5">
        <button
          onClick={backToL2}
          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[#F5EFF1] hover:text-[#B83257]"
          style={{ color: '#7B7074' }}
          title="返回縣市層"
          aria-label="返回上一層"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <strong className="whitespace-nowrap text-[18px] font-extrabold leading-[1.2] text-ink">DCU詳情</strong>
          <span className="whitespace-nowrap text-[13px]" style={{ color: '#9A8C91' }}>
            {region.name}
          </span>
          <span className="whitespace-nowrap text-[13px]" style={{ color: '#9A8C91' }}>
            共{rows.length}台
          </span>
        </div>
      </header>

      {/* .dcu-detail-table */}
      <div
        className="min-h-0 flex-1 overflow-auto border-t"
        style={{ borderColor: '#EADFE1', overscrollBehavior: 'contain' }}
      >
        <table className="w-full min-w-[540px] border-collapse text-[12px]" style={{ color: '#3A3336' }}>
          <thead className="sticky top-0 z-10" style={{ background: '#F4F1F2', color: '#6F6267' }}>
            <tr>
              <SortHead label="DCU 序號" col="serial" {...{ sortKey, sortDir, toggleSort }} align="left" />
              <SortHead label="LP 狀態" col="status" {...{ sortKey, sortDir, toggleSort }} align="left" />
              <SortHead label="電表總數" col="meterTotal" {...{ sortKey, sortDir, toggleSort }} align="right" />
              <SortHead label="連線數" col="connected" {...{ sortKey, sortDir, toggleSort }} align="right" />
              <SortHead label="LP 讀表數" col="read" {...{ sortKey, sortDir, toggleSort }} align="right" />
              <SortHead label="連線率" col="connectRate" {...{ sortKey, sortDir, toggleSort }} align="right" />
              <SortHead label="LP 讀表率" col="lpRate" {...{ sortKey, sortDir, toggleSort }} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.serial}
                className="border-b hover:bg-inset/60 [&>td+td]:border-l [&>td]:h-[39px] [&>td]:px-1.5"
                style={{ borderColor: '#EEE6E8' }}
              >
                <td className="!px-3">
                  <button
                    onClick={() => copySerial(d.serial)}
                    className="group inline-flex items-center gap-1.5 font-mono hover:text-[#B83257]"
                    title="點選複製 DCU 序號"
                  >
                    {d.serial}
                    {copied === d.serial ? (
                      <Check size={13} className="text-normal" />
                    ) : (
                      <Copy size={13} className="text-ink-mut opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                </td>
                <td>
                  <StatusPill status={lpStatus(d.lpRate)} />
                </td>
                <td className="text-right tabular-nums">{fmtInt(d.meterTotal)}</td>
                <td className="text-right tabular-nums">{fmtInt(d.connected)}</td>
                <td className="text-right tabular-nums">{fmtInt(d.read)}</td>
                <td className="text-right tabular-nums">{d.connectRate.toFixed(2)}%</td>
                <td
                  className={`text-right tabular-nums ${d.lpRate < THRESHOLDS.lp.warn ? 'font-bold' : ''}`}
                  style={{ color: rateColor(d.lpRate) }}
                >
                  {d.lpRate.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** LP讀表率 turns red below the 告警 cut — 前端 `.is-danger-text` */
function rateColor(lpRate: number) {
  return lpRate < THRESHOLDS.lp.warn ? healthTok.alert.accent : '#3A3336'
}

function SortHead({
  label,
  col,
  sortKey,
  sortDir,
  toggleSort,
  align,
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  toggleSort: (k: SortKey) => void
  align: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <th
      className={`h-[42px] border-l px-1.5 text-[11px] font-bold first:border-l-0 first:px-3 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      style={{ borderColor: '#F0E9EB' }}
    >
      <button
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 hover:text-[#B83257] ${align === 'right' ? 'flex-row-reverse' : ''} ${
          active ? 'text-[#B83257]' : ''
        }`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <span className="w-3" />
        )}
      </button>
    </th>
  )
}

/** .status-pill — 前端 DCU 明細用的狀態標籤（底色 + 前置圓點，文字一律深灰） */
function StatusPill({ status }: { status: Health }) {
  const map: Record<Health, { bg: string; dot: string; label: string }> = {
    good: { bg: '#EEF8EE', dot: healthTok.good.accent, label: '正常' },
    warning: { bg: '#FFF7DF', dot: healthTok.warning.accent, label: '注意' },
    alert: { bg: '#FFEBED', dot: healthTok.alert.accent, label: '警告' },
  }
  const s = map[status]
  return (
    <i
      className="inline-flex min-w-[34px] items-center justify-center gap-1.5 rounded-md px-2 py-[5px] text-[11px] font-extrabold not-italic leading-none"
      style={{ background: s.bg, color: '#303039' }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </i>
  )
}
