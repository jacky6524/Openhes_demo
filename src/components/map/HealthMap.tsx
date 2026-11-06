import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoMercator } from 'd3-geo'
import { useDashboard, useCurrentNode } from '@/store/useDashboard'
import { COUNTY_NODES, getById } from '@/data/mockData'
import { geoForNode, fitTargetGeo } from '@/data/geo/geo'
import { metricHealth } from '@/lib/health'
import { health as healthTokens, noMeter, HEALTH_FILL_OPACITY } from '@/tokens'
import { MapNav } from './Breadcrumb'
import { Legend } from './Legend'
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
 */

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
            {/* 斜線紋 — 無電表區域填色，與健康色系明確區隔 */}
            <defs>
              <pattern
                id="noMeterHatch"
                width={7}
                height={7}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={7} height={7} fill={noMeter.fill} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={noMeter.stroke} strokeWidth={1.6} />
              </pattern>
            </defs>
            <Geographies geography={geographies}>
              {({ geographies: features }) =>
                features.map((geo) => {
                  const rid = geo.properties.rid as string
                  const region = getById(rid)
                  // 無電表 (未部署) → 斜線紋，不參與健康著色 / highlight
                  const noData = !region || region.metrics.meterTotal === 0
                  // map主視覺永遠綁定 LP 讀表率 — 切換其他指標不改變地圖主色邏輯
                  const h = region ? metricHealth(region.metrics, 'lp') : 'good'
                  const tone = healthTokens[h]
                  const baseFill = noData ? 'url(#noMeterHatch)' : tone.fill
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
                          // 無電表區塊 hover 不強調 (維持斜線紋、不變白框) 以示不可點
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
                  {hover.lpRate === null ? '無資料' : `${hover.lpRate.toFixed(2)}%`}
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

        {/* .island-shortcuts — 離島（金門 / 馬祖），右下、圖例上方；僅全台層級 */}
        {isRoot && (
          <div
            className="absolute bottom-[58px] right-3.5 z-[2] box-border grid w-[116px] justify-items-center gap-1.5 rounded-lg border p-[9px]"
            style={{
              borderColor: '#EADFE1',
              background: 'rgba(255,255,255,.95)',
              boxShadow: '0 8px 20px rgba(58,42,48,.12)',
            }}
          >
            <strong className="w-full text-[12px]" style={{ color: '#6F6267' }}>
              離島
            </strong>
            <IslandInset countyNodes={COUNTY_NODES} regionId="LJU" label="馬祖" />
            <IslandInset countyNodes={COUNTY_NODES} regionId="KMN" label="金門" />
          </div>
        )}

        {/* .map-legend — 右下 */}
        <div className="absolute bottom-3.5 right-3.5 z-[2]">
          <Legend />
        </div>

        {/* .map-note — 操作提示，左下（前端此格為空，保留 prototype 的導引文字） */}
        <div
          className="absolute bottom-3.5 left-3.5 z-[2] rounded-lg border px-2.5 py-2 text-[12px]"
          style={{
            borderColor: '#EADFE1',
            background: 'rgba(255,255,255,.95)',
            boxShadow: '0 8px 20px rgba(58,42,48,.12)',
            color: '#9F9397',
          }}
        >
          {node.level === 'L3'
            ? '返回可回到縣市 / 全台'
            : node.level === 'L2'
              ? '點行政區 → 單獨顯示 + DCU 詳情'
              : '點縣市 → 向下鑽取'}
        </div>
      </div>
    </div>
  )
}
