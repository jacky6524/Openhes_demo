import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Settings, ClipboardList, ArrowRight, Calendar, Ban } from 'lucide-react'
import { metersForDcu, type DcuMeterRow } from '@/data/dcuMeters'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import { FeatureNotice } from '@/components/shared/FeatureNotice'
import { isSameDay, dcuById } from '@/data/dcuFleet'
import { dcuInfo } from '@/data/dcuInfo'
import { dcuConnRows, dcuEventRows, LOG_RANGE } from '@/data/dcuLogs'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterTransferPanel } from '@/components/dcu/MeterTransferPanel'
import type { DcuStatus } from '@/data/dcuList'
import {
  Th,
  StatusPill,
  SortHead,
  FilterHead,
  SearchHead,
  MenuItem,
  type SortDir,
} from '@/components/table/tableBits'
import { PillTabs, SCROLL_BOX, STICKY_TH, UnderlineTabs, useInfiniteRows, type TabItem } from '@/components/shared/Tabs'
import { useNav } from '@/store/useNav'
import { status as statusTok } from '@/tokens'

/** 資料類型 —— 原本是下拉選單，2026-08 依業主意見改為頁籤 */
type TabKey = 'meter' | 'conn' | 'event' | 'dcu' | 'transfer'
const TABS: readonly TabItem<TabKey>[] = [
  { key: 'meter', label: '電表資料' },
  { key: 'conn', label: '連線資料' },
  { key: 'event', label: '事件資料' },
  { key: 'dcu', label: 'DCU詳細資料' },
  /* 2026-09-07 轉移電表從「DCU裝置設定」移到這裡。
     2026-09-29 業主意見：這個功能其實該做在電表資料（使用者是一邊看電表一邊移轉），
     目前暫緩 → 移到最右邊、加禁止符號；仍可點開瀏覽，頁面上方說明暫不啟用、操作停用
     （FeatureNotice）。要恢復：拿掉 inactive，並把下方 transfer 分頁的 FeatureNotice 去掉 */
  { key: 'transfer', label: '轉移電表', inactive: true, hint: '暫不啟用：之後改做在電表資料頁' },
]

/**
 * 電表資料的子頁籤 —— 2026-09-03 依業主意見移除「白名單內停用電表」，
 * 停用電表併回白名單頁籤、靠排序帶到後面即可，不另設篩選。
 * 「名單外電表」＝白名單應屬別台、實際連進本台，因此加註「他台連入」。
 */
const METER_GROUPS = [
  { key: 'white', label: '白名單電表' },
  { key: 'outside', label: '名單外電表（他台連入）' },
] as const
type GroupKey = (typeof METER_GROUPS)[number]['key']

type SortKey = 'lastLp' | 'lastMn'
type StatusFilter = 'all' | DcuStatus

/**
 * 裝置管理 · DCU 詳細資料 (Figma 2934:58398) — the meter list under one DCU.
 * 內容抽成 DcuDetailContent，供整頁（裝置列表進入）與彈窗（DCU總覽進入，
 * 與電表詳細資料同一種彈窗模式）共用。
 */
export function DcuDetail() {
  const model = useNav((s) => s.dcuModel) ?? 'AE1092D0000'
  const setView = useNav((s) => s.setView)
  const from = useNav((s) => s.dcuDetailFrom) // 從哪一頁進來就返回哪一頁

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1400px]">
      {/* header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView(from)}
          className="grid place-items-center h-8 w-8 rounded-lg text-ink-sub hover:bg-inset hover:text-ink"
          title={from === 'warroom' ? '返回 DCU總覽' : '返回 DCU 裝置列表'}
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-[16px] font-semibold text-ink">DCU詳細資料</h2>
      </div>
      <DcuDetailContent model={model} />
    </div>
  )
}

/** DCU 詳細資料內容（裝置 + 資料類型頁籤 + 各分頁）；頁面與彈窗共用 */
export function DcuDetailContent({ model }: { model: string }) {
  const [tab, setTab] = useState<TabKey>('meter')

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">裝置</span>
        <span className="text-[22px] font-bold tracking-tight text-ink font-mono">{model}</span>
      </div>

      <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'meter' && <MeterListPanel model={model} />}
      {tab === 'conn' && <ConnPanel model={model} />}
      {tab === 'event' && <EventPanel model={model} />}
      {tab === 'dcu' && <DcuInfoPanel model={model} />}
      {tab === 'transfer' && (
        <FeatureNotice text="轉移電表之後將改做在電表資料頁（可一邊觀察電表一邊移轉），此處畫面僅供瀏覽，無法執行轉移。">
          <MeterTransferPanel model={model} />
        </FeatureNotice>
      )}
    </>
  )
}

