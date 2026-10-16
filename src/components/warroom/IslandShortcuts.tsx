import { useMemo } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoMercator } from 'd3-geo'
import { COUNTY_NODES } from '@/data/mockData'
import { countyGeoById } from '@/data/geo/geo'
import { statByCity } from '@/data/dcuFleet'
import { useWarroom } from '@/store/useWarroom'
import { SEVERITY_COLOR, SEVERITY_STROKE } from './warroomConfig'

/**
 * 離島 inset —— 位置與樣式對齊系統總覽的 `.island-shortcuts`（見 map/IslandInset）：
 * 右下、116px 寬的白色小卡，內含 馬祖／金門 兩格；每格整格是熱區，島形 72×38。
 *
 * 金門／馬祖距本島甚遠，畫進主圖會被取景裁掉或把本島拉遠，因此主圖排除、改由這裡呈現。
 *
 * 2026-09-23 全台 22 縣市都有 DCU 資料之後，這兩格改為依該縣市 DCU 連線率著色
 * （與主圖同一組告警色），點一下＝下鑽到該縣市，行為與點主圖的縣市一樣。
 */
const ISLANDS: { id: string; label: string; city: string }[] = [
  { id: 'LJU', label: '馬祖', city: '連江縣' },
  { id: 'KMN', label: '金門', city: '金門縣' },
]

export function IslandShortcuts() {
  return (
    <div
      className="box-border grid w-[116px] justify-items-center gap-1.5 rounded-lg border p-[9px]"
      style={{
        borderColor: '#EADFE1',
        background: 'rgba(255,255,255,.95)',
        boxShadow: '0 8px 20px rgba(58,42,48,.12)',
      }}
    >
      <strong className="w-full text-[12px]" style={{ color: '#6F6267' }}>
        離島
      </strong>
      {ISLANDS.map((i) => (
        <IslandTile key={i.id} {...i} />
      ))}
    </div>
  )
}

function IslandTile({ id, label, city, width = 72, height = 38 }: { id: string; label: string; city: string; width?: number; height?: number }) {
  const setCity = useWarroom((s) => s.setCity)
  const { fc, projection } = useMemo(() => {
    const collection = countyGeoById(COUNTY_NODES, id)
    const proj = geoMercator()
    const pad = 3
    if (collection.features.length) {
      proj.fitExtent([[pad, pad], [width - pad, height - pad]], collection as any)
    }
    return { fc: collection, projection: proj }
  }, [id, width, height])
  const stat = useMemo(() => statByCity(city), [city])
  const sev = stat?.severity ?? 'normal'
  const fill = SEVERITY_COLOR[sev]
  const stroke = SEVERITY_STROKE[sev]

  return (
    <button
      type="button"
      onClick={() => setCity(city)}
      title={stat ? `${label}：DCU ${stat.dcuTotal} 台・連線率 ${(stat.onlineRate * 100).toFixed(1)}%（點選進入）` : label}
      className="group box-border grid w-full min-h-[62px] cursor-pointer place-items-center gap-[3px] rounded-[7px] border bg-surface px-1 py-[5px] text-[12px] transition-colors hover:bg-inset"
      style={{ borderColor: '#EEE5E7', color: '#4F4549' }}
    >
      <ComposableMap
        projection={projection as any}
        width={width}
        height={height}
        style={{ width, height, pointerEvents: 'none', overflow: 'visible', display: 'block' }}
      >
        <Geographies geography={fc as any}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.properties.rid as string}
                geography={geo}
                style={{
                  default: { fill, fillOpacity: 0.8, stroke, strokeWidth: 0.6, outline: 'none' },
                  hover: { fill, fillOpacity: 1, stroke, strokeWidth: 0.6, outline: 'none' },
                  pressed: { fill, fillOpacity: 1, stroke, strokeWidth: 0.6, outline: 'none' },
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
