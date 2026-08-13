import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, CornerUpLeft, Crosshair, ArrowLeft, MousePointerClick, Copy, Check, ClipboardList, Info, Settings, X } from 'lucide-react'
import {
  Th as BitTh, StatusPill, StatePill, SortHead, FilterHead, SearchHead, MenuItem,
  PercentBadge, useInfiniteRows, InfiniteFooter, RED, type SortDir,
} from '@/components/table/tableBits'
import { DcuInfoDrawer } from '@/components/dcu/DcuInfoDrawer'
import { DcuSettingsModal } from '@/components/dcu/DcuSettingsModal'
import { DcuDetailModal } from '@/components/dcu/DcuDetailModal'
import { MeterDetailModal } from '@/components/dcu/MeterDetailModal'
import { MeterInfoDrawer } from '@/components/dcu/MeterInfoDrawer'
import { MeterSettingsModal } from '@/components/dcu/MeterSettingsModal'
import { meterRowOf, type DcuMeterRow } from '@/data/dcuMeters'
import type { DcuRow } from '@/data/dcuList'
import { status as statusTok } from '@/tokens'
import { DcuFaultMap } from '@/components/warroom/DcuFaultMap'
import { DcuRelationMap } from '@/components/warroom/DcuRelationMap'
import { SEVERITY_COLOR, SEVERITY_LABEL, GROUP_COLORS, CLUSTER_BLUE, STATE_COLOR, FREQ_COLORS } from '@/components/warroom/warroomConfig'
import { useWarroom, type DcuListFilter } from '@/store/useWarroom'
import {
  CITIES, districtsOf,
  metersOfDcu, dcuById, cityStats, aggStat, dcusInScope, type Dcu,
} from '@/data/dcuFleet'
import { dcuStat, misassignedOfDcu, type DcuStat } from '@/data/dcuMetrics'
import { fmtInt } from '@/lib/format'

/**
 * 裝置管理 · DCU 戰情室 —— 版式參考 Figma 3164-10362：
 *   左：DCU 監控地圖（880，全高）故障地圖 / 關係地圖 兩頁籤
 *   右：DCU狀態 KPI + 異常DCU（默認列出）+ 異常電表（點選 DCU 才展開）
 * 清單↔地圖連動（縮放定位）；選取行政區以填色高亮；案別由外層欄位篩選，此處不再重複。
 */
