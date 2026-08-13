import { useMemo } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoMercator } from 'd3-geo'
import { useDashboard } from '@/store/useDashboard'
import { getById } from '@/data/mockData'
import { countyGeoById } from '@/data/geo/geo'
import { metricHealth } from '@/lib/health'
import { health as healthTokens, noMeter, HEALTH_FILL_OPACITY } from '@/tokens'
import type { RegionNode } from '@/types'

/**
 * 離島 inset 小圖 — 金門 / 馬祖(連江) 因真實位置遠離台灣本島，畫在主圖會被投影
 * 裁掉或拉遠本島，故以獨立小圖固定呈現於地圖左側。著色 / 無電表斜線紋 / 可否下鑽
 * 邏輯與主圖一致。
 */
export function IslandInset({
  countyNodes,
  regionId,
  label,
  size = 58,
}: {
  countyNodes: RegionNode[]
  regionId: string
  label: string
  size?: number
}) {
  const drillInto = useDashboard((s) => s.drillInto)

  const { fc, projection } = useMemo(() => {
    const collection = countyGeoById(countyNodes, regionId)
    const proj = geoMercator()
    const pad = 6
    if (collection.features.length) {
      proj.fitExtent(
        [
          [pad, pad],
          [size - pad, size - pad],
        ],
        collection as any,
      )
    }
    return { fc: collection, projection: proj }
  }, [countyNodes, regionId, size])

  const region = getById(regionId)
  const noData = !region || region.metrics.meterTotal === 0
  const h = region ? metricHealth(region.metrics, 'lp') : 'good'
  const tone = healthTokens[h]
  const patternId = `noMeterHatch-inset-${regionId}`
  const fill = noData ? `url(#${patternId})` : tone.fill
  const stroke = noData ? noMeter.stroke : tone.stroke
  const clickable = !!region && !noData

  return (
    // 整個格子 (含小圖 + 標籤) 皆為點擊熱區 — 馬祖為散落小島，島形本身太小難以
    // 命中，故由容器統一接手點擊；Geography 僅負責視覺呈現 (不再單獨綁 onClick,
    // 避免與容器雙重觸發)。
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && drillInto(region!)}
      title={region ? region.name : label}
      className={[
        'group flex flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors',
        clickable ? 'cursor-pointer hover:bg-inset' : 'cursor-not-allowed',
      ].join(' ')}
    >
      <ComposableMap
        projection={projection as any}
        width={size}
        height={size}
        style={{ width: size, height: size, pointerEvents: 'none' }}
      >
        <defs>
          <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill={noMeter.fill} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={noMeter.stroke} strokeWidth={1.4} />
          </pattern>
        </defs>
        <Geographies geography={fc}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.properties.rid as string}
                geography={geo}
                style={{
                  default: {
                    fill,
                    fillOpacity: noData ? 1 : HEALTH_FILL_OPACITY,
                    stroke,
                    strokeWidth: 0.6,
                    outline: 'none',
                  },
                  hover: {
                    fill,
                    fillOpacity: noData ? 1 : 1,
                    stroke,
                    strokeWidth: 0.6,
                    outline: 'none',
                  },
                  pressed: {
                    fill,
                    fillOpacity: 1,
                    stroke,
                    strokeWidth: 0.6,
                    outline: 'none',
                  },
                }}
              />
            ))
          }
        </Geographies>
      </ComposableMap>
      <span
        className={`text-[10px] leading-none whitespace-nowrap ${clickable ? 'text-ink-sub group-hover:text-brand' : 'text-ink-sub'}`}
      >
        {label}
      </span>
    </button>
  )
}