/* ------------------------------------------------------------ 電表資料 */

function MeterListPanel({ model }: { model: string }) {
  const [group, setGroup] = useState<GroupKey>('white')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState({ elecNo: '', meterNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'elecNo' | 'meterNo'>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [settingsMeter, setSettingsMeter] = useState<DcuMeterRow | null>(null)

  const all = useMemo(() => metersForDcu(model), [model])

  const filtered = useMemo(() => {
    let rows = all.filter((r) => {
      const inGroup = group === 'outside' ? r.whitelist === 'out' : r.whitelist === 'in'
      return (
        inGroup &&
        (statusFilter === 'all' || r.status === statusFilter) &&
        r.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()) &&
        r.meterNo.toLowerCase().includes(q.meterNo.trim().toLowerCase())
      )
    })
    // 停用電表一律排在最後（不另設篩選頁籤，靠排序區隔）
    rows = [...rows].sort((a, b) => {
      const byDisabled = (a.disabled === 'Y' ? 1 : 0) - (b.disabled === 'Y' ? 1 : 0)
      if (byDisabled !== 0) return byDisabled
      if (!sortKey) return 0
      // 分鐘數越小＝越新，排序以時間先後為準而非字串
      const d = sortKey === 'lastLp' ? b.lastLpMins - a.lastLpMins : b.lastMnMins - a.lastMnMins
      return sortDir === 'asc' ? d : -d
    })
    return rows
  }, [all, group, statusFilter, q, sortKey, sortDir])

  const { visible, onScroll, reset } = useInfiniteRows(filtered.length)
  // 換分頁籤／改篩選條件時回到第一批
  useEffect(reset, [group, statusFilter, q, sortKey, sortDir, reset])

  const rows = filtered.slice(0, visible)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const setSearch = (k: keyof typeof q, v: string) => setQ((s) => ({ ...s, [k]: v }))

  /** 最後 LP／MN 時間：非當日標紅 */
  const stale = (mins: number) => (isSameDay(mins) ? undefined : statusTok.danger.fg)

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <PillTabs tabs={METER_GROUPS} value={group} onChange={setGroup} />
        <span className="text-[12px] text-ink-mut tabular-nums">
          共 {filtered.length} 筆{visible < filtered.length && `（已載入 ${visible}）`}
        </span>
      </div>

      <div className="rounded-card bg-surface border border-border shadow-card p-4">
        <div className={`${SCROLL_BOX} max-h-[calc(100vh-360px)]`} onScroll={onScroll}>
          <table className="w-full min-w-[1120px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                <Th className={`${STICKY_TH} !z-20`}>
                  <FilterHead label="連線狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
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
                <Th className={`${STICKY_TH} !z-20`}>
                  <SearchHead
                    label="電號"
                    value={q.elecNo}
                    open={menu === 'elecNo'}
                    onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')}
                    onChange={(v) => setSearch('elecNo', v)}
                  />
                </Th>
                <Th className={`${STICKY_TH} !z-20`}>
                  <SearchHead
                    label="表號"
                    value={q.meterNo}
                    open={menu === 'meterNo'}
                    onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')}
                    onChange={(v) => setSearch('meterNo', v)}
                  />
                </Th>
                <Th className={STICKY_TH}>狀態</Th>
                <Th className={STICKY_TH}>地址</Th>
                <Th className={STICKY_TH}>
                  <SortHead label="最後LP時間" active={sortKey === 'lastLp'} dir={sortDir} onClick={() => toggleSort('lastLp')} />
                </Th>
                <Th className={STICKY_TH}>
                  <SortHead label="最後MN時間" active={sortKey === 'lastMn'} dir={sortDir} onClick={() => toggleSort('lastMn')} />
                </Th>
                <Th className={`${STICKY_TH} w-[140px]`} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.meterNo}-${i}`} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub">{r.elecNo}</td>
                  <td className="px-3 py-2.5 font-mono text-ink">{r.meterNo}</td>
                  {/* 狀態欄（2026-09-23 業主意見：原「停用」欄改名，內容一律寫明 啟用／停用）；停用電表本身排在最後。
                      2026-09-29 業主意見：啟用／停用不區分顏色，同一個中性樣式 */}
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-inset px-1.5 py-0.5 text-[11.5px] text-ink-sub">
                      {r.disabled === 'Y' ? '停用' : '啟用'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-sub whitespace-nowrap">{r.address}</td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: stale(r.lastLpMins) }}>
                    {r.lastLp}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: stale(r.lastMnMins) }}>
                    {r.lastMn}
                  </td>
                  <td className="px-3 py-2.5">
                    {/* 依業主意見只保留 詳細資料（小書本）與 裝置設定（齒輪）。
                        2026-09-29 業主意見：齒輪內的功能在這裡暫不啟用 → 齒輪疊禁止符號，
                        仍可點開瀏覽，彈窗上方說明暫不啟用、所有操作停用 */}
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailMeter(r.meterNo)} title="詳細資料" className="text-ink-mut hover:text-brand">
                        <ClipboardList size={15} />
                      </button>
                      <button onClick={() => setSettingsMeter(r)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                        <Settings size={15} />
                        <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-ink-mut">
                    查無符合條件的資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      </div>

      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {settingsMeter && (
        <MeterSettingsModal meter={settingsMeter} onClose={() => setSettingsMeter(null)} inactiveNotice="DCU詳細資料中的電表裝置設定暫無功能，畫面僅供瀏覽，無法修改或執行操作。" />
      )}
    </>
  )
}


/* ------------------------------------------------------------ 連線資料 */

/**
 * 資料時間區間 —— 與電表詳細資料同一種呈現（唯讀顯示 ＋ 單次查詢上限）。
 * Figma 上另有「搜尋」鈕，demo 沒有真的查詢動作，因此只保留區間本身。
 */
function LogHeader({ total, visible }: { total: number; visible: number }) {
  return (
    <div className="flex items-end gap-4 flex-wrap">
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-ink-mut">資料時間</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink">
            <span className="tabular-nums">{LOG_RANGE.from}</span>
            <ArrowRight size={14} className="text-ink-mut" />
            <span className="tabular-nums">{LOG_RANGE.to}</span>
            <Calendar size={15} className="text-ink-mut ml-1" />
          </div>
          <span className="text-[12px] text-ink-mut whitespace-nowrap">單次查詢上限 {LOG_RANGE.days} 天</span>
        </div>
      </div>
      <span className="flex-1" />
      <span className="text-[12px] text-ink-mut tabular-nums">
        共 {total} 筆{visible < total && `（已載入 ${visible}）`}
      </span>
    </div>
  )
}

type ConnFilter = 'all' | 'online' | 'offline'

/** 連線資料 (Figma 3639:25566) —— 資料時間 / 連線狀態 / Cell ID / 連線回報數 */
function ConnPanel({ model }: { model: string }) {
  const [statusFilter, setStatusFilter] = useState<ConnFilter>('all')
  const [menu, setMenu] = useState(false)
  // 預設由新到舊
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const all = useMemo(() => dcuConnRows(model), [model])
  const rows = useMemo(() => {
    const list = all.filter((r) => statusFilter === 'all' || (statusFilter === 'online') === r.online)
    // 資料時間字串本身可比大小（YYYY-MM-DD HH:mm:ss）
    return [...list].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a.dataTime.localeCompare(b.dataTime))
  }, [all, statusFilter, sortDir])

  const { visible, onScroll, reset } = useInfiniteRows(rows.length)
  useEffect(reset, [statusFilter, sortDir, reset])
  const page = rows.slice(0, visible)

  return (
    <>
      <LogHeader total={rows.length} visible={visible} />

      <div className="rounded-card bg-surface border border-border shadow-card p-4">
        <div className={`${SCROLL_BOX} max-h-[calc(100vh-380px)]`} onScroll={onScroll}>
          <table className="w-full min-w-[880px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                <Th className={`${STICKY_TH} w-[28%]`}>
                  <SortHead label="資料時間" active dir={sortDir} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
                </Th>
                <Th className={`${STICKY_TH} !z-20 w-[24%]`}>
                  <FilterHead label="連線狀態" open={menu} onToggle={() => setMenu(!menu)}>
                    {(['all', 'online', 'offline'] as ConnFilter[]).map((f) => (
                      <MenuItem key={f} active={statusFilter === f} onClick={() => { setStatusFilter(f); setMenu(false) }}>
                        {f === 'all' ? '全部' : f === 'online' ? '連線' : '斷線'}
                      </MenuItem>
                    ))}
                  </FilterHead>
                </Th>
                <Th className={`${STICKY_TH} w-[24%]`}>Cell ID</Th>
                <Th className={STICKY_TH}>連線回報數</Th>
              </tr>
            </thead>
            <tbody>
              {page.map((r, i) => (
                <tr key={`${r.dataTime}-${i}`} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-ink">{r.dataTime}</td>
                  <td className="px-3 py-2.5"><StatusPill status={r.online ? 'online' : 'offline'} /></td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub">{r.cellId}</td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-sub">{r.reportCount}</td>
                </tr>
              ))}
              {page.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">查無符合條件的資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />}
      </div>
    </>
  )
}

/* ------------------------------------------------------------ 事件資料 */

/**
 * 事件資料 (Figma 3639:24343) —— rindex / 資料時間 / HES接收時間 / 事件碼 / 說明。
 * 2026-11-04 業主意見：事件是一筆一筆接收的，**不提供排序**，固定依接收順序列出（最新在上、rindex 遞減）。
 */
function EventPanel({ model }: { model: string }) {
  const rows = useMemo(() => dcuEventRows(model), [model])
  const { visible, onScroll, reset } = useInfiniteRows(rows.length)
  useEffect(reset, [model, reset])
  const page = rows.slice(0, visible)
  const head = (label: string, cls = '') => <Th className={`${STICKY_TH} ${cls}`}>{label}</Th>

  return (
    <>
      <LogHeader total={rows.length} visible={visible} />

      <div className="rounded-card bg-surface border border-border shadow-card p-4">
        <div className={`${SCROLL_BOX} max-h-[calc(100vh-380px)]`} onScroll={onScroll}>
          <table className="w-full min-w-[980px] text-[13px] border-collapse">
            <thead>
              <tr className="text-ink-sub">
                {head('rindex', 'w-[10%]')}
                {head('資料時間', 'w-[22%]')}
                {head('HES接收時間', 'w-[22%]')}
                <Th className={`${STICKY_TH} w-[14%]`}>事件碼</Th>
                <Th className={STICKY_TH}>說明</Th>
              </tr>
            </thead>
            <tbody>
              {page.map((r, i) => (
                <tr key={`${r.rindex}-${i}`} className="border-b border-divider hover:bg-inset/40">
                  <td className="px-3 py-2.5 tabular-nums text-ink-sub">{r.rindex}</td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-ink">{r.dataTime}</td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-ink-sub">{r.hesTime}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-sub">{r.code}</td>
                  <td className="px-3 py-2.5 text-ink-sub">{r.desc}</td>
                </tr>
              ))}
              {page.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-mut">查無符合條件的資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------- DCU詳細資料 */

/** 與列表上驚嘆號按鈕（DcuInfoDrawer）呈現同一份 DCU 屬性，這裡改成內嵌版面 */
function DcuInfoPanel({ model }: { model: string }) {
  const extra = useMemo(() => dcuInfo(model), [model])
  const deviceModel = dcuById.get(model)?.model ?? ''

  const rows: [string, string][] = [
    ['台電區處代碼', extra.taipowerCode],
    ['DCU編號', model],
    ['訊號強度', String(extra.signal)],
    ['IP', extra.ip],
    ['IMSI', extra.imsi],
    ['Cell ID', extra.cellId],
    ['頻道組別／模式', extra.channelMode],
    ['台電圖號座標', extra.taipowerCoord],
    ['經緯度', extra.latlng],
    ['地址', extra.address],
    ['位置類型', extra.locationType],
    ['DCU引電類型', extra.powerType],
    ['連線類型', extra.connType],
    ['韌體版本', extra.firmware],
  ]

  return (
    <div className="rounded-card bg-surface border border-border shadow-card p-4">
      <div className="mb-4">
        <div className="text-[12px] text-ink-mut mb-0.5">DCU序號</div>
        <div className="text-[20px] font-bold font-mono" style={{ color: statusTok.danger.fg }}>
          {deviceModel ? `${model}（${deviceModel}）` : model}
        </div>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 py-2 border-b border-divider">
            <dt className="w-[128px] shrink-0 text-[12px] text-ink-sub">{label}</dt>
            <dd className="flex-1 text-[13px] text-ink break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

