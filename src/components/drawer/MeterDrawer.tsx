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
    <div className="absolute inset-0 z-20 flex flex-col bg-surface rounded-card border border-border shadow-drawer animate-[slideIn_240ms_ease]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={backToL2}
            className="inline-flex items-center gap-1 shrink-0 text-[12px] text-ink-sub hover:text-brand px-2 py-1.5 rounded-lg hover:bg-inset"
            title="返回縣市層"
          >
            <ArrowLeft size={15} />返回
          </button>
          <div className="min-w-0">
            <div className="text-[11px] text-ink-mut">DCU 詳情</div>
            {/* 地名字體樣式比照「全台」層級字樣（hover 說明依會議決議移除） */}
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-ink">{region.name}</span>
              <span className="text-[12px] text-ink-sub">共 {rows.length} 台</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-inset/80 backdrop-blur text-ink-sub z-10">
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
              <tr key={d.serial} className="border-t border-divider hover:bg-inset/40">
                <td className="px-3 py-2">
                  <button
                    onClick={() => copySerial(d.serial)}
                    className="group inline-flex items-center gap-1.5 font-mono text-ink hover:text-brand"
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
                <td className="px-3 py-2">
                  <StatusPill status={lpStatus(d.lpRate)} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{fmtInt(d.meterTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{fmtInt(d.connected)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{fmtInt(d.read)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{d.connectRate.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: rateColor(d.lpRate) }}>
                  {d.lpRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** LP讀表率 turns red below the 告警 cut, matching the KPI-card rule (<95%) */
function rateColor(lpRate: number) {
  return lpRate < THRESHOLDS.lp.warn ? healthTok.alert.accent : '#2A2125'
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
    <th className={`font-medium px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 hover:text-ink ${align === 'right' ? 'flex-row-reverse' : ''} ${
          active ? 'text-ink font-semibold' : ''
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

function StatusPill({ status }: { status: Health }) {
  const map: Record<Health, { bg: string; fg: string; label: string }> = {
    good: { bg: '#E0F4ED', fg: healthTok.good.accent, label: '正常' },
    warning: { bg: '#FCEFD6', fg: healthTok.warning.accent, label: '注意' },
    alert: { bg: '#FBE0DF', fg: healthTok.alert.accent, label: '告警' },
  }
  const s = map[status]
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}
