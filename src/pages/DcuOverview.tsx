import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Check, ClipboardList, Info, Settings, Ban, Download, MapPinOff } from 'lucide-react'
import { DEVICES, DEVICE_KINDS, devMeters, type DeviceKind, type DeviceRow } from '@/data/deviceList'
import type { DcuRow, DcuStatus } from '@/data/dcuList'
import { DeviceListMap } from '@/components/map/DeviceListMap'
import { DcuMeterPanel } from '@/components/dcu/DcuMeterPanel'
import { DcuInfoDrawer } from '@/components/dcu/DcuInfoDrawer'
import { DcuSettingsModal } from '@/components/dcu/DcuSettingsModal'
import { PillTabs } from '@/components/shared/PillTabs'
import { PageTitle } from '@/components/shared/PageTitle'
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
  PercentBadge,
  GREEN,
  RED,
  type SortDir,
} from '@/components/table/tableBits'
import { useNav } from '@/store/useNav'
import { fmtInt } from '@/lib/format'
import { status as statusTok } from '@/tokens'
import { useThresholds } from '@/config/statusThresholds'

/**
 * 燈號門檻（GET /overview/status-thresholds；可在「權限管理 › 參數調整」修改，改了即時生效）：
 * 上線率看 meterConnectivity、讀表率看 lpRate（讀表數＝過去 60 分鐘有 LP）
 */
function useRateThresholds() {
  const v = useThresholds((s) => s.values)
  return { ON_T: v.meterConnectivity, READ_T: v.lpRate }
}

const UPDATE_TIME = '2025/01/01 15:00'

/**
 * 裝置管理 · 裝置列表（Figma 2934:57458；2026-11-04 依《OpenHES_裝置列表_UIUX欄位規格.md》補齊）。
 *
 *   標題＋更新時間
 *   DCU／LTE／NB-IoT 主分頁（規格 5.1）
 *   街道地圖：目前分頁的裝置點；選了裝置才畫它的電表點
 *   裝置清單 ── 點列 → 右側滑出所屬電表清單（沿用原本的左右分割，不做「裝置／電表」次分頁）
 *
 * 地圖 ↔ 清單同步（規格第 11 節）：
 *   點清單列＝選取並移動地圖；點地圖裝置點＝選取、該列排到最上方；滑過任一邊＝另一邊同步 highlight；
 *   點電表列＝地圖移到該電表；點地圖電表點＝該列排到最上方並選取；換裝置就清掉舊的電表點；
 *   沒有座標的裝置／電表點了不移動地圖，改在地圖上方提示「無法定位」。
 * 欄位：DCU＝狀態／DCU 序號／DCU 編號／上線數・總數／上線率／讀表數／讀表率／操作；
 *       LTE・NB-IoT＝Cell ID／上線／總數／上線率／讀表數／讀表率／下載。
 *   規格建議把兩個「百分比」改名為上線率、讀表率，表頭 hover 說明計算口徑（規格第 14 節）。
 * 分頁仍是無限捲動（業主不要頁碼，規格寫的是頁碼）。
 */
const TABS = DEVICE_KINDS.map((k) => ({ key: k, label: k }))

