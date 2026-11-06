import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Check, ClipboardList, Info, Network, Settings, Ban } from 'lucide-react'
import type { DeviceMeter, DeviceRow } from '@/data/deviceList'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterInfoDrawer } from '@/components/dcu/MeterInfoDrawer'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import type { DcuStatus } from '@/data/dcuList'
import {
  Th,
  StatusPill,
  SortHead,
  FilterHead,
  SearchHead,
  HeadHint,
  MenuItem,
  InfiniteFooter,
  useInfiniteRows,
  type SortDir,
} from '@/components/table/tableBits'

type SortKey = 'sig' | 'time'
type StatusFilter = 'all' | DcuStatus

/**
 * 所屬電表面板（Figma 2934:57879；規格第 9 節）—— 點裝置列後在清單右側展開，返回鍵收合。
 * DCU／LTE／NB-IoT 共用：
 *   · 標頭：類型＋裝置識別（DCU 序號或 Cell ID）＋上線數／總數；Topology 只有 DCU 有（規格 10.1）
 *   · 訊號欄：DCU 底下顯示 LQI；LTE／NB-IoT 顯示 RSRP (dBm)；表頭 hover 說明單位
 *   · 更新時間表頭 hover：「最後讀表更新時間」
 *   · 操作：複製表號／詳細資料／電表資訊／裝置設定（電表裝置設定一律暫不啟用，疊禁止符號、可點開瀏覽）
 *   · 點列＝地圖移到該電表；從地圖點電表時，該列排到最上方（pinned）
 */
