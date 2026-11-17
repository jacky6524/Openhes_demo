import { useMemo } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoMercator } from 'd3-geo'
import { useDashboard } from '@/store/useDashboard'
import { getById } from '@/data/mockData'
import { countyGeoById } from '@/data/geo/geo'
import { metricHealth } from '@/lib/health'
import { health as healthTokens, noMeter, mapOutline, HEALTH_FILL_OPACITY } from '@/tokens'
import type { RegionNode } from '@/types'

/**
 * 離島 inset 小圖 — 澎湖 / 金門 / 連江 因真實位置遠離台灣本島，畫在主圖會被投影
 * 裁掉或拉遠本島，故以獨立小圖固定呈現於地圖左側。著色 / 無電表斜線紋 / 可否下鑽
 * 邏輯與主圖一致。
 *
 * 外觀對齊前端 `.island-shortcuts button`：整格滿版、min-height 62、
 * border #eee5e7 / radius 7 / bg #fff，hover 轉 #c78a9b 外框並微微上浮；
 * 島形以 72×38 的 viewport 呈現，描邊 #a77752（同主圖 regions-outline）。
 */
export function IslandInset({
  countyNodes,
  regionId,
  label,
  width = 72,
  height = 38,
}: {
  countyNodes: RegionNode[]
  regionId: string
  label: string
  width?: number
  height?: number
}) {
  const drillInto = useDashboard((s) => s.drillInto)

  const { fc, projection } = useMemo(() => {
    const collection = countyGeoById(countyNodes, regionId)
    const proj = geoMercator()
    const pad = 3
    if (collection.features.length) {
      proj.fitExtent(
        [
          [pad, pad],
          [width - pad, height - pad],
        ],
        collection as any,
      )
    }
    return { fc: collection, projection: proj }
  }, [countyNodes, regionId, width, height])

  const region = getById(regionId)
  const noData = !region || region.metrics.meterTotal === 0
  const h = region ? metricHealth(region.metrics, 'lp') : 'good'
  const tone = healthTokens[h]
  // 無電表改實心淺灰（2026-11-17 同步正式機截圖，原為斜線紋）
  const fill = noData ? noMeter.fill : tone.fill

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
        'group box-border grid w-full min-h-[62px] place-items-center gap-[3px] rounded-[7px] border bg-surface px-1 py-[5px] text-[12px] transition-[border-color,box-shadow,transform] duration-150',
        clickable
          ? 'cursor-pointer hover:-translate-y-px hover:border-[#C78A9B] hover:shadow-[0_5px_12px_rgba(89,55,66,.16)]'
          : 'cursor-not-allowed',
      ].join(' ')}
      style={{ borderColor: '#EEE5E7', color: '#4F4549' }}
    >
      <ComposableMap
        projection={projection as any}
        width={width}
        height={height}
        style={{ width, height, pointerEvents: 'none', overflow: 'visible', display: 'block' }}
      >
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
                    stroke: mapOutline,
                    strokeWidth: 0.45,
                    outline: 'none',
                  },
                  hover: {
                    fill,
                    fillOpacity: 1,
                    stroke: mapOutline,
                    strokeWidth: 0.45,
                    outline: 'none',
                  },
                  pressed: {
                    fill,
                    fillOpacity: 1,
                    stroke: mapOutline,
                    strokeWidth: 0.45,
                    outline: 'none',
                  },
                }}
              />
            ))
          }
        </Geographies>
      </ComposableMap>
      <span className="w-full whitespace-nowrap text-center text-[12px] leading-none">{label}</span>
    </button>
  )
}