export function DcuOverview() {
  const [kind, setKind] = useState<DeviceKind>('DCU')
  const devices = DEVICES[kind]
  const [selected, setSelected] = useState<string | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null) // 收合動畫期間保留面板內容
  const [hover, setHover] = useState<string | null>(null)
  const [pinnedDev, setPinnedDev] = useState<string | null>(null)
  const [meterId, setMeterId] = useState<string | null>(null)
  const [pinnedMeter, setPinnedMeter] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const panelDev = devices.find((d) => d.id === panelId) ?? null
  const selDev = devices.find((d) => d.id === selected) ?? null
  const meters = useMemo(() => (selDev ? devMeters(selDev) : []), [selDev])

  const noticeTimer = useRef<number>()
  const warn = (msg: string) => {
    setNotice(msg)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3000)
  }

  const clearMeter = () => { setMeterId(null); setPinnedMeter(null) }
  const close = () => { setSelected(null); clearMeter() }
  /** fromMap：從地圖點的 → 清單把該列排到最上方 */
  const select = (id: string, fromMap = false) => {
    if (selected === id && !fromMap) { close(); return } // 再點一次同一列＝收合
    const d = devices.find((x) => x.id === id)
    if (d && d.lng === null) warn(`${d.kind} ${d.id} 沒有座標，無法在地圖定位`)
    setPanelId(id)
    setSelected(id)
    setPinnedDev(fromMap ? id : null)
    clearMeter()
  }
  const pickMeter = (meterNo: string, fromMap = false) => {
    const m = meters.find((x) => x.meterNo === meterNo)
    if (m && m.lng === null) warn(`電表 ${meterNo} 沒有座標，無法在地圖定位`)
    setMeterId(meterNo)
    setPinnedMeter(fromMap ? meterNo : null)
  }
  const switchKind = (k: DeviceKind) => {
    setKind(k)
    setSelected(null)
    setPanelId(null)
    setHover(null)
    setPinnedDev(null)
    clearMeter()
  }

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1100px]">
      <div className="flex items-center justify-between">
        <PageTitle title="裝置列表" />
        <span className="text-[12px] text-ink-mut">更新時間 {UPDATE_TIME}</span>
      </div>
      <PillTabs tabs={TABS} value={kind} onChange={switchKind} />

      {/* 地圖 */}
      <div className="relative h-[320px] overflow-hidden rounded-card border border-border bg-inset/40 shadow-card">
        <DeviceListMap
          kind={kind}
          devices={devices}
          meters={meters}
          selectedId={selected}
          hoverId={hover}
          meterId={meterId}
          onSelect={(id) => select(id, true)}
          onHover={setHover}
          onPickMeter={(no) => pickMeter(no, true)}
        />
        <MapLegend kind={kind} withMeters={meters.length > 0} />
        {notice && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-ink shadow-card">
            <MapPinOff size={14} className="text-ink-mut" />{notice}
          </div>
        )}
      </div>

      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: selected ? '1fr 1fr' : '1fr 0fr',
          columnGap: selected ? 12 : 0,
          transition: 'grid-template-columns 320ms ease, column-gap 320ms ease',
        }}
      >
        {/* key：換分頁就重置清單的篩選與排序 */}
        <DeviceTable key={kind} kind={kind} rows={devices} selected={selected} hover={hover} pinned={pinnedDev} onSelect={select} onHover={setHover} />
        <div
          className="min-w-0 overflow-hidden"
          style={{ opacity: selected ? 1 : 0, transition: 'opacity 240ms ease' }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && !selected) setPanelId(null)
          }}
        >
          {panelDev && (
            <DcuMeterPanel
              key={panelDev.id}
              device={panelDev}
              meters={selDev ? meters : devMeters(panelDev)}
              pickedMeter={meterId}
              pinned={pinnedMeter}
              onPickMeter={(no) => pickMeter(no)}
              onClose={close}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- map legend ------------------------------- */

function MapLegend({ kind, withMeters }: { kind: DeviceKind; withMeters: boolean }) {
  const { ON_T } = useRateThresholds()
  const items =
    kind === 'DCU'
      ? [{ label: 'DCU 連線', color: GREEN }, { label: 'DCU 斷線', color: RED }]
      : [
          { label: `${kind} 上線率 ≥${ON_T.good}%`, color: GREEN },
          { label: `${ON_T.warning}–${ON_T.good}%`, color: statusTok.warning.fg },
          { label: `＜${ON_T.warning}%`, color: RED },
        ]
  return (
    <div className="absolute bottom-3 left-4 z-10 flex items-center gap-4 rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-[12px] text-ink-sub shadow-card backdrop-blur">
      {items.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border-2 border-white" style={{ background: l.color, boxShadow: '0 0 0 1px #D1D5DB' }} />{l.label}
        </span>
      ))}
      {withMeters && (
        <>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: GREEN }} />電表連線</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: RED }} />電表斷線</span>
        </>
      )}
    </div>
  )
}

/* --------------------------------- table --------------------------------- */

type SortKey = 'id' | 'online' | 'total' | 'onlinePct' | 'read' | 'readPct'
type StatusFilter = 'all' | DcuStatus

