import { useMemo, useState } from 'react'
import { useDashboard, useCurrentNode, useScopeLabel } from '@/store/useDashboard'
import { getById } from '@/data/mockData'
import { METRIC_FIELD, METRIC_LABEL, rateHealth } from '@/config/thresholds'
import { Card } from '@/components/ui/Card'
import { status, health } from '@/tokens'
import type { MetricKey } from '@/types'

const UPDATE_NOTE = '資料更新時間：每小時（整點）'
const EXCLUDE_NOTE = '備註：排除停用'

// 紅區定義：連線率 ≥ 97% 且 讀表率 < 95% ＝ 連得上卻讀不到
// （7/24 會議原為 98／90；2026-11-17 同步正式機截圖改為 97／95，與 LP 讀表率門檻一致）
const CONNECT_CUT = 97
const READ_CUT = 95

/**
 * 座標軸範圍與刻度 — 與前端 NewDashboard.vue 的
 * scatterXAxisTicks / scatterYAxisTicks / scatterXPosition / scatterYPosition
 * 完全相同：x 軸 85–100、y 軸 80–100，點位以百分比定位在畫布內。
 */
const X_MIN = 85
const X_MAX = 100
const Y_MIN = 80
const Y_MAX = 100
const X_TICKS = [85, 90, 95, 100]
const Y_TICKS = [80, 85, 90, 95, 100]

const xPos = (rate: number) => ((rate - X_MIN) / (X_MAX - X_MIN)) * 100
const yPos = (rate: number) => ((rate - Y_MIN) / (Y_MAX - Y_MIN)) * 100
const clampPos = (p: number) => Math.max(1.5, Math.min(98.5, p))

/**
 * 連線率 × 讀表率比對 — 手繪版，逐條對應前端 .scatter-panel 的 CSS：
 *   .scatter-canvas    margin 0 28 38 96；border #e0e2e5；bg #fafbfc
 *   .scatter-grid-line 刻度線 #e1e3e6，刻度字 12px #7d818b（畫在畫布外）
 *   .scatter-zone      右下紅區「連得上卻讀不到」
 *   .scatter-cross     2px dashed #cfd3d8 的門檻十字線
 *   .scatter-dot       依 LP 讀表率三態著色（良好綠／注意黃／警告紅，色值取 tokens.health.accent），
 *                      直徑 16–34px 隨 DCU 斷線數放大（2026-11-17 同步正式機截圖，原為藍點、異常轉紅）
 *   .scatter-tooltip   232px 白底浮框
 *
 * 原本用 recharts 繪製，改為手繪是為了讓刻度、留白、點樣式與前端一致。
 * x=連線率, y=讀表率(固定 LP), point=目前層級的子區域，點擊下鑽。
 */
