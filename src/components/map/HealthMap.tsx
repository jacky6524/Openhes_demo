import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoMercator, geoPath } from 'd3-geo'
import { useDashboard, useCurrentNode } from '@/store/useDashboard'
import { COUNTY_NODES, getById } from '@/data/mockData'
import { geoForNode, fitTargetGeo } from '@/data/geo/geo'
import { metricHealth } from '@/lib/health'
import { health as healthTokens, noMeter, HEALTH_FILL_OPACITY } from '@/tokens'
import { MapNav } from './Breadcrumb'
import { LevelStats } from './LevelStats'
import { IslandInset } from './IslandInset'

// canvas ratio per Figma 3031-11714 (856×760) — taller map panel
const W = 856
const H = 760

// 地圖著色綁 LP 讀表率
const MAP_UPDATE_NOTE = '更新時間：每小時（整點）'

/**
 * 台灣健康地圖 — 外框與浮層位置對齊前端 MapLibreDashboardMap.vue：
 *   .map-header       padding 10px 12px，只放麵包屑（前端沒有另外的區塊標題）
 *   .map-shell        margin 0 12 12；border #e2d8db；radius 10；bg #f7f4f4
 *   .map-stat-card    左上 14/14
 *   .island-shortcuts 右下、圖例上方（前端把離島放右側，不是左側）
 *   .map-legend       右下 14/14
 *   .map-region-tooltip 230px 白底浮框 + 狀態 pill
 *
 * 2026-11-17 同步正式機截圖：區域名標籤（L1 縣市；業主補充 L2／L3 也要標行政區名）；無電表改實心淺灰（原斜線紋）；離島框改為
 * 澎湖／金門／連江並移到右下角；拿掉右下圖例條與左下操作提示（左上統計卡已兼圖例）。
 */

/**
 * 縣市名配色依底色決定（2026-11-17 業主：黑字白邊看不清楚）：比照正式機，紅底用白字＋深紅細描邊，
 * 其餘（綠／黃／無電表灰）用深字＋與底色同色的細描邊——壓到縣界時仍可讀，又不會像白邊那樣糊成一團。
 */
type LabelCat = 'good' | 'warning' | 'alert' | 'muted'
const LABEL_STYLE: Record<LabelCat, { fill: string; stroke: string }> = {
  good: { fill: '#2D2629', stroke: healthTokens.good.fill },
  warning: { fill: '#2D2629', stroke: healthTokens.warning.fill },
  alert: { fill: '#FFFFFF', stroke: healthTokens.alert.stroke },
  muted: { fill: '#4F4549', stroke: noMeter.fill },
}

// 小縣市標籤會互相壓到，比照正式機截圖手動錯開（單位：畫布 px）
const LABEL_NUDGE: Record<string, [number, number]> = {
  CYI: [-26, 4], // 嘉義市 → 往西
  CYC: [30, 0], // 嘉義縣（包住嘉義市）→ 往東
  KEE: [16, -8], // 基隆市
  TPE: [-8, 4], // 台北市
}

/** 狀態 pill 配色 — 前端 `.region-status--*` */
const STATUS_PILL: Record<'good' | 'warning' | 'alert' | 'muted', { dot: string; bg: string; fg: string }> = {
  // dot 取 tokens.health 的原色；bg／fg 與三色同色相（2026-11-04 三色協調）：bg 一律極淡（OKLCH L≈0.975），
  // fg 一律深到白底可讀（L≈0.46–0.50）
  good: { dot: healthTokens.good.accent, bg: '#EEF8EE', fg: '#3F7A42' },
  warning: { dot: healthTokens.warning.accent, bg: '#FEF6E4', fg: '#7B5600' },
  alert: { dot: healthTokens.alert.accent, bg: '#FFF0EE', fg: '#AF2B25' },
  muted: { dot: '#C9CDD4', bg: '#F4F1F2', fg: '#958A8E' },
}

interface HoverInfo {
  name: string
  lpRate: number | null // null = 無電表
  label: string
  cat: 'good' | 'warning' | 'alert' | 'muted'
  x: number
  y: number
  right: boolean
}