function DeviceTable({
  kind, rows, selected, hover, pinned, onSelect, onHover,
}: {
  kind: DeviceKind
  rows: DeviceRow[]
  selected: string | null
  hover: string | null
  pinned: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const isDcu = kind === 'DCU'
  const { ON_T, READ_T } = useRateThresholds()
  const ONLINE_HINT = `上線率＝上線數 ÷ 總數；≥${ON_T.good}% 良好、${ON_T.warning}–${ON_T.good}% 注意、＜${ON_T.warning}% 警告`
  const READ_HINT = `讀表率＝讀表數（過去 60 分鐘有 LP）÷ 總數；≥${READ_T.good}% 良好、${READ_T.warning}–${READ_T.good}% 注意、＜${READ_T.warning}% 警告`
  const openDcuDetail = useNav((s) => s.openDcuDetail)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [numberQ, setNumberQ] = useState('')
  const [menu, setMenu] = useState<null | 'status' | 'number'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [infoDcu, setInfoDcu] = useState<DcuRow | null>(null)
  const [settingsDcu, setSettingsDcu] = useState<DcuRow | null>(null)

  const filtered = useMemo(() => {
    let list = rows.filter(
      (d) =>
        (statusFilter === 'all' || d.status === statusFilter) &&
        (d.dcuNumber ?? '').toLowerCase().includes(numberQ.trim().toLowerCase()),
    )
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const c = sortKey === 'id' ? a.id.localeCompare(b.id) : a[sortKey] - b[sortKey]
        return sortDir === 'asc' ? c : -c
      })
    }
    if (pinned) {
      const i = list.findIndex((d) => d.id === pinned)
      if (i > 0) list = [list[i], ...list.slice(0, i), ...list.slice(i + 1)]
    }
    return list
  }, [rows, statusFilter, numberQ, sortKey, sortDir, pinned])

  // 無限捲動（業主不要頁碼）：篩選、排序、地圖釘選變動回到第一批
  const { visible, sentinelRef, hasMore } = useInfiniteRows(filtered.length, [statusFilter, numberQ, sortKey, sortDir, pinned], 10)
  const pageRows = filtered.slice(0, visible)
  useEffect(() => { if (pinned) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [pinned])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const sortTh = (key: SortKey, label: string, hint?: string) => {
    const head = <SortHead label={label} active={sortKey === key} dir={sortDir} onClick={() => toggleSort(key)} />
    return <Th className="sticky top-0 z-10 bg-inset">{hint ? <HeadHint hint={hint}>{head}</HeadHint> : head}</Th>
  }
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(t)
      window.setTimeout(() => setCopied((c) => (c === t ? null : c)), 1200)
    }, () => {})
  }
  /** LTE／NB-IoT：下載該 Cell ID 的所屬電表清單（demo 直接產 CSV） */
  const download = (d: DeviceRow) => {
    const csv = [
      '表號,電號,FAN ID,狀態,RSRP (dBm),更新時間',
      ...devMeters(d).map((m) => [m.meterNo, m.elecNo, m.fanMac.slice(0, 14), m.status === 'online' ? '連線' : '斷線', m.sig ?? '-', m.lastLp].join(',')),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${d.kind}-${d.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const colSpan = isDcu ? 8 : 7

  return (
    <div className="rounded-card bg-surface border border-border shadow-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        {/* 標題 hover 說明統計口徑（2026-09-03 業主意見） */}
        <div className="group relative">
          <h3 className="text-[15px] font-semibold text-ink cursor-default border-b border-dashed border-border-strong">
            {isDcu ? 'DCU 列表' : `${kind} Cell 列表`}
          </h3>
          <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-[248px] translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
              <div className="border-b border-divider bg-inset/50 px-3 py-1.5 text-[11px] font-semibold text-ink-sub">
                統計口徑
              </div>
              <div className="px-3 py-2 text-[11.5px] leading-snug text-ink-sub">
                本列表統計<b className="text-ink">以白名單為主</b>，且<b className="text-ink">不包含停用電表</b>。
              </div>
            </div>
          </div>
        </div>
        {/* 上線率／讀表率色階圖例（門檻值讀燈號門檻 API，兩者目前相同） */}
        <div className="flex items-center gap-3 text-[12px] text-ink-sub">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />＜{READ_T.warning}%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: statusTok.warning.fg }} />{READ_T.warning}–{READ_T.good}%
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[calc(100vh-560px)] min-h-[240px] overflow-auto rounded-lg border border-border">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-ink-sub border-b border-border">
            {isDcu ? (
              <>
                <Th className="sticky top-0 z-10 bg-inset">
                  <FilterHead label="狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                    {(['all', 'online', 'offline'] as StatusFilter[]).map((s) => (
                      <MenuItem key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setMenu(null) }}>
                        {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                      </MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                {sortTh('id', 'DCU 序號')}
                <Th className="sticky top-0 z-10 bg-inset">
                  <SearchHead label="DCU 編號" value={numberQ} open={menu === 'number'} onToggle={() => setMenu(menu === 'number' ? null : 'number')} onChange={setNumberQ} />
                </Th>
                <Th className="sticky top-0 z-10 bg-inset">上線數 / 總數</Th>
              </>
            ) : (
              <>
                {sortTh('id', 'Cell ID')}
                {sortTh('online', '上線')}
                {sortTh('total', '總數')}
              </>
            )}
            {sortTh('onlinePct', '上線率', ONLINE_HINT)}
            {sortTh('read', '讀表數')}
            {sortTh('readPct', '讀表率', READ_HINT)}
            <Th className={`sticky top-0 z-10 bg-inset ${isDcu ? 'w-[150px]' : 'w-[56px]'}`} />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((d) => {
            const sel = selected === d.id
            const hl = hover === d.id
            return (
              <tr
                key={d.id}
                onClick={() => onSelect(d.id)}
                onMouseEnter={() => onHover(d.id)}
                onMouseLeave={() => onHover(null)}
                title="檢視所屬電表，並在地圖定位"
                className={`border-b border-divider cursor-pointer transition-colors ${sel ? 'bg-brand-soft/60' : hl ? 'bg-inset/70' : 'hover:bg-inset/40'}`}
              >
                {isDcu ? (
                  <>
                    <td className="px-3 py-2.5"><StatusPill status={d.status!} /></td>
                    <td className="px-3 py-2.5">
                      <span className={`font-mono ${sel ? 'text-brand font-semibold' : 'text-ink'}`}>{d.id}</span>
                      {d.lng === null && <MapPinOff size={12} className="ml-1.5 inline text-ink-mut" aria-label="無座標" />}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ink">{d.dcuNumber}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-sub">{fmtInt(d.online)} / {fmtInt(d.total)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5">
                      <span className={`font-mono ${sel ? 'text-brand font-semibold' : 'text-ink'}`}>{d.id}</span>
                      {d.lng === null && <MapPinOff size={12} className="ml-1.5 inline text-ink-mut" aria-label="無座標" />}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ink">{fmtInt(d.online)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-sub">{fmtInt(d.total)}</td>
                  </>
                )}
                <td className="px-3 py-2.5"><PercentBadge percent={d.onlinePct} good={ON_T.good} warn={ON_T.warning} /></td>
                <td className="px-3 py-2.5 tabular-nums text-ink">{fmtInt(d.read)}</td>
                <td className="px-3 py-2.5"><PercentBadge percent={d.readPct} good={READ_T.good} warn={READ_T.warning} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {isDcu && d.dcu ? (
                      <>
                        {d.dcu.alarms > 0 && (
                          <span className="grid place-items-center h-4 min-w-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold">{d.dcu.alarms}</span>
                        )}
                        <button onClick={() => copy(d.dcuNumber!)} title="複製 DCU 編號" className="text-ink-mut hover:text-brand">
                          {copied === d.dcuNumber ? <Check size={15} className="text-normal" /> : <Copy size={15} />}
                        </button>
                        <button onClick={() => openDcuDetail(d.id)} title="詳細資料" className="text-ink-mut hover:text-brand">
                          <ClipboardList size={15} />
                        </button>
                        <button onClick={() => setInfoDcu(d.dcu!)} title="DCU 資訊" className="text-ink-mut hover:text-brand">
                          <Info size={15} />
                        </button>
                        {/* 齒輪一律標暫不啟用（2026-10-01 業主意見）：疊禁止符號，仍可點開瀏覽 */}
                        <button onClick={() => setSettingsDcu(d.dcu!)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                          <Settings size={15} />
                          <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => download(d)} title="下載此 Cell ID 的電表清單" className="text-ink-mut hover:text-brand">
                        <Download size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-10 text-center text-ink-mut">查無符合條件的裝置</td>
            </tr>
          )}
        </tbody>
      </table>
      <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={pageRows.length} total={filtered.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />

      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}

      {infoDcu && <DcuInfoDrawer dcu={infoDcu} onClose={() => setInfoDcu(null)} />}
      {settingsDcu && <DcuSettingsModal dcu={settingsDcu} onClose={() => setSettingsDcu(null)} />}
    </div>
  )
}