export function CrossScatter() {
  const node = useCurrentNode()
  const scope = useScopeLabel()
  const drillInto = useDashboard((s) => s.drillInto)
  const [hovered, setHovered] = useState<string | null>(null)

  // 讀表軸固定 LP（14g）— 不隨 selectedKpi 改變
  const readKey: MetricKey = 'lp'

  const points = useMemo(() => {
    // 無智慧電表的子區域沒有連線/讀表數據，排除以免落在原點形成假異常點
    const kids = (node.children ?? []).filter((c) => c.metrics.meterTotal > 0)
    const maxDisconnect = Math.max(0, ...kids.map((c) => c.metrics.dhcDisconnect))
    return kids.map((c) => {
      const x = c.metrics.connectRate
      const y = c.metrics[METRIC_FIELD[readKey]]
      const ratio = maxDisconnect > 0 ? c.metrics.dhcDisconnect / maxDisconnect : 0
      return {
        id: c.id,
        name: c.name,
        x,
        y,
        disconnect: c.metrics.dhcDisconnect,
        // 前端 scatterStyle(): size = 16 + ratio * 18
        size: 16 + Math.max(0, Math.min(1, ratio)) * 18,
        left: clampPos(xPos(x)),
        bottom: clampPos(yPos(y)),
        tone: rateHealth(readKey, y),
      }
    })
  }, [node])

  const hoveredPoint = points.find((p) => p.id === hovered) ?? null

  return (
    <Card className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-3 py-4 [@media(max-height:943px)]:gap-1.5 [@media(max-height:943px)]:py-2.5">
      {/* .panel-header */}
      <header className="flex w-full shrink-0 items-center justify-between gap-3">
        <div className="group/hc relative flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
          <strong className="cursor-default overflow-hidden text-ellipsis text-[16px] font-semibold leading-6 tracking-[1px] text-ink">
            連線率 × 讀表率比對
          </strong>
          <span className="text-[12px] font-normal leading-4 tracking-[0.2px] text-ink-mut">{scope}</span>

          {/* 14a：點 / 紅底區等說明移至標題 hover */}
          <span className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-[268px] translate-y-1 opacity-0 transition-all duration-150 group-hover/hc:translate-y-0 group-hover/hc:opacity-100">
            <span className="block rounded-lg border border-border bg-surface px-3 py-2 text-left shadow-card">
              <span className="mb-1 block text-[12px] font-semibold text-ink">連線率 × 讀表率比對</span>
              <span className="block py-0.5 text-[11px] leading-snug text-ink-sub">點（區域）：大小 = DCU 斷線數；顏色 = LP 讀表率狀態</span>
              <span className="block py-0.5 text-[11px] leading-snug" style={{ color: status.danger.fg }}>
                紅底區：連線率 ≥ {CONNECT_CUT}% 且 讀表率 &lt; {READ_CUT}%
              </span>
              <span className="block py-0.5 text-[11px] leading-snug text-ink-sub">{UPDATE_NOTE}</span>
              <span className="block py-0.5 text-[11px] leading-snug text-ink-sub">{EXCLUDE_NOTE}</span>
            </span>
          </span>
        </div>
        <span className="shrink-0 text-[12px] font-normal leading-4 tracking-[0.2px] text-ink-mut">
          {METRIC_LABEL[readKey]}
        </span>
      </header>

      {points.length ? (
        // .scatter-canvas — 左 96 / 右 28 / 下 38 的留白讓軸標與刻度落在畫布外
        <div
          className="relative min-h-0 flex-1"
          style={{ margin: '0 28px 38px 96px', border: '1px solid #E0E2E5', background: '#FAFBFC' }}
        >
          {/* x 刻度線 */}
          {X_TICKS.map((t) => (
            <div
              key={`x-${t}`}
              className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px"
              style={{ left: `${xPos(t)}%`, borderLeft: '1px solid #E1E3E6' }}
            >
              <span className="absolute -bottom-7 left-0 -translate-x-1/2 text-[12px] leading-none text-[#7D818B]">
                {t}
              </span>
            </div>
          ))}
          {/* y 刻度線 */}
          {Y_TICKS.map((t) => (
            <div
              key={`y-${t}`}
              className="pointer-events-none absolute left-0 right-0 z-[1] h-px"
              style={{ bottom: `${yPos(t)}%`, borderTop: '1px solid #E1E3E6' }}
            >
              <span
                className="absolute top-0 min-w-[28px] -translate-y-1/2 text-right text-[12px] leading-none text-[#7D818B]"
                style={{ right: 'calc(100% + 14px)' }}
              >
                {t}
              </span>
            </div>
          ))}

          {/* .scatter-zone — 連得上卻讀不到（正式機為實心半透明紅、無文字；說明在標題 hover） */}
          <div
            className="absolute bottom-0 right-0 z-0"
            style={{
              left: `${clampPos(xPos(CONNECT_CUT))}%`,
              height: `${clampPos(yPos(READ_CUT))}%`,
              background: health.alert.fill,
              opacity: 0.4,
            }}
          />

          {/* .scatter-cross — 門檻十字虛線 */}
          <div
            className="pointer-events-none absolute left-0 right-0 z-[2]"
            style={{ bottom: `${clampPos(yPos(READ_CUT))}%`, borderTop: '2px dashed #CFD3D8' }}
          />
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[2]"
            style={{ left: `${clampPos(xPos(CONNECT_CUT))}%`, borderLeft: '2px dashed #CFD3D8' }}
          />

          {/* .scatter-dot */}
          {points.map((p) => (
            <button
              key={p.id}
              type="button"
              className="group/dot absolute z-[3] block cursor-pointer rounded-full"
              style={{
                left: `${p.left}%`,
                bottom: `${p.bottom}%`,
                width: p.size,
                height: p.size,
                transform: 'translate(-50%, 50%)',
                border: '1px solid rgba(255,255,255,.9)',
                background: health[p.tone].accent,
                boxShadow: '0 2px 7px rgba(58,42,48,.18)',
              }}
              aria-label={`${p.name}，連線率 ${p.x.toFixed(1)}%，讀表率 ${p.y.toFixed(1)}%，DCU 斷線 ${p.disconnect}`}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
              onFocus={() => setHovered(p.id)}
              onBlur={() => setHovered((h) => (h === p.id ? null : h))}
              onClick={() => {
                const n = getById(p.id)
                if (n) drillInto(n)
              }}
            >
              <span
                className="pointer-events-none absolute top-0 whitespace-nowrap text-[12px] text-[#73686C] opacity-0 transition-opacity group-hover/dot:opacity-100 group-focus-visible/dot:opacity-100"
                style={{ left: 'calc(100% + 5px)' }}
              >
                {p.name}
                <small className="block text-[10px] leading-[1.1] text-ink-fai">{p.y.toFixed(1)}%</small>
              </span>
            </button>
          ))}

          {/* .scatter-tooltip */}
          {hoveredPoint && (
            <div
              className="pointer-events-none absolute z-[4] grid w-[232px] gap-2.5 rounded-[9px] border px-4 pb-3 pt-3.5 text-[13px] leading-[1.45] text-ink-sub"
              style={{
                left: `${hoveredPoint.left}%`,
                bottom: `${hoveredPoint.bottom}%`,
                transform: `translate(${hoveredPoint.left > 68 ? 'calc(-100% - 18px)' : '18px'}, ${
                  hoveredPoint.bottom > 50 ? 'calc(100% + 16px)' : '-16px'
                })`,
                borderColor: '#E2D8DB',
                background: 'rgba(255,255,255,.96)',
                boxShadow: '0 10px 24px rgba(58,42,48,.16)',
              }}
            >
              <strong className="text-[16px] text-ink">{hoveredPoint.name}</strong>
              <dl className="m-0 grid gap-[7px]">
                <TipRow label="連線率" value={`${hoveredPoint.x.toFixed(1)} %`} />
                <TipRow label="讀表率" value={`${hoveredPoint.y.toFixed(1)} %`} />
                <TipRow label="DCU 斷線" value={String(hoveredPoint.disconnect)} />
              </dl>
              <footer className="border-t pt-[9px] text-[11px] text-ink-fai" style={{ borderColor: '#EEE5E8' }}>
                {UPDATE_NOTE}
              </footer>
            </div>
          )}

          {/* .axis-label */}
          <span
            className="pointer-events-none absolute z-[1] whitespace-nowrap text-[13px] leading-none text-[#686E79]"
            style={{ right: '50%', bottom: -42, transform: 'translateX(50%)' }}
          >
            連線率 (%)
          </span>
          <span
            className="pointer-events-none absolute z-[1] whitespace-nowrap text-[13px] leading-none text-[#686E79]"
            style={{ left: -92, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'center' }}
          >
            讀表率 (%)
          </span>
        </div>
      ) : (
        // .panel-empty
        <div className="grid h-full min-h-[180px] place-content-center gap-2 p-6 text-center text-ink-sub">
          <strong className="text-[15px] text-ink">此層級沒有可比對的區域</strong>
          <span className="max-w-[280px] text-[13px] leading-[1.5]">
            目前區域沒有下一層子區域，或子區域皆無智慧電表。
          </span>
        </div>
      )}
    </Card>
  )
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[#7D7377]">{label}</dt>
      <dd className="m-0 whitespace-nowrap text-ink">{value}</dd>
    </div>
  )
}
