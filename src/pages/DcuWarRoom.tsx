import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronRight, Crosshair, ArrowLeft, MousePointerClick, ClipboardList, Info, Settings, X, Ban } from 'lucide-react'
import {
  Th as BitTh, StatusPill, SortHead, FilterHead, SearchHead, MenuItem,
  useInfiniteRows, InfiniteFooter, RED, StampLines, type SortDir,
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
  SEVERITY_COLOR, SEVERITY_STROKE, SEVERITY_ACCENT, SEVERITY_LABEL, STATE_COLOR,
  FREQ_COLORS, MIS_COLOR, CLUSTER_COLOR, CLUSTER_TEXT, SELECT_FILL, MAP_BG, MAP_BORDER,
} from '@/components/warroom/warroomConfig'
import { useWarroom, type DcuListFilter } from '@/store/useWarroom'
import {
  misassignedInScope, officeOf, isSameDay,
  metersOfDcu, cityStats, aggStat, dcusInScope, ONLINE_RATE_THRESHOLDS, type Dcu, type Meter,
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
    // 頁底與系統總覽一致（`bg-dashboard` 玫瑰漸層）；原本沿用 AppShell 的灰底 bg-bg，
    // 兩頁切換時背景會跳色。2026-09-03 依業主意見以系統總覽為準。
    <div className="h-full flex flex-col p-4 gap-3 min-w-[1320px] bg-dashboard">
      <FilterBar />
      <div className="flex-1 min-h-0 grid grid-cols-[880fr_736fr] gap-3">
        {/* 外框與系統總覽的地圖模組一致：白卡片 + p-3 內距，標題列在上、圓角畫布在下 */}
        <div className="min-h-0 rounded-card bg-surface border border-border shadow-card p-3 flex flex-col">
          <div className="shrink-0 px-1 pb-2 flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">DCU 監控地圖</h3>
            <span className="flex-1" />
            <MapTabs />
          </div>
          {/* 畫布底色與外框比照系統總覽的地圖（MAP_BG／MAP_BORDER），兩頁切換時不跳色 */}
          <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border" style={{ background: MAP_BG, borderColor: MAP_BORDER }}>
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
/**
 * 地圖圖例（左下）—— 2026-08-27 依業主意見補齊：原本只列了一部分編碼，
 * 圖上實際存在但沒寫進圖例的（區塊著色、歸屬錯誤群集、斷線電表、選取標記、
 * 行政區界線）都補上了；DCU 也跟著改成方形。
 *
 * 條目一多就佔畫面，所以比照系統總覽的圖例：**收合成一列，hover 才展開完整說明**。
 * 兩個頁籤各有一套 —— 圖上沒有的東西不列，列了就一定看得到。
 */
function MapLegend() {
  const tab = useWarroom((s) => s.tab)
  const level = useWarroom((s) => s.level)
  const district = useWarroom((s) => s.district)
  // 全台／縣市（未選行政區）＝ 區域選取模式：畫區塊色塊與群集，不畫裝置點
  const pickMode = level === 'taiwan' || !district
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const RATE_BANDS = [
    { key: 'normal' as const, range: `≥${pct(ONLINE_RATE_THRESHOLDS.normal)}` },
    { key: 'warn' as const, range: `${pct(ONLINE_RATE_THRESHOLDS.warn)}–${pct(ONLINE_RATE_THRESHOLDS.normal)}` },
    { key: 'alert' as const, range: `<${pct(ONLINE_RATE_THRESHOLDS.warn)}` },
  ]

  return (
    <div className="group absolute bottom-3 left-3 z-10">
      {/* 收合列 —— 只放該頁籤最關鍵的幾個編碼 */}
      <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-surface/92 px-3 py-1.5 text-[11px] text-ink-sub shadow-card backdrop-blur">
        {tab === 'fault' ? (
          <>
            {RATE_BANDS.map(({ key }) => (
              <LgItem key={key} label={SEVERITY_LABEL[key]}><SwPoly k={key} /></LgItem>
            ))}
            <LgItem label="斷線 DCU"><SwDcuOff /></LgItem>
          </>
        ) : (
          <>
            <LgItem label="DCU"><SwDcuFreq /></LgItem>
            <LgItem label="電表"><SwMeters /></LgItem>
            <LgItem label="歸屬錯誤"><SwMisMeter /></LgItem>
          </>
        )}
        <Info size={12} className="text-ink-mut" />
      </div>

      {/* hover 展開完整圖例 */}
      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-[360px] translate-y-1 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <div className="max-h-[52vh] overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] shadow-card">
          {tab === 'fault' ? (
            <>
              <LgSection title="行政區色塊 — DCU 連線率">
                {RATE_BANDS.map(({ key, range }) => (
                  <LgRow key={key} sw={<SwPoly k={key} />} label={SEVERITY_LABEL[key]} note={range} />
                ))}
              </LgSection>
              <LgSection title="斷線 DCU">
                <LgRow sw={<SwClusterRamp />} label="斷線 DCU 匯總" note="全台一縣市一顆、縣市一行政區一顆；數字＝斷線台數，點一下下鑽" />
                <LgRow sw={<SwDcuOff />} label="單台斷線 DCU" note="hover 看詳細資訊" />
              </LgSection>
              <LgSection title="其他">
                <LgRow sw={<SwSelectedMeter />} label="選取中的電表" note="由右側清單點選" />
              </LgSection>
              <LgNote>下鑽：點縣市 → 行政區；選定行政區後圖上只留該區，換區請走上方麵包屑。</LgNote>
            </>
          ) : (
            <>
              {pickMode ? (
                <>
                  <LgSection title="行政區色塊 — DCU 連線率">
                    {RATE_BANDS.map(({ key, range }) => (
                      <LgRow key={key} sw={<SwPoly k={key} />} label={SEVERITY_LABEL[key]} note={range} />
                    ))}
                  </LgSection>
                  <LgSection title="歸屬錯誤電表">
                    <LgRow sw={<SwMisCluster />} label="歸屬錯誤電表數" note={level === 'taiwan' ? '一個縣市一顆，點一下下鑽' : '一個行政區一顆，點一下下鑽'} />
                  </LgSection>
                  <LgNote>此層級不畫裝置點。點選區域下鑽到行政區，才會出現 DCU 與電表。</LgNote>
                </>
              ) : (
                <>
                  <LgSection title="DCU（方形）">
                    <LgRow sw={<SwDcuFreq />} label="正常" note="底色＝頻點色（共 10 個頻點）" />
                    <LgRow sw={<SwDcuOff />} label="斷線" />
                    <LgRow sw={<SwDcuDisabled />} label="停用" note="僅圖面呈現，不計入統計" />
                    <LgRow sw={<SwMeterDisabled />} label="停用電表" note="灰色空心圓圈；僅圖面呈現，不計入統計" />
                    <LgRow sw={<SwCross />} label="跨區 DCU" note="本身在範圍外、收容的電表落在範圍內" />
                  </LgSection>
                  <LgSection title="電表（圓形）">
                    <LgRow sw={<SwMeters />} label="正常電表" note="依所屬 DCU 的頻點色；左下「頻點」可逐一顯示／隱藏" />
                    <LgRow sw={<SwMisMeter />} label="歸屬錯誤電表" />
                    <LgRow sw={<SwSelectedMeter />} label="選取中的電表" />
                  </LgSection>
                  <LgSection title="歸屬關係線">
                    <LgRow sw={<SwLineSolid />} label="實際收容" note="電表現在連到哪一台" />
                    <LgRow sw={<SwLineDashed />} label="白名單應屬" note="電表原本該連哪一台" />
                    <LgRow
                      sw={<span className="h-3 w-5 shrink-0" />}
                      label="方向"
                      note="他台連入＝別台的表跑進來／連入他台＝自己的表跑出去"
                    />
                  </LgSection>
                  <LgNote>電表預設不載入：點選 DCU 加入「觀察中」（最多 3 台，外環色區分），才畫出它的電表與相關歸屬錯誤。要看整區分佈可打開上方「顯示圖層」的「全部電表」（效能較差，需放大到街道級）。</LgNote>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---- 圖例的排版零件 ---- */
function LgItem({ children, label }: { children: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{children}{label}</span>
}
function LgSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[11px] font-semibold text-ink">{title}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}
function LgRow({ sw, label, note }: { sw: React.ReactNode; label: string; note?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[1px] shrink-0">{sw}</span>
      <span className="shrink-0 font-medium text-ink-sub">{label}</span>
      {note && <span className="min-w-0 flex-1 text-right leading-snug text-ink-mut">{note}</span>}
    </div>
  )
}
function LgNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 border-t border-divider pt-2 text-[11px] leading-snug text-ink-mut">{children}</div>
}

/* ---- 圖例色塊（形狀與地圖上實際畫的一致） ---- */
function SwPoly({ k }: { k: 'normal' | 'warn' | 'alert' }) {
  return <span className="inline-block h-3 w-3 rounded-[3px] border" style={{ background: SEVERITY_COLOR[k], borderColor: SEVERITY_STROKE[k] }} />
}
/** DCU 斷線：紅方塊 + 白 ✕（markerIcons 的 square(…, true)） */
function SwDcuOff() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-[4px] border-2 border-white text-[9px] font-bold leading-none text-white" style={{ background: STATE_COLOR.offline }}>
      ✕
    </span>
  )
}
/** DCU 正常：方塊，底色＝頻點色（列三個代表整組色盤） */
function SwDcuFreq() {
  return (
    <span className="inline-flex gap-0.5">
      {FREQ_COLORS.slice(0, 3).map((c) => (
        <span key={c} className="h-3.5 w-3.5 rounded-[3px] border-2 border-white shadow-sm" style={{ background: c }} />
      ))}
    </span>
  )
}
function SwDcuDisabled() {
  return <span className="inline-block h-3.5 w-3.5 rounded-[3px] border-2 border-white shadow-sm" style={{ background: STATE_COLOR.disabled }} />
}
function SwCross() {
  return <span className="inline-block h-3.5 w-3.5 rounded-[3px] border-2 border-dashed border-ink" />
}
function SwMeters() {
  return (
    <span className="inline-flex gap-0.5">
      {FREQ_COLORS.slice(0, 4).map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}
    </span>
  )
}
/** 停用電表：灰色空心圓圈（對應 markerIcons 的 circleHollow） */
function SwMeterDisabled() {
  return <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: STATE_COLOR.disabled }} />
}

function SwMisMeter() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-white text-[10px] font-extrabold leading-none text-white" style={{ background: MIS_COLOR }}>
      ?
    </span>
  )
}
function SwMisCluster() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold leading-none text-white" style={{ background: MIS_COLOR, opacity: 0.88 }}>
      12
    </span>
  )
}
function SwClusterRamp() {
  return (
    /* 2026-09-23 起匯總球統一尺寸，圖例改為單顆帶數字的球 */
    <span className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold leading-none" style={{ background: CLUSTER_COLOR, color: CLUSTER_TEXT }}>
      5
    </span>
  )
}
/** 選取電表：白暈 + 藍環 + 藍心（selectedMeterLayer 的三層） */
function SwSelectedMeter() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full border-2" style={{ borderColor: SELECT_FILL }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SELECT_FILL }} />
    </span>
  )
}
function SwLineSolid() {
  return <span className="mt-[6px] inline-block w-5 border-t-2" style={{ borderColor: MIS_COLOR }} />
}
function SwLineDashed() {
  return <span className="mt-[6px] inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#9AA0A6' }} />
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
  // 依業主意見：固定北到南、外島最後，不提供欄位排序（cityStats 已排好）
  const rows = useMemo(() => cityStats(), [])

  return (
    <div className="flex-1 min-h-0 rounded-card bg-surface border border-border shadow-card flex flex-col">
      <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">DCU 斷線分佈</h3>
        <span className="text-[12.5px] text-ink-mut">縣市 · 北到南，外島在後</span>
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
type MisSortKey = 'meterNo' | 'elecNo' | 'last' | 'lastLp' | 'expected'

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
              {head('expected', '歸屬DCU')}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ m, ext }) => (
              <tr key={m.id} onClick={() => focusMisMeter(m.id)} className="border-b border-divider cursor-pointer hover:bg-inset/40" title="跳到該電表的歸屬點位">
                <td className="px-3 py-2 font-mono text-ink whitespace-nowrap">{m.id}</td>
                <td className="px-3 py-2 font-mono text-ink-sub whitespace-nowrap">{ext.elecNo}</td>
                <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap"><StampLines value={m.last} /></td>
                <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap"><StampLines value={m.lastLp} /></td>
                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: MIS_COLOR }}>{m.expectedDcuId}</td>
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-mut">此範圍無歸屬錯誤電表</td></tr>}
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
/**
 * 列表標題列右上的狀態判斷圖例 —— 只解釋「這張表上真的會變色的欄位」，
 * 不重複列狀態 pill（那個本身已經帶文字）。兩份清單各自傳入自己的規則。
 */
function ListLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-sub">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/**
 * DCU 列表在各個篩選下的**標題** —— 篩選是由上方 KPI 方塊帶入的（列表本身已無篩選鈕）。
 * 2026-09-23 依業主意見：點了哪個方塊，列表標題就直接換成那個方塊的名稱，
 * 不再用「DCU 列表 + 篩選標籤 + 備註說明」的寫法。
 */
const LIST_TITLE: Record<Exclude<DcuListFilter, 'mis'>, string> = {
  all: 'DCU 列表',
  online: 'DCU 連線列表',
  active: 'DCU 正常列表',
  offline: 'DCU 斷線列表',
  disabled: 'DCU 停用列表',
}

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
  const title = stateFilter === 'mis' ? LIST_TITLE.all : LIST_TITLE[stateFilter]

  return (
    <div className={`${collapsed ? 'w-full' : 'flex-1 min-h-0'} rounded-card bg-surface border border-border shadow-card flex flex-col`}>
      <div className="shrink-0 flex items-center flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {/* 返回鍵不再限於全台層級：任何層級都能退回 DCU 斷線分佈（會一併回全台視角） */}
          <button
            onClick={() => (collapsed ? clearSelection() : closeDcuList())}
            className="text-ink-sub hover:text-brand"
            title={collapsed ? '返回 DCU 列表' : '返回 DCU 斷線分佈（回全台視角）'}
          >
            <ArrowLeft size={16} />
          </button>
          <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">
            {title}{level === 'taiwan' && <span className="ml-1 text-[13px] font-normal text-ink-sub">全台</span>}
          </h3>
        </div>
        <ListLegend items={[{ color: RED, label: `LP讀表率 ＜${LP_ALERT}%` }]} />
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
                  <td className="px-3 py-2 tabular-nums text-ink-sub whitespace-nowrap"><StampLines value={d.lastSeen} /></td>
                  <td className="px-3 py-2">
                    {/* 按鈕順序：DCU資料 → 詳細資料 → 裝置設定 */}
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setInfoDcu(row)} title="DCU資料" className="text-ink-mut hover:text-brand"><Info size={15} /></button>
                      <button onClick={() => setDetailDcu(d.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={15} /></button>
                      {/* 2026-10-01 業主意見：齒輪一律標「暫不啟用」（重啟DCU／Ping 也只是示意） */}
                      <button onClick={() => setSettingsDcu(row)} title="DCU裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                        <Settings size={15} />
                        <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                      </button>
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
type MeterSortKey = 'mis' | 'status' | 'elecNo' | 'meterNo' | 'lp' | 'mn'

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
        {selectedDcuId && <ListLegend items={[{ color: RED, label: '最後LP／MN 非當日' }]} />}
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
                            <span className="grid place-items-center h-4 w-4 rounded-full text-white text-[10px] font-extrabold leading-none" style={{ background: MIS_COLOR }}>?</span>
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
                      {/* LP／MN 非當日標紅 */}
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: isSameDay(m.lastLpMins) ? undefined : RED }}><StampLines value={m.lastLp} /></td>
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: isSameDay(m.lastMnMins) ? undefined : RED }}><StampLines value={m.lastMn} /></td>
                      <td className="px-2 py-2">
                        {/* 只留 詳細資料 與 裝置設定，順序同 DCU 列表 */}
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setDetailMeter(m.id)} title="詳細資料" className="text-ink-mut hover:text-brand"><ClipboardList size={15} /></button>
                          {/* 2026-10-01 業主意見：電表齒輪功能暫不啟用 → 疊禁止符號，仍可點開瀏覽 */}
                          <button onClick={() => setSettingsMeter(ext)} title="裝置設定（暫不啟用，僅供瀏覽）" className="relative inline-grid place-items-center text-ink-mut hover:text-brand">
                            <Settings size={15} />
                            <Ban size={10} strokeWidth={2.6} className="absolute -bottom-1 -right-1.5 rounded-full bg-surface text-ink-mut" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {pageRows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-mut">查無符合條件的電表</td></tr>}
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

