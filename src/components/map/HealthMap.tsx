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
const MAP_UPDATE_NOTE = '資料更新時間：每小時（整點）'

interface HoverInfo {
  name: string
  lpRate: number | null // null = 無智慧電表
  label: string
  swFill: string // 狀態色塊填色（與地圖一致）
  swStroke: string // 狀態色塊邊框（與地圖一致）
  labelColor: string // 狀態文字色
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

  return (
    <div className="relative h-full flex flex-col">
      {/* header — 標題 + breadcrumb/back（層級編碼已寫入麵包屑，右側備註移除） */}
      <div className="px-1 pb-2 flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[15px] font-semibold text-ink whitespace-nowrap">LP 讀表率狀態</h3>
          <MapNav />
        </div>
      </div>

      {/* map canvas — wheel/pinch zoom intentionally NOT wired (locked zoom) */}
      <div ref={canvasRef} className="relative flex-1 rounded-xl bg-inset/40 overflow-hidden border border-border">
        {/* key on depth+id forces a fade-in on each level change (smooth, no jump) */}
        <div key={`${depth}-${node.id}`} className="map-fade map-transition absolute inset-0">
          <ComposableMap
            projection={projection as any}
            width={W}
            height={H}
            style={{ width: '100%', height: '100%' }}
          >
            {/* 斜線紋 — 無智慧電表區域填色，與健康色系明確區隔 */}
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
                  // 無智慧電表 (未部署) → 斜線紋，不參與健康著色 / highlight
                  const noData = !region || region.metrics.meterTotal === 0
                  // map主視覺永遠綁定 LP 讀表率 — 切換其他指標不改變地圖主色邏輯
                  const h = region ? metricHealth(region.metrics, 'lp') : 'good'
                  const tone = healthTokens[h]
                  const baseFill = noData ? 'url(#noMeterHatch)' : tone.fill
                  const baseStroke = noData ? noMeter.stroke : tone.stroke
                  const hoverLabel = noData ? '無智慧電表' : healthTokens[h].label
                  // hover 狀態色塊與地圖著色一致：填色=health.fill、邊框=health.stroke
                  const swFill = noData ? noMeter.fill : healthTokens[h].fill
                  const swStroke = noData ? noMeter.stroke : healthTokens[h].stroke
                  const labelColor = noData ? noMeter.stroke : healthTokens[h].accent
                  const onMove = (e: MouseEvent) => {
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (!rect || !region) return
                    const x = e.clientX - rect.left
                    setHover({
                      name: region.name,
                      lpRate: noData ? null : region.metrics.lpRate,
                      label: hoverLabel,
                      swFill,
                      swStroke,
                      labelColor,
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
                      // 無智慧電表 → 無下一層資料，禁止下鑽（仍可 hover 檢視資訊）
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

        {/* 色塊 hover 說明 — 名稱 / LP讀表率或無電表 / 資料更新時間 */}
        {hover && (
          <div
            className="pointer-events-none absolute z-30 w-[176px] rounded-lg bg-surface border border-border shadow-card px-3 py-2"
            style={{
              top: Math.max(6, hover.y - 12),
              left: hover.right ? undefined : hover.x + 14,
              right: hover.right ? `calc(100% - ${hover.x - 14}px)` : undefined,
            }}
          >
            <div className="text-[13px] font-semibold text-ink mb-1">{hover.name}</div>
            <div className="flex items-center justify-between text-[12px] mb-0.5">
              <span className="text-ink-sub">狀態</span>
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: hover.labelColor }}>
                <span
                  className="h-2.5 w-2.5 rounded-[3px] border"
                  style={{ background: hover.swFill, borderColor: hover.swStroke }}
                />
                {hover.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-sub">LP 讀表率</span>
              <span className="tabular-nums text-ink font-medium">
                {hover.lpRate === null ? '—（無電表）' : `${hover.lpRate.toFixed(2)}%`}
              </span>
            </div>
            <div className="mt-1 pt-1 border-t border-divider text-[11px] text-ink-mut">{MAP_UPDATE_NOTE}</div>
          </div>
        )}

        {/* 當前層級狀態統計 — top-left */}
        <div className="absolute top-3 left-3">
          <LevelStats />
        </div>

        {/* 離島 inset — 金門 / 馬祖(連江)，僅全台層級呈現於左側 */}
        {node.id === 'TW' && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 rounded-lg bg-surface/70 backdrop-blur border border-border px-2.5 py-2.5 shadow-card">
            <IslandInset countyNodes={COUNTY_NODES} regionId="LJU" label="馬祖" />
            <IslandInset countyNodes={COUNTY_NODES} regionId="KMN" label="金門" />
          </div>
        )}

        {/* legend bottom-left */}
        <div className="absolute bottom-3 left-3">
          <Legend />
        </div>

        {/* hint */}
        <div className="absolute bottom-3 right-3 text-[11px] text-ink-mut">
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