export function HealthMap() {
  const node = useCurrentNode()
  const drillInto = useDashboard((s) => s.drillInto)
  const depth = useDashboard((s) => s.drillPath.length)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  // 換層級時清掉上一層殘留的 hover 浮框（點擊下鑽時滑鼠沒移動，不會觸發 mouseleave）
  useEffect(() => setHover(null), [node])

  // geographies for the current level + a projection LOCKED (fitted) to it.
  const { geographies, projection } = useMemo(() => {
    const geos = geoForNode(node, COUNTY_NODES)
    const fit = fitTargetGeo(node, COUNTY_NODES)
    const proj = geoMercator()
    const pad = 28
    if (fit.features.length) {
      proj.fitExtent(
        [
          [pad, pad],
          [W - pad, H - pad],
        ],
        fit as any,
      )
    }
    return { geographies: geos, projection: proj }
  }, [node])

  // 區域名標籤（L1 縣市、L2 行政區、L3 該區）：同一個 rid 可能有多筆圖形（合併群組、離島），
  // 取「投影後面積最大的那塊多邊形」的重心放名字，避免被外島拉偏或重複標示
  const labels = useMemo(() => {
    const path = geoPath(projection as any)
    const best = new Map<string, { area: number; poly: any; name: string }>()
    for (const f of geographies.features as any[]) {
      const g = f.geometry
      if (!g) continue
      const parts = g.type === 'MultiPolygon'
        ? g.coordinates.map((c: unknown) => ({ type: 'Polygon', coordinates: c }))
        : [g]
      const id = f.properties.rid as string
      for (const poly of parts) {
        const area = path.area(poly)
        const cur = best.get(id)
        if (!cur || area > cur.area) best.set(id, { area, poly, name: f.properties.rname as string })
      }
    }
    const size = node.id === 'TW' ? 13 : 12
    const all = [...best.entries()].map(([id, { area, poly, name }]) => {
      const [x, y] = path.centroid(poly)
      const [dx, dy] = (node.id === 'TW' && LABEL_NUDGE[id]) || [0, 0]
      const region = getById(id)
      const cat: LabelCat = !region || region.metrics.meterTotal === 0 ? 'muted' : metricHealth(region.metrics, 'lp')
      return { id, name, area, x: x + dx, y: y + dy, cat }
    })
    if (node.id === 'TW') return all // 全台已手動錯開
    // 行政區層：市中心小區常擠在一起 → 由大到小放，與已放的字框重疊就不標（滑過仍有浮框顯示名稱）
    const placed: { l: number; r: number; t: number; b: number }[] = []
    return all
      .sort((a, b) => b.area - a.area)
      .filter((l) => {
        const w = l.name.length * size + 4
        const box = { l: l.x - w / 2, r: l.x + w / 2, t: l.y - size / 2 - 2, b: l.y + size / 2 + 2 }
        if (placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)) return false
        placed.push(box)
        return true
      })
  }, [node, geographies, projection])

  const isRoot = node.id === 'TW'

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* .map-header — 只有麵包屑 / 返回 */}
      <header className="flex shrink-0 items-center justify-start px-3 py-2.5">
        <MapNav />
      </header>

      {/* .map-shell — wheel/pinch zoom intentionally NOT wired (locked zoom) */}
      <div
        ref={canvasRef}
        className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-[10px] border"
        style={{ borderColor: '#E2D8DB', background: '#F7F4F4' }}
      >
        {/* key on depth+id forces a fade-in on each level change (smooth, no jump) */}
        <div key={`${depth}-${node.id}`} className="map-fade map-transition absolute inset-0">
          <ComposableMap
            projection={projection as any}
            width={W}
            height={H}
            style={{ width: '100%', height: '100%' }}
          >
            <Geographies geography={geographies}>
              {({ geographies: features }) =>
                features.map((geo) => {
                  const rid = geo.properties.rid as string
                  const region = getById(rid)
                  // 無電表 (未部署) → 實心淺灰，不參與健康著色 / highlight
                  const noData = !region || region.metrics.meterTotal === 0
                  // map主視覺永遠綁定 LP 讀表率 — 切換其他指標不改變地圖主色邏輯
                  const h = region ? metricHealth(region.metrics, 'lp') : 'good'
                  const tone = healthTokens[h]
                  const baseFill = noData ? noMeter.fill : tone.fill
                  const baseStroke = noData ? noMeter.stroke : tone.stroke
                  const onMove = (e: MouseEvent) => {
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (!rect || !region) return
                    const x = e.clientX - rect.left
                    setHover({
                      name: region.name,
                      lpRate: noData ? null : region.metrics.lpRate,
                      label: noData ? noMeter.label : healthTokens[h].label,
                      cat: noData ? 'muted' : h,
                      x,
                      y: e.clientY - rect.top,
                      right: x > rect.width * 0.6,
                    })
                  }
                  return (
                    <Geography
                      // 合併群組(同 rid)含多筆 polygon，改用 TOWNCODE 保證 key 唯一
                      key={(geo.properties.TOWNCODE as string) ?? rid}
                      geography={geo}
                      // 無電表 → 無下一層資料，禁止下鑽（仍可 hover 檢視資訊）
                      onClick={() => region && !noData && drillInto(region)}
                      onMouseMove={onMove}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: {
                          fill: baseFill,
                          fillOpacity: noData ? 1 : HEALTH_FILL_OPACITY,
                          stroke: baseStroke,
                          strokeWidth: noData ? 0.6 : 0.75,
                          outline: 'none',
                          cursor: noData ? 'default' : 'pointer',
                        },
                        hover: {
                          fill: baseFill,
                          // 無電表區塊 hover 不強調 (維持淺灰、不變白框) 以示不可點
                          fillOpacity: 1,
                          stroke: noData ? baseStroke : '#FFFFFF',
                          strokeWidth: noData ? 0.6 : 1.4,
                          outline: 'none',
                          cursor: noData ? 'default' : 'pointer',
                        },
                        pressed: {
                          fill: noData ? baseFill : tone.stroke,
                          fillOpacity: 1,
                          stroke: noData ? baseStroke : '#FFFFFF',
                          strokeWidth: noData ? 0.6 : 1.4,
                          outline: 'none',
                        },
                      }}
                    />
                  )
                })
              }
            </Geographies>
            {/* 區域名（不接滑鼠事件，點擊仍落在底下的區塊） */}
            <g pointerEvents="none">
              {labels.map((l) => (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={node.id === 'TW' ? 13 : 12}
                  fontWeight={600}
                  fill={LABEL_STYLE[l.cat].fill}
                  stroke={LABEL_STYLE[l.cat].stroke}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {l.name}
                </text>
              ))}
            </g>
          </ComposableMap>
        </div>

        {/* .map-region-tooltip — 名稱 / 狀態 pill / LP讀表率 / 更新時間 */}
        {hover && (
          <aside
            className="pointer-events-none absolute z-30 box-border w-[230px] rounded-[9px] border px-3.5 pb-[11px] pt-[13px]"
            style={{
              top: Math.max(6, hover.y - 12),
              left: hover.right ? undefined : hover.x + 14,
              right: hover.right ? `calc(100% - ${hover.x - 14}px)` : undefined,
              borderColor: '#EADFE1',
              background: 'rgba(255,255,255,.98)',
              boxShadow: '0 10px 24px rgba(58,42,48,.16)',
              color: '#3D3438',
            }}
          >
            <strong className="mb-2.5 block text-[14px]" style={{ color: '#2D2629' }}>
              {hover.name}
            </strong>
            <dl className="m-0 grid gap-[9px]">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[13px]" style={{ color: '#8E8286' }}>
                  狀態
                </dt>
                <dd
                  className="m-0 inline-flex items-center gap-[5px] rounded-md px-[7px] py-[3px] text-[13px] font-bold"
                  style={{ background: STATUS_PILL[hover.cat].bg, color: STATUS_PILL[hover.cat].fg }}
                >
                  <i className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_PILL[hover.cat].dot }} />
                  {hover.label}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[13px]" style={{ color: '#8E8286' }}>
                  LP讀表率
                </dt>
                <dd className="m-0 text-[13px] tabular-nums" style={{ color: '#3D3438' }}>
                  {hover.lpRate === null ? '無資料' : `${hover.lpRate.toFixed(1)}%`}
                </dd>
              </div>
            </dl>
            <footer className="mt-2.5 border-t pt-[9px] text-[11px]" style={{ borderColor: '#EEE7E9', color: '#AAA0A3' }}>
              {MAP_UPDATE_NOTE}
            </footer>
          </aside>
        )}

        {/* .map-stat-card — 當前層級狀態統計，左上 */}
        <div className="absolute left-3.5 top-3.5 z-[2]">
          <LevelStats />
        </div>

        {/* .island-shortcuts — 離島（澎湖 / 金門 / 連江），右下角；僅全台層級 */}
        {isRoot && (
          <div
            className="absolute bottom-3.5 right-3.5 z-[2] box-border grid w-[136px] justify-items-center gap-1.5 rounded-lg border p-[9px]"
            style={{
              borderColor: '#EADFE1',
              background: 'rgba(255,255,255,.95)',
              boxShadow: '0 8px 20px rgba(58,42,48,.12)',
            }}
          >
            <strong className="w-full text-[12px]" style={{ color: '#6F6267' }}>
              離島
            </strong>
            <IslandInset countyNodes={COUNTY_NODES} regionId="PEH" label="澎湖" width={96} height={46} />
            <IslandInset countyNodes={COUNTY_NODES} regionId="KMN" label="金門" width={96} height={46} />
            <IslandInset countyNodes={COUNTY_NODES} regionId="LJU" label="連江" width={96} height={46} />
          </div>
        )}
      </div>
    </div>
  )
}