export function DcuWarRoom() {
  const tab = useWarroom((s) => s.tab)
  const level = useWarroom((s) => s.level)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  // 全台層級預設顯示縣市故障分布；點 KPI 數字才切換成（全台範圍的）DCU 列表
  const dcuListOpen = useWarroom((s) => s.dcuListOpen)
  const showCityList = level === 'taiwan' && !dcuListOpen
  return (
    <div className="h-full flex flex-col p-4 gap-3 min-w-[1320px]">
      <FilterBar />
      <div className="flex-1 min-h-0 grid grid-cols-[880fr_736fr] gap-3">
        <div className="relative min-h-0 rounded-card bg-surface border border-border shadow-card overflow-hidden">
          {/* B2：兩張地圖常駐、只切可見性 —— 切頁籤不再整個 WebGL 重建（原本每切一次 ~300-500ms 白畫面） */}
          <div className="absolute inset-0" style={{ visibility: tab === 'relation' ? 'hidden' : 'visible' }}><DcuFaultMap /></div>
          <div className="absolute inset-0" style={{ visibility: tab === 'relation' ? 'visible' : 'hidden' }}><DcuRelationMap /></div>
          <MapTabs />
          <MapLegend />
        </div>
        <div className="min-h-0 flex flex-col gap-3">
          <KpiCard />
          {showCityList ? (
            <CityList />
          ) : (
            <>
              {/* 空間有限：電表列表展開時 DCU 列表讓出高度（比照裝置列表的分割行為） */}
              <div className={selectedDcuId ? 'flex-[0.85] min-h-0 flex' : 'flex-1 min-h-0 flex'}><DcuListTable /></div>
              {/* 電表列表：未選取時完全不出現；再次點同一台 DCU 即縮回 */}
              {selectedDcuId && <MeterListTable />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ 篩選列 ------------------------------ */
function FilterBar() {
  const { level, city, district, updatedAt } = useWarroom()
  const enterTaiwan = useWarroom((s) => s.enterTaiwan)
  const setCity = useWarroom((s) => s.setCity)
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
  const onCity = (v: string) => (v === '全台' ? enterTaiwan() : setCity(v))
  const ALL_DISTRICTS = '全部行政區'
  const onDistrict = (v: string) => setDistrict(v === ALL_DISTRICTS ? '' : v)

  return (
    <div className="shrink-0 flex items-center gap-3 flex-wrap">
      <Select label="範圍" value={level === 'taiwan' ? '全台' : city} options={['全台', ...CITIES.map((c) => c.name)]} onChange={onCity} />
      {level === 'city' && <Select label="行政區" value={district || ALL_DISTRICTS} options={[ALL_DISTRICTS, ...districtsOf(city).map((d) => d.name)]} onChange={onDistrict} />}
      <span className="text-[12px] text-ink-mut">資料更新：{updatedAt}</span>
      <div className="h-5 w-px bg-divider" />
      <button onClick={back} className="inline-flex items-center gap-1.5 text-[12px] text-ink-sub hover:text-brand px-2 py-1.5 rounded-lg hover:bg-inset"><CornerUpLeft size={14} />返回上層</button>
      <button onClick={resetView} className="inline-flex items-center gap-1.5 text-[12px] text-ink-sub hover:text-brand px-2 py-1.5 rounded-lg hover:bg-inset"><Crosshair size={14} />重置視角</button>
      <div className="flex-1" />
    </div>
  )
}

/* ------------------------------ 地圖頁籤（疊在地圖右上角） ------------------------------ */
function MapTabs() {
  const tab = useWarroom((s) => s.tab)
  const setTab = useWarroom((s) => s.setTab)
  return (
    <div className="absolute right-3 top-3 z-20 inline-flex rounded-lg bg-surface/92 backdrop-blur p-0.5 border border-border shadow-card">
      {[{ key: 'fault', label: 'DCU 故障地圖' }, { key: 'relation', label: 'DCU—電表關係地圖' }].map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key as 'fault' | 'relation')}
          className={['px-3 py-1.5 text-[12.5px] font-semibold rounded-md transition-colors', tab === t.key ? 'bg-inset text-brand' : 'text-ink-sub hover:text-ink'].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface border border-border px-2.5 py-1.5 text-[12px]">
      <span className="text-ink-mut">{label}</span>
      <span className="relative inline-flex items-center">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pr-4 text-ink font-medium focus:outline-none cursor-pointer">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} className="text-ink-mut pointer-events-none absolute right-0" />
      </span>
    </label>
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
            {([
              ['normal', '≥95%'], ['warn', '85-95%'], ['abnormal', '70-85%'], ['critical', '<70%'],
            ] as const).map(([k, range]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-ink-sub">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: SEVERITY_COLOR[k] }} />
                {SEVERITY_LABEL[k]}<span className="text-ink-mut tabular-nums">{range}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="grid place-items-center h-3.5 w-3.5 rounded-full border-2 border-white text-[8px] font-bold text-white" style={{ background: CLUSTER_BLUE }}>n</span>DCU 群集</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: STATE_COLOR.offline }} />斷線</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: STATE_COLOR.disabled }} />停用</span>
          </div>
          <div className="flex items-center gap-1.5 text-ink-sub">
            <span className="flex gap-0.5">{FREQ_COLORS.map((c) => <span key={c} className="h-3 w-3 rounded-full border border-white" style={{ background: c }} />)}</span>
            啟用（10 頻點色）
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* B1/A4：DCU 一律圓形、底色＝頻點色；狀態只有 正常／斷線／停用，與 GPU 圓點同一套編碼 */}
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 rounded-full border-2 border-white shadow-sm" style={{ background: FREQ_COLORS[0] }} />DCU 正常（底色＝頻點色）</span>
            <span className="inline-flex items-center gap-1.5"><span className="grid place-items-center h-4 w-4 rounded-full border-2 text-white text-[8px] font-bold leading-none" style={{ background: FREQ_COLORS[0], borderColor: STATE_COLOR.offline }}>✕</span>斷線</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 rounded-full border-2 border-white" style={{ background: STATE_COLOR.disabled }} />停用</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="flex gap-0.5">{FREQ_COLORS.slice(0, 5).map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>電表（依所屬 DCU 頻點色）</span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-full border-2" style={{ background: `${FREQ_COLORS[0]}3D`, borderColor: FREQ_COLORS[0] }} />
              歸屬圈（左上切換顯示時機）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-full border-[1.5px]" style={{ borderColor: '#2A2125', boxShadow: '0 0 0 1.5px #fff inset' }} />
              圈外電表（輔助判讀）
            </span>
          </div>
          <div className="flex items-center gap-3 text-ink-sub">
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: '#E8862B' }} />歸屬錯誤電表</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2" style={{ borderColor: '#E8862B' }} />實際收容</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: '#5B4E52' }} />白名單應屬</span>
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

  // A4：「問題 DCU（收容任一斷線電表）」定義移除 —— 兩個頁籤一律顯示 故障分布（B4：memo 化）
  const agg = useMemo(() => aggStat(dcusInScope(level, city, district)), [level, city, district])
  const scopeLabel = level === 'taiwan' ? '全台' : district ? `${city} · ${district}` : `${city} · 全部行政區`
  const low = agg.readRate < 95
  // 前三格可點：把 DCU 列表篩到對應狀態；全台層級則一併把右側切成（全台範圍的）DCU 列表
  const listFilter = useWarroom((s) => s.listFilter)
  const setListFilter = useWarroom((s) => s.setListFilter)
  const dcuListOpen = useWarroom((s) => s.dcuListOpen)
  const active = level === 'taiwan' && !dcuListOpen ? undefined : listFilter
  const kpis = [
    { label: 'DCU 總數', value: fmtInt(agg.dcuTotal), filter: 'all' as const },
    { label: '連線數', value: fmtInt(agg.dcuOnline), filter: 'online' as const },
    { label: '斷線數', value: fmtInt(agg.dcuOffline), danger: true, filter: 'offline' as const },
    { label: '讀表率', value: `${agg.readRate.toFixed(1)}%`, danger: low },
  ]
  return (
    <div className="shrink-0 rounded-card bg-surface border border-border shadow-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[15px] font-semibold text-ink">DCU 故障總覽</h2>
        <span className="text-[13px] text-ink-sub">{scopeLabel}</span>
        <span className="flex-1" />
        <span className="text-[12px] text-ink-mut">{level === 'taiwan' ? '點數字看 DCU 列表 · 點地圖縣市下鑽' : '點數字篩選下方列表'}</span>
      </div>
      <KpiRow kpis={kpis} cols={4} active={active} onPick={setListFilter} />
    </div>
  )
}
function KpiRow({ kpis, cols = 3, active, onPick }: {
  kpis: { label: string; value: string; danger?: boolean; filter?: DcuListFilter }[]
  cols?: 3 | 4
  active?: DcuListFilter
  onPick?: (f: DcuListFilter) => void
}) {
  return (
    <div className={`grid ${cols === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-2.5`}>
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
            <div className="text-[12px] text-ink-sub whitespace-nowrap">{k.label}</div>
            <div className="text-[23px] leading-tight font-bold tabular-nums" style={{ color: k.danger ? '#DB3B36' : undefined }}>{k.value}</div>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ 全台：縣市故障分布清單（一次看完 總數/連線/斷線/讀表率/狀態） ------------------------------ */
function CityList() {
  const setCity = useWarroom((s) => s.setCity)
  const rows = useMemo(() => cityStats().slice().sort((a, b) => b.offlineRate - a.offlineRate), [])
  return (
    <div className="flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 px-4 py-2.5 border-b border-border"><h3 className="text-[14px] font-semibold text-ink">縣市故障分布</h3></div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
            <tr className="border-b border-border">
              <th className="font-medium px-3 py-2 text-left whitespace-nowrap">縣市</th>
              <th className="font-medium px-2 py-2 text-right whitespace-nowrap">DCU總數</th>
              <th className="font-medium px-2 py-2 text-right whitespace-nowrap">連線數</th>
              <th className="font-medium px-2 py-2 text-right whitespace-nowrap">斷線數</th>
              <th className="font-medium px-2 py-2 text-right whitespace-nowrap">讀表率</th>
              <th className="font-medium px-3 py-2 text-left whitespace-nowrap">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} onClick={() => setCity(s.name)} className="border-b border-divider cursor-pointer hover:bg-inset/40">
                <td className="px-3 py-2 font-semibold text-ink whitespace-nowrap">{s.name}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-sub">{fmtInt(s.dcuTotal)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink">{fmtInt(s.dcuOnline)}</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium" style={{ color: s.dcuOffline > 0 ? '#DB3B36' : '#2A2125' }}>{fmtInt(s.dcuOffline)}</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium" style={{ color: s.readRate < 95 ? '#DB3B36' : '#2A2125' }}>{s.readRate.toFixed(1)}%</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: SEVERITY_COLOR[s.severity] === '#DCE3DD' ? '#6B5E62' : SEVERITY_COLOR[s.severity] }}>
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEVERITY_COLOR[s.severity] }} />{SEVERITY_LABEL[s.severity]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-3 py-2 border-t border-border text-[11px] text-ink-mut">點縣市（或地圖上的縣市）進入該縣市的行政區故障地圖。</div>
    </div>
  )
}