export function DcuMeterPanel({
  device, meters, pickedMeter, pinned, onPickMeter, onClose,
}: {
  device: DeviceRow
  meters: DeviceMeter[]
  pickedMeter: string | null
  /** 從地圖點選的電表：排到第一列 */
  pinned: string | null
  onPickMeter: (meterNo: string) => void
  onClose: () => void
}) {
  const isDcu = device.kind === 'DCU'
  const online = meters.filter((m) => m.status === 'online').length

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState({ meterNo: '', elecNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'meterNo' | 'elecNo'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [infoMeter, setInfoMeter] = useState<DeviceMeter | null>(null)
  const [settingsMeter, setSettingsMeter] = useState<DeviceMeter | null>(null)

  const filtered = useMemo(() => {
    let rows = meters.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        r.meterNo.toLowerCase().includes(q.meterNo.trim().toLowerCase()) &&
        r.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()),
    )
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        // 斷線（無訊號）一律排最後，不論升降冪
        if (sortKey === 'sig' && (a.sig === null || b.sig === null)) return a.sig === null ? (b.sig === null ? 0 : 1) : -1
        const d = sortKey === 'sig' ? a.sig! - b.sig! : a.lastLp.localeCompare(b.lastLp)
        return sortDir === 'asc' ? d : -d
      })
    }
    if (pinned) {
      const i = rows.findIndex((r) => r.meterNo === pinned)
      if (i > 0) rows = [rows[i], ...rows.slice(0, i), ...rows.slice(i + 1)]
    }
    return rows
  }, [meters, statusFilter, q, sortKey, sortDir, pinned])

  // 無限捲動（業主不要頁碼）：換裝置、篩選或排序變動回到第一批
  const { visible, sentinelRef, hasMore } = useInfiniteRows(filtered.length, [device.id, statusFilter, q, sortKey, sortDir, pinned], 10)
  const pageRows = filtered.slice(0, visible)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(t)
      window.setTimeout(() => setCopied((c) => (c === t ? null : c)), 1200)
    }, () => {})
  }

  return (
    <div className="rounded-card bg-surface border border-border shadow-card p-4 min-w-0">
      {/* 清單標頭（規格 9.1）：類型、裝置識別、上線數、總數 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink shrink-0"
            title="關閉電表列表"
          >
            <ArrowLeft size={17} />
          </button>
          <h3 className="text-[15px] font-semibold text-ink truncate">
            電表 / {device.kind}: <span className="font-mono">{device.id}</span>
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-sub tabular-nums">
            上線數 <b className="text-ink">{online}</b> / 總數 <b className="text-ink">{meters.length}</b>
          </span>
          {isDcu && (
            <button
              title="拓撲圖"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand text-white px-3 py-1 text-[12px] font-medium hover:bg-brand-deep"
            >
              <Network size={13} />
              Topology
            </button>
          )}
        </div>
      </div>

      {/* table：自己捲、表頭釘住 */}
      <div ref={scrollRef} className="max-h-[calc(100vh-560px)] min-h-[240px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-ink-sub border-b border-border">
            <Th className="sticky top-0 z-10 bg-inset">
              <FilterHead label="狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                {(['all', 'online', 'offline'] as StatusFilter[]).map((s) => (
                  <MenuItem
                    key={s}
                    active={statusFilter === s}
                    onClick={() => {
                      setStatusFilter(s)
                      setMenu(null)
                    }}
                  >
                    {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                  </MenuItem>
                ))}
              </FilterHead>
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SearchHead
                label="表號"
                value={q.meterNo}
                open={menu === 'meterNo'}
                onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')}
                onChange={(v) => setQ((s) => ({ ...s, meterNo: v }))}
              />
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <SearchHead
                label="電號"
                value={q.elecNo}
                open={menu === 'elecNo'}
                onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')}
                onChange={(v) => setQ((s) => ({ ...s, elecNo: v }))}
              />
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">FAN ID</Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <HeadHint hint={isDcu ? 'LQI：RF 鏈路品質指標，數值越高越好（無單位）' : 'RSRP：參考訊號接收功率，單位 dBm，越接近 0 越好（約 −80 以上良好、−110 以下偏弱）'}>
                <SortHead label={isDcu ? 'LQI' : 'RSRP (dBm)'} active={sortKey === 'sig'} dir={sortDir} onClick={() => toggleSort('sig')} />
              </HeadHint>
            </Th>
            <Th className="sticky top-0 z-10 bg-inset">
              <HeadHint hint="最後讀表更新時間">
                <SortHead label="更新時間" active={sortKey === 'time'} dir={sortDir} onClick={() => toggleSort('time')} />
              </HeadHint>
            </Th>
            <Th className="sticky top-0 z-10 w-[120px] bg-inset" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r, i) => {
            const on = r.meterNo === pickedMeter
            return (
              <tr
                key={`${r.meterNo}-${i}`}
                onClick={() => onPickMeter(r.meterNo)}
                title={r.lng === null ? '此電表沒有座標，無法在地圖定位' : '在地圖上定位此電表'}
                className={`cursor-pointer border-b border-divider ${on ? 'bg-brand-soft/60' : 'hover:bg-inset/40'}`}
              >
                <td className="px-3 py-2.5">
                  <StatusPill status={r.status} />
                </td>
                <td className={`px-3 py-2.5 font-mono ${on ? 'font-semibold text-brand' : 'text-ink'}`}>{r.meterNo}</td>
                <td className="px-3 py-2.5 font-mono text-ink-sub">{r.elecNo}</td>
                <td className="px-3 py-2.5 font-mono text-ink-sub">{r.fanMac.slice(0, 14)}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink">{r.sig ?? '-'}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-sub whitespace-nowrap">{r.lastLp}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => copy(r.meterNo)} title="複製表號" className="text-ink-mut hover:text-brand">
                      {copied === r.meterNo ? <Check size={15} className="text-normal" /> : <Copy size={15} />}
                    </button>
                    <button onClick={() => setDetailMeter(r.meterNo)} title="詳細資料" className="text-ink-mut hover:text-brand">
                      <ClipboardList size={15} />
                    </button>
                    <button onClick={() => setInfoMeter(r)} title="電表資訊" className="text-ink-mut hover:text-brand">
                      <Info size={15} />
                    </button>
                    {/* 電表裝置設定一律暫不啟用（2026-10-01 業主意見）：疊禁止符號，仍可點開瀏覽 */}
                    <button onClick={() => setSettingsMeter(r)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                      <Settings size={15} />
                      <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-ink-mut">
                查無符合條件的電表
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={pageRows.length} total={filtered.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}

      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {infoMeter && <MeterInfoDrawer meter={infoMeter} onClose={() => setInfoMeter(null)} />}
      {settingsMeter && <MeterSettingsModal meter={settingsMeter} onClose={() => setSettingsMeter(null)} />}
    </div>
  )
}
