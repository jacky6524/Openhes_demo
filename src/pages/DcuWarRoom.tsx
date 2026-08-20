import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronRight, Crosshair, ArrowLeft, MousePointerClick, ClipboardList, Info, Settings, X } from 'lucide-react'
import {
  Th as BitTh, StatusPill, SortHead, FilterHead, SearchHead, MenuItem,
  useInfiniteRows, InfiniteFooter, RED, type SortDir,
} from '@/components/table/tableBits'
import { DcuInfoDrawer } from '@/components/dcu/DcuInfoDrawer'
import { DcuSettingsModal } from '@/components/dcu/DcuSettingsModal'
import { DcuDetailModal } from '@/components/dcu/DcuDetailModal'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import { meterRowOf, type DcuMeterRow } from '@/data/dcuMeters'
import type { DcuRow } from '@/data/dcuList'
import { DcuFaultMap } from '@/components/warroom/DcuFaultMap'
import { DcuRelationMap } from '@/components/warroom/DcuRelationMap'
import {
  SEVERITY_COLOR, SEVERITY_STROKE, SEVERITY_ACCENT, SEVERITY_LABEL, GROUP_COLORS, STATE_COLOR,
  FREQ_COLORS, MIS_COLOR, CLUSTER_RAMP,
} from '@/components/warroom/warroomConfig'
import { useWarroom, type DcuListFilter } from '@/store/useWarroom'
import {
  misassignedInScope, officeOf, isSameDay,
  metersOfDcu, cityStats, aggStat, dcusInScope, type Dcu, type Meter,
} from '@/data/dcuFleet'
import { dcuStat, misassignedOut, MIS_DIR_LABEL, type DcuStat, type MisDir } from '@/data/dcuMetrics'
import { fmtInt } from '@/lib/format'

/**
 * 裝置管理 · DCU 戰情室 —— 版式參考 Figma 3164-10362：
 *   左：DCU 監控地圖（880，全高）DCU斷線地圖 / 電表歸屬地圖 兩頁籤（內部 key 仍為 fault / relation）
 *   右：DCU狀態 KPI + 異常DCU（默認列出）+ 異常電表（點選 DCU 才展開）
 * 清單↔地圖連動（縮放定位）；選取行政區以填色高亮；案別由外層欄位篩選，此處不再重複。
 */