/* ------------------------------ 右② DCU 列表（DCU 裝置列表的列表功能就地復現） ------------------------------ */
const PROTOCOLS = ['DCU', 'LTE', 'NB-IoT'] as const

/** fleet DCU → 裝置列表的 DcuRow（供 DCU資料 抽屜共用同一組欄位） */
function toDcuRow(d: Dcu, stat: DcuStat): DcuRow {
  return {
    status: d.online ? 'online' : 'offline',
    model: d.id, serial: d.code,
    online: stat.online, total: stat.total, read: stat.read,
    percent: Math.round(stat.readRate),
    alarms: !d.online || stat.readRate < 50 ? 1 : 0,
  }
}

function DcuListTable() {
  const level = useWarroom((s) => s.level)
  const city = useWarroom((s) => s.city)
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  // 點同一台＝收合電表列表（比照裝置列表）
  const toggleDcu = useWarroom((s) => s.toggleDcu)
  const setHoverDcuId = useWarroom((s) => s.setHoverDcuId) // A3：列表 hover → 地圖高亮
  useEffect(() => () => setHoverDcuId(null), [setHoverDcuId]) // 卸載時清 hover，避免高亮殘留
  // 狀態篩選放在 store，KPI 卡點擊可直接帶入
  const stateFilter = useWarroom((s) => s.listFilter)
  const setStateFilter = useWarroom((s) => s.setListFilter)
  const closeDcuList = useWarroom((s) => s.closeDcuList)

  const [protocol, setProtocol] = useState<(typeof PROTOCOLS)[number]>('DCU')
  const [idQ, setIdQ] = useState('')
  const [codeQ, setCodeQ] = useState('')
  const [menu, setMenu] = useState<null | 'state' | 'id' | 'code'>(null)
  // 默認：讀表率由低到高
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [copied, setCopied] = useState<string | null>(null)
  const [infoDcu, setInfoDcu] = useState<DcuRow | null>(null)
  const [settingsDcu, setSettingsDcu] = useState<DcuRow | null>(null)
  // 詳細資料改彈窗（與電表詳細資料同模式），不再整頁跳轉離開總覽
  const [detailDcu, setDetailDcu] = useState<string | null>(null)

  const scoped = useMemo(() => dcusInScope(level, city, district).map((d) => ({ d, stat: dcuStat(d.id), mis: misassignedOfDcu(d.id).length })), [level, city, district])
  const rows = useMemo(() => {
    const list = scoped.filter(({ d }) =>
      (stateFilter === 'all' ||
        (stateFilter === 'online' ? d.state !== 'offline' : d.state === stateFilter)) &&
      d.id.toLowerCase().includes(idQ.trim().toLowerCase()) &&
      d.code.toLowerCase().includes(codeQ.trim().toLowerCase()))
    return [...list].sort((a, b) => (sortDir === 'asc' ? a.stat.readRate - b.stat.readRate : b.stat.readRate - a.stat.readRate))
  }, [scoped, stateFilter, idQ, codeQ, sortDir])

  const sum = useMemo(() => scoped.reduce((s, { stat }) => ({ online: s.online + stat.online, total: s.total + stat.total }), { online: 0, total: 0 }), [scoped])
  // 無限捲動取代分頁器
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, hasMore } = useInfiniteRows(rows.length, [stateFilter, idQ, codeQ, sortDir, level, city, district])
  const pageRows = rows.slice(0, visible)
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(t)
      window.setTimeout(() => setCopied((c) => (c === t ? null : c)), 1200)
    }, () => {})
  }

  return (
    <div className="flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {level === 'taiwan' && (
            <button onClick={closeDcuList} className="text-ink-sub hover:text-brand" title="返回縣市故障分布"><ArrowLeft size={16} /></button>
          )}
          <h3 className="text-[14px] font-semibold text-ink whitespace-nowrap">
            DCU 列表{level === 'taiwan' && <span className="ml-1 text-[12px] font-normal text-ink-sub">全台</span>}
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {stateFilter !== 'all' && (
            <button onClick={() => setStateFilter('all')} className="inline-flex items-center gap-1 rounded-md border border-brand text-brand px-2 py-0.5 text-[11.5px] font-medium hover:bg-brand-soft/50">
              {stateFilter === 'online' ? '連線' : stateFilter === 'offline' ? '斷線' : stateFilter === 'disabled' ? '停用' : '正常'}
              <X size={11} />
            </button>
          )}
          <div className="flex items-center gap-2.5 text-[11.5px] text-ink-sub">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />＜50%</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: statusTok.warning.fg }} />50-80%</span>
          </div>
          <div className="text-[11.5px] text-ink-sub tabular-nums">上線數 <b className="text-ink">{fmtInt(sum.online)}</b> / 總數 <b className="text-ink">{fmtInt(sum.total)}</b></div>
          <div className="flex items-center gap-0.5 rounded-lg bg-inset p-0.5">
            {PROTOCOLS.map((p) => (
              <button key={p} onClick={() => setProtocol(p)} className={['px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors', protocol === p ? 'bg-surface text-ink shadow-card' : 'text-ink-sub hover:text-ink'].join(' ')}>{p}</button>
            ))}
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
            <tr className="border-b border-border">
              <BitTh>
                <FilterHead label="狀態" open={menu === 'state'} onToggle={() => setMenu(menu === 'state' ? null : 'state')}>
                  {(['all', 'online', 'active', 'offline', 'disabled'] as DcuListFilter[]).map((s) => (
                    <MenuItem key={s} active={stateFilter === s} onClick={() => { setStateFilter(s); setMenu(null) }}>
                      {s === 'all' ? '全部' : s === 'online' ? '連線' : s === 'active' ? '正常' : s === 'offline' ? '斷線' : '停用'}
                    </MenuItem>
                  ))}
                </FilterHead>
              </BitTh>
              <BitTh>
                <SearchHead label="DCU" value={idQ} open={menu === 'id'} onToggle={() => setMenu(menu === 'id' ? null : 'id')} onChange={setIdQ} />
              </BitTh>
              <BitTh>
                <SearchHead label="DCU編號" value={codeQ} open={menu === 'code'} onToggle={() => setMenu(menu === 'code' ? null : 'code')} onChange={setCodeQ} />
              </BitTh>
              <BitTh>上線 / 總數</BitTh>
              <BitTh>讀表</BitTh>
              <BitTh>
                <SortHead label="讀表率" active dir={sortDir} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
              </BitTh>
              <BitTh className="w-[108px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ d, stat, mis }) => {
              const on = selectedDcuId === d.id
              const row = toDcuRow(d, stat)
              return (
                <tr key={d.id} onClick={() => toggleDcu(d.id)} onMouseEnter={() => setHoverDcuId(d.id)} onMouseLeave={() => setHoverDcuId(null)} title={on ? '再次點擊收合電表列表' : '檢視此 DCU 的電表列表'} className={`border-b border-divider cursor-pointer ${on ? 'bg-brand-soft/60' : 'hover:bg-inset/40'}`}>
                  <td className="px-3 py-2"><StatePill state={d.state} /></td>
                  <td className="px-3 py-2"><span className={`font-mono ${on ? 'text-brand font-semibold' : 'text-ink'}`}>{d.id}</span></td>
                  <td className="px-3 py-2 font-mono text-ink-sub">{d.code}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-sub">{fmtInt(stat.online)} / {fmtInt(stat.total)}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{fmtInt(stat.read)}</td>
                  <td className="px-3 py-2"><PercentBadge percent={stat.readRate} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {mis > 0 && <span className="grid place-items-center h-4 min-w-4 px-1 rounded-full text-white text-[10px] font-bold" style={{ background: '#E8862B' }} title={`歸屬錯誤電表 ${mis} 顆`}>{mis}</span>}
                      {row.alarms > 0 && <span className="grid place-items-center h-4 min-w-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold">{row.alarms}</span>}
                      <button onClick={() => copy(d.code)} title="複製 DCU 編號" className="text-ink-mut hover:text-brand">
                        {copied === d.code ? <Check size={14} className="text-normal" /> : <Copy size={14} />}
                      </button>
                      <button onClick={() => setDetailDcu(d.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={14} /></button>
                      <button onClick={() => setInfoDcu(row)} title="DCU資料" className="text-ink-mut hover:text-brand"><Info size={14} /></button>
                      <button onClick={() => setSettingsDcu(row)} title="裝置設定" className="text-ink-mut hover:text-brand"><Settings size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-mut">查無符合條件的 DCU</td></tr>}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <div className="shrink-0">
        <InfiniteFooter loaded={pageRows.length} total={rows.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      {infoDcu && <DcuInfoDrawer dcu={infoDcu} onClose={() => setInfoDcu(null)} />}
      {settingsDcu && <DcuSettingsModal dcu={settingsDcu} onClose={() => setSettingsDcu(null)} />}
      {detailDcu && <DcuDetailModal model={detailDcu} onClose={() => setDetailDcu(null)} />}
    </div>
  )
}

/* ------------------------------ 右③ 電表列表（點選 DCU 才展開；欄位與 DCU 裝置列表的電表面板一致） ------------------------------ */
/** 「N 分鐘前 / 前一小時」→ 可排序的分鐘數 */
function minsAgo(last: string) {
  const m = last.match(/(\d+)/)
  return m ? Number(m[1]) : 60
}
type MeterStatusFilter = 'all' | 'online' | 'offline'
type MeterSortKey = 'lqi' | 'time'

function MeterListTable() {
  const district = useWarroom((s) => s.district)
  const selectedDcuId = useWarroom((s) => s.selectedDcuId)
  const selectDcu = useWarroom((s) => s.selectDcu)
  const selectMeter = useWarroom((s) => s.selectMeter)
  const selectedMeterId = useWarroom((s) => s.selectedMeterId)

  // 全部電表 ／ 歸屬錯誤（實際收容 ≠ 白名單應屬）
  const [misOnly, setMisOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<MeterStatusFilter>('all')
  const [q, setQ] = useState({ meterNo: '', elecNo: '' })
  const [menu, setMenu] = useState<null | 'status' | 'meterNo' | 'elecNo'>(null)
  const [sortKey, setSortKey] = useState<MeterSortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailMeter, setDetailMeter] = useState<string | null>(null)
  const [infoMeter, setInfoMeter] = useState<DcuMeterRow | null>(null)
  const [settingsMeter, setSettingsMeter] = useState<DcuMeterRow | null>(null)

  // 補齊裝置列表面板的欄位（電號 / FAN ID / LQI —— demo 由表號推導，上線改 API 欄位）
  const all = useMemo(() => (selectedDcuId
    ? metersOfDcu(selectedDcuId).map((m) => ({ m, ext: meterRowOf(m.id, m.dcuId, m.online) }))
    : []), [selectedDcuId])
  const online = all.filter(({ m }) => m.online).length
  const misCount = selectedDcuId ? all.filter(({ m }) => m.expectedDcuId !== m.dcuId).length : 0
  const setSearch = (k: keyof typeof q, v: string) => setQ((s) => ({ ...s, [k]: v }))
  const toggleSort = (key: MeterSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }
  const rows = useMemo(() => {
    const list = all.filter(({ m, ext }) =>
      (!misOnly || m.expectedDcuId !== m.dcuId) &&
      (statusFilter === 'all' || (statusFilter === 'online') === m.online) &&
      m.id.toLowerCase().includes(q.meterNo.trim().toLowerCase()) &&
      ext.elecNo.toLowerCase().includes(q.elecNo.trim().toLowerCase()))
    return [...list].sort((a, b) => {
      const d = sortKey === 'lqi' ? a.ext.signal - b.ext.signal : minsAgo(a.m.last) - minsAgo(b.m.last)
      return sortDir === 'asc' ? d : -d
    })
  }, [all, misOnly, statusFilter, q, sortKey, sortDir])

  // 無限捲動取代分頁器
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible, sentinelRef, revealIndex, hasMore } = useInfiniteRows(rows.length, [selectedDcuId, misOnly, statusFilter, q, sortKey, sortDir])
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
          <h3 className="text-[14px] font-semibold text-ink whitespace-nowrap">電表列表 <span className="text-ink-sub font-normal">/ DCU: {selectedDcuId ?? '未選取'}</span></h3>
        </div>
        {selectedDcuId && (
          <div className="flex items-center gap-3">
            {/* 全部 ／ 歸屬錯誤 切換：歸屬錯誤＝實際收容但白名單不屬於本 DCU，配合地圖警示點除錯 */}
            <div className="flex items-center gap-0.5 rounded-lg bg-inset p-0.5">
              <button onClick={() => setMisOnly(false)} className={['px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors', !misOnly ? 'bg-surface text-ink shadow-card' : 'text-ink-sub hover:text-ink'].join(' ')}>全部</button>
              <button onClick={() => setMisOnly(true)} className={['px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors inline-flex items-center gap-1', misOnly ? 'bg-surface shadow-card' : 'text-ink-sub hover:text-ink'].join(' ')} style={misOnly ? { color: '#E8862B' } : undefined}>
                歸屬錯誤
                {misCount > 0 && <span className="grid place-items-center h-4 min-w-4 px-1 rounded-full text-white text-[10px] font-bold" style={{ background: '#E8862B' }}>{misCount}</span>}
              </button>
            </div>
            <span className="text-[12px] text-ink-sub tabular-nums">上線數 <b className="text-ink">{fmtInt(online)}</b> / 總數 <b className="text-ink">{fmtInt(all.length)}</b></span>
          </div>
        )}
      </div>
      {selectedDcuId ? (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="sticky top-0 bg-surface z-10 text-ink-sub">
                <tr className="border-b border-border">
                  <BitTh>
                    <FilterHead label="狀態" open={menu === 'status'} onToggle={() => setMenu(menu === 'status' ? null : 'status')}>
                      {(['all', 'online', 'offline'] as MeterStatusFilter[]).map((s) => (
                        <MenuItem key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setMenu(null) }}>
                          {s === 'all' ? '全部' : s === 'online' ? '連線' : '斷線'}
                        </MenuItem>
                      ))}
                    </FilterHead>
                  </BitTh>
                  <BitTh>
                    <SearchHead label="表號" value={q.meterNo} open={menu === 'meterNo'} onToggle={() => setMenu(menu === 'meterNo' ? null : 'meterNo')} onChange={(v) => setSearch('meterNo', v)} />
                  </BitTh>
                  <BitTh>
                    <SearchHead label="電號" value={q.elecNo} open={menu === 'elecNo'} onToggle={() => setMenu(menu === 'elecNo' ? null : 'elecNo')} onChange={(v) => setSearch('elecNo', v)} />
                  </BitTh>
                  <BitTh>FAN ID</BitTh>
                  <BitTh>
                    <SortHead label="LQI" active={sortKey === 'lqi'} dir={sortDir} onClick={() => toggleSort('lqi')} />
                  </BitTh>
                  <BitTh>
                    <SortHead label="更新時間" active={sortKey === 'time'} dir={sortDir} onClick={() => toggleSort('time')} />
                  </BitTh>
                  <BitTh className="w-[86px]" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ m, ext }) => {
                  const mis = m.expectedDcuId !== m.dcuId
                  return (
                    <tr key={m.id} ref={selectedMeterId === m.id ? selRowRef : undefined} onClick={() => selectMeter(m.id)} className={`border-b border-divider cursor-pointer ${selectedMeterId === m.id ? 'bg-brand-soft/60' : 'hover:bg-inset/40'}`}>
                      <td className="px-3 py-2"><StatusPill status={m.online ? 'online' : 'offline'} /></td>
                      <td className="px-3 py-2 font-mono text-ink">
                        {mis && <span className="mr-1 text-[11px] font-bold" style={{ color: '#E8862B' }} title={`歸屬錯誤：白名單應屬 ${m.expectedDcuId}`}>⚠</span>}
                        {m.id}{!!district && m.district !== district && <span className="ml-1 text-[10px] text-ink-mut">跨區</span>}
                        {mis && <div className="text-[10px] font-sans font-medium" style={{ color: '#E8862B' }}>應屬 {m.expectedDcuId}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-sub">{ext.elecNo}</td>
                      <td className="px-3 py-2 font-mono text-ink-sub">{ext.fanMac.slice(0, 14)}</td>
                      <td className="px-3 py-2 tabular-nums text-ink">{ext.signal || '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap">{m.last}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setDetailMeter(m.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={14} /></button>
                          <button onClick={() => setInfoMeter(ext)} title="電表資料" className="text-ink-mut hover:text-brand"><Info size={14} /></button>
                          <button onClick={() => setSettingsMeter(ext)} title="裝置設定" className="text-ink-mut hover:text-brand"><Settings size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {pageRows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-mut">{misOnly ? '此 DCU 無歸屬錯誤電表' : '查無符合條件的電表'}</td></tr>}
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
      {infoMeter && <MeterInfoDrawer meter={infoMeter} onClose={() => setInfoMeter(null)} />}
      {settingsMeter && <MeterSettingsModal meter={settingsMeter} onClose={() => setSettingsMeter(null)} />}
      {/* 電號 / FAN ID / LQI 為 demo 推導值（meterRowOf）；上線改 API 欄位 */}
    </div>
  )
}