export function DcuWarRoom() {
  const tab = useWarroom((s) => s.tab)
  const level = useWarroom((s) => s.level)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  // 全台層級預設顯示縣市斷線分布；點 KPI 數字才切換成（全台範圍的）DCU 列表
  const dcuListOpen = useWarroom((s) => s.dcuListOpen)
  const listFilter = useWarroom((s) => s.listFilter)
  const showCityList = level === 'taiwan' && !dcuListOpen
  // 點「歸屬錯誤電表數」→ 右側整個換成歸屬錯誤電表清單（不是 DCU 篩選）
  const showMisOnly = listFilter === 'mis'
  return (
    <div className="h-full flex flex-col p-4 gap-3 min-w-[1320px]">
      <FilterBar />
      <div className="flex-1 min-h-0 grid grid-cols-[880fr_736fr] gap-3">
        {/* 外框與系統總覽的地圖模組一致：白卡片 + p-3 內距，標題列在上、圓角畫布在下 */}
        <div className="min-h-0 rounded-card bg-surface border border-border shadow-card p-3 flex flex-col">
          <div className="shrink-0 px-1 pb-2 flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">DCU 監控地圖</h3>
            <span className="flex-1" />
            <MapTabs />
          </div>
          <div className="relative flex-1 min-h-0 rounded-xl bg-inset/40 overflow-hidden border border-border">
            {/* B2：兩張地圖常駐、只切可見性 —— 切頁籤不再整個 WebGL 重建（原本每切一次 ~300-500ms 白畫面） */}
            <div className="absolute inset-0" style={{ visibility: tab === 'relation' ? 'hidden' : 'visible' }}><DcuFaultMap /></div>
            <div className="absolute inset-0" style={{ visibility: tab === 'relation' ? 'visible' : 'hidden' }}><DcuRelationMap /></div>
            <MapLegend />
          </div>
        </div>
        <div className="min-h-0 flex flex-col gap-3">
          <KpiCard />
          {showMisOnly ? (
            <MisMeterList />
          ) : showCityList ? (
            <>
              {/* 全台：上為 DCU 斷線分佈、下為歸屬錯誤電表清單（兩份都是「該範圍的清單」） */}
              <div className="flex-[1.15] min-h-0 flex"><CityList /></div>
              <div className="flex-1 min-h-0 flex"><MisMeterList /></div>
            </>
          ) : (
            <>
              {/* 選了 DCU：列表收合成只剩該台，高度讓給電表列表 */}
              <div className={selectedDcuId ? 'shrink-0 flex' : 'flex-1 min-h-0 flex'}><DcuListTable collapsed={!!selectedDcuId} /></div>
              {/* 電表列表：未選取時完全不出現；再次點同一台 DCU 即縮回 */}
              {selectedDcuId && <MeterListTable />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ 導覽列（麵包屑，比照系統總覽） ------------------------------ */
function FilterBar() {
  const { level, city, district, updatedAt } = useWarroom()
  const enterTaiwan = useWarroom((s) => s.enterTaiwan)
  const setDistrict = useWarroom((s) => s.setDistrict)
  const resetView = useWarroom((s) => s.resetView)
  const refitDistrict = useWarroom((s) => s.refitDistrict)
  const clearSelection = useWarroom((s) => s.clearSelection)
  const selectMeter = useWarroom((s) => s.selectMeter)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)

  // 分層退階（A1：只走空間層級，不動地圖頁籤 —— 頁籤是檢視方式、不是層級）
  // 電表 → DCU → 行政區 → 整個縣市 → 全台(選縣市)
  const back = () => {
    if (selectedMeterId) { selectMeter(null); return }
    if (selectedDcuId) { clearSelection(); refitDistrict(); return }
    if (level === 'city' && district) { setDistrict(''); return }
    if (level === 'city') { enterTaiwan(); return }
    resetView()
  }
  // 區域下拉選單依業主意見移除，改與系統總覽同一套麵包屑：台灣(L1) › 縣市(L2) › 行政區(L3)
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: '台灣(L1)', onClick: level === 'taiwan' ? undefined : enterTaiwan },
  ]
  if (level === 'city') crumbs.push({ label: `${city}(L2)`, onClick: district ? () => setDistrict('') : undefined })
  if (district) crumbs.push({ label: `${district}(L3)` })
  const canBack = crumbs.length > 1 || !!selectedDcuId || !!selectedMeterId

  return (
    <div className="shrink-0 flex items-center gap-2 flex-wrap">
      {canBack && (
        <button onClick={back} className="flex items-center gap-1 text-[13px] text-ink-sub hover:text-brand px-2 py-1 rounded-lg hover:bg-inset" title="返回上一層">
          <ArrowLeft size={15} />返回
        </button>
      )}
      <nav className="flex items-center gap-1 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-ink-mut" />}
            <button
              onClick={c.onClick}
              disabled={!c.onClick}
              className={c.onClick ? 'text-ink-sub hover:text-brand hover:underline' : 'font-semibold text-ink cursor-default'}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>
      <div className="h-5 w-px bg-divider" />
      <button onClick={resetView} className="inline-flex items-center gap-1.5 text-[13px] text-ink-sub hover:text-brand px-2 py-1 rounded-lg hover:bg-inset"><Crosshair size={14} />重置視角</button>
      <span className="text-[12.5px] text-ink-mut">資料更新：{updatedAt}</span>
      <div className="flex-1" />
    </div>
  )
}

/* ------------------------------ 地圖頁籤（卡片標題列右側） ------------------------------ */
function MapTabs() {
  const tab = useWarroom((s) => s.tab)
  const setTab = useWarroom((s) => s.setTab)
  return (
    <div className="inline-flex rounded-lg bg-inset/70 p-0.5 border border-border">
      {[{ key: 'fault', label: 'DCU 斷線地圖' }, { key: 'relation', label: '電表歸屬地圖' }].map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key as 'fault' | 'relation')}
          className={['px-3 py-1 text-[12.5px] font-semibold rounded-md transition-colors', tab === t.key ? 'bg-surface text-brand shadow-sm' : 'text-ink-sub hover:text-ink'].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
/* ------------------------------ 圖例 ------------------------------ */
function MapLegend() {
  const tab = useWarroom((s) => s.tab)
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-surface/92 backdrop-blur border border-border shadow-card px-3 py-2 text-[11px]">
      {tab === 'fault' ? (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold text-ink-sub">DCU 連線率告警（區塊塗色）</div>
          <div className="flex items-center gap-3">
            {([['normal', '≥97%'], ['warn', '90-97%'], ['alert', '<90%']] as const).map(([k, range]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-ink-sub">
                <span className="h-3 w-3 rounded-[3px] border" style={{ background: SEVERITY_COLOR[k], borderColor: SEVERITY_STROKE[k] }} />
                {SEVERITY_LABEL[k]}<span className="text-ink-mut tabular-nums">{range}</span>
              </span>
            ))}
          </div>
          {/* 依業主意見：本圖只標斷線 DCU，停用與頻點色點位不再呈現 */}
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex items-center gap-0.5">
                {CLUSTER_RAMP.map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />)}
              </span>
              群集內斷線 DCU 數（越深越多）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="grid place-items-center h-4 w-4 rounded-[4px] border-2 border-white text-white text-[9px] font-bold leading-none" style={{ background: STATE_COLOR.offline }}>✕</span>
              斷線 DCU
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* B1/A4：DCU 一律圓形、底色＝頻點色；狀態只有 正常／斷線／停用，與 GPU 圓點同一套編碼 */}
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 rounded-full border-2 border-white shadow-sm" style={{ background: FREQ_COLORS[0] }} />DCU 正常（底色＝頻點色）</span>
            <span className="inline-flex items-center gap-1.5"><span className="grid place-items-center h-4 w-4 rounded-[4px] border-2 border-white text-white text-[9px] font-bold leading-none" style={{ background: STATE_COLOR.offline }}>✕</span>斷線</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 rounded-full border-2 border-white" style={{ background: STATE_COLOR.disabled }} />停用</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="flex gap-0.5">{FREQ_COLORS.slice(0, 5).map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>電表（依所屬 DCU 頻點色）</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid place-items-center h-4 w-4 rounded-full border-2 border-white text-white text-[9px] font-bold leading-none" style={{ background: MIS_COLOR }}>✕</span>
              歸屬錯誤電表
            </span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2" style={{ borderColor: MIS_COLOR }} />實際收容</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: '#9AA0A6' }} />白名單應屬</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span>方向：<b className="text-ink">他台連入</b>＝別台的表跑進來 ／ <b className="text-ink">連入他台</b>＝自己的表跑出去</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="flex gap-0.5">{GROUP_COLORS.map((c) => <span key={c} className="h-3 w-3 rounded-[3px] border-2" style={{ borderColor: c }} />)}</span>釘選群組</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border-2 border-dashed border-ink" />跨區</span>
          </div>
        </div>
      )}
    </div>
  )
}
/* ------------------------------ 右① KPI（故障分布，依地圖層級一次看完；兩個頁籤共用） ------------------------------ */
function KpiCard() {
  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)

  // A4：「問題 DCU（收容任一斷線電表）」定義移除 —— 兩個頁籤一律顯示故障分布（B4：memo 化）
  const agg = useMemo(() => aggStat(dcusInScope(level, city, district)), [level, city, district])
  const scopeLabel = level === 'taiwan' ? '全台' : district ? `${city} · ${district}` : `${city} · 全部行政區`
  // 五格全部可點：切換下方清單（前四格＝DCU 列表的狀態篩選，第五格＝歸屬錯誤電表清單）
  const listFilter = useWarroom((s) => s.listFilter)
  const setListFilter = useWarroom((s) => s.setListFilter)
  const dcuListOpen = useWarroom((s) => s.dcuListOpen)
  const active = level === 'taiwan' && !dcuListOpen ? undefined : listFilter
  const kpis = [
    { label: 'DCU 總數', value: fmtInt(agg.dcuTotal), filter: 'all' as const },
    { label: 'DCU 連線數', value: fmtInt(agg.dcuOnline), filter: 'online' as const },
    { label: 'DCU 斷線數', value: fmtInt(agg.dcuOffline), danger: true, filter: 'offline' as const },
    // 停用 DCU 仍計入「連線數」（state='disabled' 時 online=true），故單獨列一格
    { label: 'DCU 停用數', value: fmtInt(agg.dcuDisabled), filter: 'disabled' as const },
    { label: '歸屬錯誤電表數', value: fmtInt(agg.misassigned), filter: 'mis' as const },
  ]
  return (
    <div className="shrink-0 rounded-card bg-surface border border-border shadow-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[16.5px] font-semibold text-ink">DCU 總覽</h2>
        <span className="text-[14px] text-ink-sub">{scopeLabel}</span>
        <span className="flex-1" />
        <span className="text-[12.5px] text-ink-mut">點方塊切換下方清單{level === 'taiwan' ? ' · 點地圖縣市下鑽' : ''}</span>
      </div>
      <KpiRow kpis={kpis} cols={5} active={active} onPick={setListFilter} />
    </div>
  )
}
function KpiRow({ kpis, cols = 3, active, onPick }: {
  kpis: { label: string; value: string; danger?: boolean; filter?: DcuListFilter }[]
  cols?: 3 | 4 | 5
  active?: DcuListFilter
  onPick?: (f: DcuListFilter) => void
}) {
  return (
    <div className={`grid ${cols === 5 ? 'grid-cols-5' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
      {kpis.map((k) => {
        const pick = k.filter && onPick ? () => onPick(k.filter!) : undefined
        const on = !!k.filter && active === k.filter && active !== 'all'
        return (
          <button
            key={k.label}
            onClick={pick}
            disabled={!pick}
            title={pick ? `篩選 DCU 列表：${k.label}` : undefined}
            className={[
              'text-left rounded-lg border px-3 py-2.5 transition-colors',
              on ? 'bg-brand-soft/60 border-brand' : 'bg-inset/50 border-border/60',
              pick ? 'cursor-pointer hover:border-brand hover:bg-brand-soft/40' : 'cursor-default',
            ].join(' ')}
          >
            <div className="text-[13px] text-ink-sub whitespace-nowrap">{k.label}</div>
            <div className="text-[26px] leading-tight font-bold tabular-nums" style={{ color: k.danger ? '#DB3B36' : undefined }}>{k.value}</div>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ 全台：DCU 斷線分佈（依縣市，北到南） ------------------------------ */
function CityList() {
  const setCity = useWarroom((s) => s.setCity)
  // 依業主意見：固定北到南排序，不提供欄位排序（cityStats 已依緯度排好）
  const rows = useMemo(() => cityStats(), [])

  return (
    <div className="flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">DCU 斷線分佈</h3>
        <span className="text-[12.5px] text-ink-mut">縣市 · 北到南</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[13.5px]">
          <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
            <tr className="border-b border-border">
              <th className="font-medium px-2 py-2.5 text-left whitespace-nowrap">縣市</th>
              <th className="font-medium px-2 py-2.5 text-left whitespace-nowrap">連線狀態</th>
              <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">DCU總數</th>
              <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">DCU連線數</th>
              <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">DCU斷線數</th>
              <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">DCU連線率</th>
              <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">DCU LP讀表率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} onClick={() => setCity(s.name)} className="border-b border-divider cursor-pointer hover:bg-inset/40" title="檢視該縣市的 DCU 清單">
                <td className="px-2 py-2.5 font-semibold text-ink whitespace-nowrap">{s.name}</td>
                <td className="px-2 py-2.5">
                  {/* 與左側地圖圖例同一組判定（DCU 連線率 97/90） */}
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap" style={{ color: SEVERITY_ACCENT[s.severity] }}>
                    <span className="h-2.5 w-2.5 rounded-[3px] border" style={{ background: SEVERITY_COLOR[s.severity], borderColor: SEVERITY_STROKE[s.severity] }} />{SEVERITY_LABEL[s.severity]}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink-sub">{fmtInt(s.dcuTotal)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink">{fmtInt(s.dcuOnline)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: RED }}>{fmtInt(s.dcuOffline)}</td>
                {/* 連線率／LP讀表率：依業主意見不塗色 */}
                <td className="px-2 py-2.5 text-right tabular-nums text-ink">{(s.onlineRate * 100).toFixed(1)}%</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink">{s.lpRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-3 py-2 border-t border-border text-[11.5px] text-ink-mut">點縣市（或地圖上的縣市）進入該縣市的 DCU 清單。</div>
    </div>
  )
}

/* ------------------------------ 歸屬錯誤電表清單（可排序；點列跳到 L3 點位） ------------------------------ */
type MisSortKey = 'meterNo' | 'elecNo' | 'last' | 'lastLp' | 'actual' | 'expected'

function MisMeterList() {
  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const focusMisMeter = useWarroom((s) => s.focusMisMeter)
  const listFilter = useWarroom((s) => s.listFilter)
  const setListFilter = useWarroom((s) => s.setListFilter)
  const [sortKey, setSortKey] = useState<MisSortKey>('meterNo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const scopeLabel = level === 'taiwan' ? '全台' : district ? `${city} · ${district}` : city
  const rows = useMemo(() => {
    const list = misassignedInScope(level, city, district).map((m) => ({
      m, ext: meterRowOf(m.id, m.dcuId, m.online, officeOf(m.city).code),
    }))
    const cmp = (a: typeof list[number], b: typeof list[number]) => {
      switch (sortKey) {
        case 'elecNo': return a.ext.elecNo.localeCompare(b.ext.elecNo)
        case 'last': return a.m.lastMins - b.m.lastMins
        case 'lastLp': return a.m.lastLpMins - b.m.lastLpMins
        case 'actual': return a.m.dcuId.localeCompare(b.m.dcuId)
        case 'expected': return a.m.expectedDcuId.localeCompare(b.m.expectedDcuId)
        default: return a.m.id.localeCompare(b.m.id)
      }
    }
    return list.sort((a, b) => (sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)))
  }, [level, city, district, sortKey, sortDir])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [level, city, district, sortKey, sortDir])
  const pageRows = rows.slice(0, visible)
  const toggle = (k: MisSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: MisSortKey, label: string) => (
    <BitTh><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggle(k)} /></BitTh>
  )

  return (
    <div className="flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border">
        {listFilter === 'mis' && (
          <button onClick={() => setListFilter('all')} className="text-ink-sub hover:text-brand" title="返回"><ArrowLeft size={16} /></button>
        )}
        <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">歸屬錯誤電表清單</h3>
        <span className="text-[12.5px] text-ink-mut">{scopeLabel}</span>
        <span className="flex-1" />
        <span className="text-[12.5px] tabular-nums" style={{ color: MIS_COLOR }}>共 <b>{fmtInt(rows.length)}</b> 顆</span>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[13.5px] border-collapse">
          <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
            <tr className="border-b border-border">
              {head('meterNo', '表號')}
              {head('elecNo', '電號')}
              {head('last', '最後連線時間')}
              {head('lastLp', '最後LP時間')}
              {head('actual', '連線DCU')}
              {head('expected', '歸屬DCU')}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ m, ext }) => (
              <tr key={m.id} onClick={() => focusMisMeter(m.id)} className="border-b border-divider cursor-pointer hover:bg-inset/40" title="跳到該電表的歸屬點位">
                <td className="px-3 py-2 font-mono text-ink whitespace-nowrap">
                  <span className="mr-1 font-bold" style={{ color: MIS_COLOR }}>✕</span>{m.id}
                </td>
                <td className="px-3 py-2 font-mono text-ink-sub whitespace-nowrap">{ext.elecNo}</td>
                <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{m.last}</td>
                <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{m.lastLp}</td>
                <td className="px-3 py-2 font-mono text-ink whitespace-nowrap">{m.dcuId}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: MIS_COLOR }}>{m.expectedDcuId}</td>
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-mut">此範圍無歸屬錯誤電表</td></tr>}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <div className="shrink-0">
        <InfiniteFooter loaded={pageRows.length} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
    </div>
  )
}

/* ------------------------------ 右② DCU 列表（DCU 裝置列表的列表功能就地復現） ------------------------------ */
/** fleet DCU → 裝置列表的 DcuRow（供 DCU資料 抽屜共用同一組欄位） */
function toDcuRow(d: Dcu, stat: DcuStat): DcuRow {
  return {
    status: d.online ? 'online' : 'offline',
    model: d.id, serial: d.code,
    online: stat.online, total: stat.total, read: stat.read,
    percent: Math.round(stat.lpRate),
    alarms: 0, // 告警角標依業主意見移除
  }
}
/** LP 讀表率告警門檻（業主指定：<90% 紅字，其餘不塗色） */
const LP_ALERT = 90
type DcuSortKey = 'state' | 'online' | 'connect' | 'lp' | 'time'

function DcuListTable({ collapsed = false }: { collapsed?: boolean }) {
  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const pinSelected = useWarroom((s) => s.pinSelected)
  // 點同一台＝收合電表列表（比照裝置列表）
  const toggleDcu = useWarroom((s) => s.toggleDcu)
  const setHoverDcuId = useWarroom((s) => s.setHoverDcuId) // A3：列表 hover → 地圖高亮
  useEffect(() => () => setHoverDcuId(null), [setHoverDcuId]) // 卸載時清 hover，避免高亮殘留
  // 狀態篩選放在 store，KPI 卡點擊可直接帶入
  const stateFilter = useWarroom((s) => s.listFilter)
  const setStateFilter = useWarroom((s) => s.setListFilter)
  const closeDcuList = useWarroom((s) => s.closeDcuList)
  const clearSelection = useWarroom((s) => s.clearSelection)

  const [idQ, setIdQ] = useState('')
  const [menu, setMenu] = useState<null | 'id'>(null)
  // 預設：最後連線時間，由近到遠
  const [sortKey, setSortKey] = useState<DcuSortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [infoDcu, setInfoDcu] = useState<DcuRow | null>(null)
  const [settingsDcu, setSettingsDcu] = useState<DcuRow | null>(null)
  // 詳細資料改彈窗（與電表詳細資料同模式），不再整頁跳轉離開總覽
  const [detailDcu, setDetailDcu] = useState<string | null>(null)

  const scoped = useMemo(() => dcusInScope(level, city, district).map((d) => ({ d, stat: dcuStat(d.id) })), [level, city, district])
  const rows = useMemo(() => {
    const list = scoped.filter(({ d }) =>
      (stateFilter === 'all' || stateFilter === 'mis' ||
        (stateFilter === 'online' ? d.state !== 'offline' : d.state === stateFilter)) &&
      d.id.toLowerCase().includes(idQ.trim().toLowerCase()))
    const rank = { offline: 0, disabled: 1, active: 2 }
    const cmp = (a: typeof list[number], b: typeof list[number]) => {
      switch (sortKey) {
        case 'state': return rank[a.d.state] - rank[b.d.state]
        case 'online': return a.stat.online - b.stat.online
        case 'connect': return a.stat.connectRate - b.stat.connectRate
        case 'lp': return a.stat.lpRate - b.stat.lpRate
        default: return a.d.lastSeenMins - b.d.lastSeenMins // asc＝由近到遠
      }
    }
    return [...list].sort((a, b) => {
      // 從地圖點選的 DCU 置頂，方便與地圖對照；點列表列本身不重排（否則列會在游標下跳走）
      if (pinSelected) {
        if (a.d.id === selectedDcuId) return -1
        if (b.d.id === selectedDcuId) return 1
      }
      return sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)
    })
  }, [scoped, stateFilter, idQ, sortKey, sortDir, pinSelected, selectedDcuId])

  const sum = useMemo(() => scoped.reduce((s, { stat }) => ({ online: s.online + stat.online, total: s.total + stat.total }), { online: 0, total: 0 }), [scoped])
  // 無限捲動取代分頁器
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, revealIndex, hasMore } = useInfiniteRows(rows.length, [stateFilter, idQ, sortKey, sortDir, level, city, district, selectedDcuId])
  // 收合模式（已選取某台）：只留該台，把高度讓給電表列表
  const pageRows = collapsed ? rows.filter(({ d }) => d.id === selectedDcuId) : rows.slice(0, visible)

  // 從地圖點 DCU → 把該列載入並捲進可視範圍
  const selRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (!selectedDcuId || collapsed) return
    revealIndex(rows.findIndex(({ d }) => d.id === selectedDcuId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDcuId])
  useEffect(() => {
    if (selectedDcuId && !collapsed) selRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedDcuId, visible, collapsed])

  const toggleSort = (k: DcuSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const head = (k: DcuSortKey, label: string) => (
    <BitTh><SortHead label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} /></BitTh>
  )

  return (
    <div className={`${collapsed ? 'w-full' : 'flex-1 min-h-0'} rounded-card bg-surface border border-border shadow-card flex flex-col`}>
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {(level === 'taiwan' || collapsed) && (
            <button
              onClick={() => (collapsed ? clearSelection() : closeDcuList())}
              className="text-ink-sub hover:text-brand"
              title={collapsed ? '返回 DCU 列表' : '返回 DCU 斷線分佈'}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">
            DCU 列表{level === 'taiwan' && <span className="ml-1 text-[13px] font-normal text-ink-sub">全台</span>}
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {stateFilter !== 'all' && stateFilter !== 'mis' && (
            <button onClick={() => setStateFilter('all')} className="inline-flex items-center gap-1 rounded-md border border-brand text-brand px-2 py-0.5 text-[12.5px] font-medium hover:bg-brand-soft/50">
              {stateFilter === 'online' ? '連線' : stateFilter === 'offline' ? '斷線' : stateFilter === 'disabled' ? '停用' : '正常'}
              <X size={11} />
            </button>
          )}
          <div className="text-[12.5px] text-ink-sub tabular-nums">上線數 <b className="text-ink">{fmtInt(sum.online)}</b> / 電表總數 <b className="text-ink">{fmtInt(sum.total)}</b></div>
        </div>
      </div>
      <div ref={scrollRef} className={collapsed ? 'shrink-0' : 'flex-1 min-h-0 overflow-auto'}>
        <table className="w-full text-[13.5px] border-collapse">
          <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
            <tr className="border-b border-border">
              {head('state', '狀態')}
              <BitTh>
                <SearchHead label="DCU序號" value={idQ} open={menu === 'id'} onToggle={() => setMenu(menu === 'id' ? null : 'id')} onChange={setIdQ} />
              </BitTh>
              {head('online', '上線數 / 電表總數')}
              {head('connect', '連線率')}
              {head('lp', 'LP讀表率')}
              {head('time', '最後連線時間')}
              <BitTh className="w-[92px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ d, stat }) => {
              const on = selectedDcuId === d.id
              const row = toDcuRow(d, stat)
              return (
                <tr key={d.id} ref={on ? selRowRef : undefined} onClick={() => toggleDcu(d.id)} onMouseEnter={() => setHoverDcuId(d.id)} onMouseLeave={() => setHoverDcuId(null)} title={on ? '再次點擊收合電表列表' : '檢視此 DCU 的電表列表'} className={`border-b border-divider cursor-pointer ${on ? 'bg-brand-soft/60' : 'hover:bg-inset/40'}`}>
                  {/* 狀態只有連線／斷線兩色（停用仍算連線） */}
                  <td className="px-3 py-2"><StatusPill status={d.online ? 'online' : 'offline'} /></td>
                  <td className="px-3 py-2"><span className={`font-mono ${on ? 'text-brand font-semibold' : 'text-ink'}`}>{d.id}</span></td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub">{fmtInt(stat.online)} / {fmtInt(stat.total)}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{stat.connectRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 tabular-nums font-medium" style={{ color: stat.lpRate < LP_ALERT ? RED : '#2A2125' }}>{stat.lpRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{d.lastSeen}</td>
                  <td className="px-3 py-2">
                    {/* 按鈕順序：DCU資料 → 詳細資料 → 裝置設定 */}
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setInfoDcu(row)} title="DCU資料" className="text-ink-mut hover:text-brand"><Info size={15} /></button>
                      <button onClick={() => setDetailDcu(d.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={15} /></button>
                      <button onClick={() => setSettingsDcu(row)} title="DCU裝置設定" className="text-ink-mut hover:text-brand"><Settings size={15} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-mut">查無符合條件的 DCU</td></tr>}
          </tbody>
        </table>
        {!collapsed && <div ref={sentinelRef} />}
      </div>
      {!collapsed && (
        <div className="shrink-0">
          <InfiniteFooter loaded={pageRows.length} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
        </div>
      )}
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      {infoDcu && <DcuInfoDrawer dcu={infoDcu} onClose={() => setInfoDcu(null)} />}
      {settingsDcu && <DcuSettingsModal dcu={settingsDcu} onClose={() => setSettingsDcu(null)} />}
      {detailDcu && <DcuDetailModal model={detailDcu} onClose={() => setDetailDcu(null)} />}
    </div>
  )
}

/* ------------------------------ 右③ 電表列表（點選 DCU 才展開；欄位與 DCU 裝置列表的電表面板一致） ------------------------------ */
type MeterStatusFilter = 'all' | 'online' | 'offline'
type MeterSortKey = 'mis' | 'status' | 'elecNo' | 'meterNo' | 'dcu' | 'lp' | 'mn'

function MeterListTable() {
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectDcu = useWarroom((s) => s.selectDcu)
  const selectMeter = useWarroom((s) => s.selectMeter)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)

  const pinSelected = useWarroom((s) => s.pinSelected)
  const [statusFilter, setStatusFilter] = useState<MeterStatusFilter>('all')
  const [q, setQ] = useState({ meterNo: '', elecNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'meterNo' | 'elecNo'>(null)
  // 頁籤移除後，改以「歸屬狀態」排序預設把異常排到最上面
  const [sortKey, setSortKey] = useState<MeterSortKey>('mis')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [settingsMeter, setSettingsMeter] = useState<DcuMeterRow | null>(null)

  /**
   * 本台收容的電表（含「他台連入」）＋ 白名單應屬本台但跑到別台的電表（「連入他台」）。
   * 後者不在 metersOfDcu 裡，必須另外併進來，否則使用者看不到自己的表跑去哪。
   * dir: null＝正常歸屬；'in'＝他台連入；'out'＝連入他台
   */
  const all = useMemo(() => {
    if (!selectedDcuId) return [] as { m: Meter; ext: DcuMeterRow; dir: MisDir | null }[]
    const own = metersOfDcu(selectedDcuId).map((m) => ({
      m, ext: meterRowOf(m.id, m.dcuId, m.online, officeOf(m.city).code), dir: (m.expectedDcuId !== selectedDcuId ? 'in' : null) as MisDir | null,
    }))
    const gone = misassignedOut(selectedDcuId).map((m) => ({
      m, ext: meterRowOf(m.id, m.dcuId, m.online, officeOf(m.city).code), dir: 'out' as MisDir,
    }))
    return [...own, ...gone]
  }, [selectedDcuId])
  // 上線數 / 電表總數 與 DCU 列表同一個口徑（白名單、排除停用），避免同一台出現兩組數字
  const stat = selectedDcuId ? dcuStat(selectedDcuId) : { online: 0, total: 0 }
  const setSearch = (k: keyof typeof q, v: string) => setQ((s) => ({ ...s, [k]: v }))
  const toggleSort = (key: MeterSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }
  const rows = useMemo(() => {
    const list = all.filter(({ m, ext }) =>
      (statusFilter === 'all' || (statusFilter === 'online') === m.online) &&
      m.id.toLowerCase().includes(q.meterNo.trim().toLowerCase()) &&
      ext.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()))
    const cmp = (a: typeof list[number], b: typeof list[number]) => {
      switch (sortKey) {
        case 'status': return (a.m.online ? 1 : 0) - (b.m.online ? 1 : 0)
        case 'elecNo': return a.ext.elecNo.localeCompare(b.ext.elecNo)
        case 'meterNo': return a.m.id.localeCompare(b.m.id)
        case 'dcu': return a.m.dcuId.localeCompare(b.m.dcuId)
        case 'lp': return b.m.lastLpMins - a.m.lastLpMins
        case 'mn': return b.m.lastMnMins - a.m.lastMnMins
        default: return (a.dir ? 1 : 0) - (b.dir ? 1 : 0) // 歸屬狀態：異常為大
      }
    }
    return [...list].sort((a, b) => {
      // 從地圖點選的電表置頂，方便與地圖對照
      if (pinSelected) {
        if (a.m.id === selectedMeterId) return -1
        if (b.m.id === selectedMeterId) return 1
      }
      return sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)
    })
  }, [all, statusFilter, q, sortKey, sortDir, pinSelected, selectedMeterId])

  // 無限捲動取代分頁器
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, revealIndex, hasMore } = useInfiniteRows(rows.length, [selectedDcuId, statusFilter, q, sortKey, sortDir, selectedMeterId])
  const pageRows = rows.slice(0, visible)

  // 從地圖點電表時，把該列載入（若在未載入的區段）並捲入可視範圍
  const selRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (!selectedMeterId) return
    revealIndex(rows.findIndex(({ m }) => m.id === selectedMeterId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterId])
  useEffect(() => {
    if (selectedMeterId) selRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedMeterId, visible])

  return (
    <div className="war-popdown flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-y-1.5 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {selectedDcuId && <button onClick={() => selectDcu(null)} className="text-ink-sub hover:text-brand" title="收合"><ArrowLeft size={16} /></button>}
          {/* 標題後直接帶出所在 DCU 序號 */}
          <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">
            電表列表 <span className="font-mono text-ink-sub font-normal">{selectedDcuId ?? '未選取'}</span>
          </h3>
        </div>
        {selectedDcuId && (
          <span className="text-[12.5px] text-ink-sub tabular-nums">上線數 <b className="text-ink">{fmtInt(stat.online)}</b> / 電表總數 <b className="text-ink">{fmtInt(stat.total)}</b></span>
        )}
      </div>
      {selectedDcuId ? (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
            {/* 欄位多（8 欄），字級與內距比其他清單再收一級，電號才不會被擠到換行 */}
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
                <tr className="border-b border-border">
                  <BitTh>
                    <SortHead label="歸屬狀態" active={sortKey === 'mis'} dir={sortDir} onClick={() => toggleSort('mis')} />
                  </BitTh>
                  <BitTh>
                    <FilterHead label="連線狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                      {(['all', 'online', 'offline'] as MeterStatusFilter[]).map((s) => (
                        <MenuItem key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setMenu(null) }}>
                          {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                        </MenuItem>
                      ))}
                    </FilterHead>
                  </BitTh>
                  <BitTh>
                    <SearchHead label="電號" value={q.elecNo} open={menu === 'elecNo'} onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')} onChange={(v) => setSearch('elecNo', v)} />
                  </BitTh>
                  <BitTh>
                    <SearchHead label="表號" value={q.meterNo} open={menu === 'meterNo'} onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')} onChange={(v) => setSearch('meterNo', v)} />
                  </BitTh>
                  <BitTh>
                    <SortHead label="連線DCU" active={sortKey === 'dcu'} dir={sortDir} onClick={() => toggleSort('dcu')} />
                  </BitTh>
                  <BitTh>
                    <SortHead label="最後LP時間" active={sortKey === 'lp'} dir={sortDir} onClick={() => toggleSort('lp')} />
                  </BitTh>
                  <BitTh>
                    <SortHead label="最後MN時間" active={sortKey === 'mn'} dir={sortDir} onClick={() => toggleSort('mn')} />
                  </BitTh>
                  <BitTh className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ m, ext, dir }) => {
                  return (
                    <tr key={m.id} ref={selectedMeterId === m.id ? selRowRef : undefined} onClick={() => selectMeter(m.id, { pin: false })} className={`border-b border-divider cursor-pointer ${selectedMeterId === m.id ? 'bg-brand-soft/60' : 'hover:bg-inset/40'}`}>
                      {/* 歸屬狀態：他台連入／連入他台都算異常（方向以 tooltip 區分） */}
                      <td className="px-2 py-2">
                        {dir ? (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap" style={{ color: MIS_COLOR }} title={`${MIS_DIR_LABEL[dir]}：${dir === 'in' ? `應屬 ${m.expectedDcuId}` : `現由 ${m.dcuId} 收容`}`}>
                            <span className="grid place-items-center h-4 w-4 rounded-full text-white text-[9px] font-bold leading-none" style={{ background: MIS_COLOR }}>✕</span>
                            異常
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-mut">正常</span>
                        )}
                      </td>
                      <td className="px-2 py-2"><StatusPill status={m.online ? 'online' : 'offline'} /></td>
                      <td className="px-2 py-2 font-mono text-ink-sub whitespace-nowrap">{ext.elecNo}</td>
                      <td className="px-2 py-2 font-mono text-ink whitespace-nowrap">
                        {m.id}{!!district && m.district !== district && <span className="ml-1 text-[10px] text-ink-mut">跨區</span>}
                      </td>
                      <td className="px-2 py-2 font-mono text-ink-sub whitespace-nowrap">{m.dcuId}</td>
                      {/* LP／MN 非當日標紅 */}
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: isSameDay(m.lastLpMins) ? undefined : RED }}>{m.lastLp}</td>
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: isSameDay(m.lastMnMins) ? undefined : RED }}>{m.lastMn}</td>
                      <td className="px-2 py-2">
                        {/* 只留 詳細資料 與 裝置設定，順序同 DCU 列表 */}
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setDetailMeter(m.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={15} /></button>
                          <button onClick={() => setSettingsMeter(ext)} title="裝置設定" className="text-ink-mut hover:text-brand"><Settings size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {pageRows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-mut">查無符合條件的電表</td></tr>}
              </tbody>
            </table>
            <div ref={sentinelRef} />
          </div>
          <div className="shrink-0">
            <InfiniteFooter loaded={pageRows.length} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 grid place-items-center p-6 text-center">
          <div className="text-ink-mut">
            <MousePointerClick size={26} className="mx-auto mb-2 opacity-60" />
            <div className="text-[13px]">點選上方「DCU 列表」或地圖上的 DCU</div>
            <div className="text-[12px]">以展開其收容的電表</div>
          </div>
        </div>
      )}
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      {detailMeter && <MeterDetailModal meterNo={detailMeter} onClose={() => setDetailMeter(null)} />}
      {settingsMeter && <MeterSettingsModal meter={settingsMeter} onClose={() => setSettingsMeter(null)} />}
      {/* 電號 / FAN ID / LQI 為 demo 推導值（meterRowOf）；上線改 API 欄位 */}
    </div>
  )
}

