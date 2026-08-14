import type maplibregl from 'maplibre-gl'
import { STATE_COLOR, MIS_COLOR } from './warroomConfig'

/**
 * 地圖標記圖示 —— 以 canvas 產生後註冊給 maplibre（circle 圖層畫不出方形與叉）。
 *
 * 形狀本身就是編碼，不只靠顏色（色弱友善）：
 *   方塊 + ✕（紅）＝ 斷線 DCU
 *   圓圈 + ✕（灰）＝ 歸屬錯誤電表
 *
 * 一律以 2 倍尺寸繪製再用 pixelRatio: 2 註冊，高解析螢幕不糊。
 */

const PX = 2 // pixelRatio

function canvas(sizeCss: number) {
  const c = document.createElement('canvas')
  c.width = c.height = sizeCss * PX
  const g = c.getContext('2d')!
  g.scale(PX, PX)
  return { c, g }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function cross(g: CanvasRenderingContext2D, size: number, lineWidth: number, color: string) {
  g.strokeStyle = color
  g.lineWidth = lineWidth
  g.lineCap = 'round'
  const a = size * 0.35, b = size * 0.65
  g.beginPath()
  g.moveTo(a, a); g.lineTo(b, b)
  g.moveTo(b, a); g.lineTo(a, b)
  g.stroke()
}

function toImage(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!
  const d = g.getImageData(0, 0, c.width, c.height)
  return { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) }
}

/** 斷線 DCU：紅色圓角方塊 + 白色 ✕ + 白外框 */
function squareCross(sizeCss: number, fill: string) {
  const { c, g } = canvas(sizeCss)
  const pad = sizeCss * 0.14
  const side = sizeCss - pad * 2
  // 白外框（讓標記在任何底色上都跳出來）
  g.fillStyle = '#FFFFFF'
  roundRect(g, pad - 2.5, pad - 2.5, side + 5, side + 5, sizeCss * 0.2)
  g.fill()
  g.fillStyle = fill
  roundRect(g, pad, pad, side, side, sizeCss * 0.17)
  g.fill()
  cross(g, sizeCss, sizeCss * 0.115, '#FFFFFF')
  return toImage(c)
}

/** 歸屬錯誤電表：灰色圓圈 + 白色 ✕ + 白外框 */
function circleCross(sizeCss: number, fill: string) {
  const { c, g } = canvas(sizeCss)
  const r = sizeCss * 0.36
  const cx = sizeCss / 2
  g.fillStyle = '#FFFFFF'
  g.beginPath(); g.arc(cx, cx, r + 2.5, 0, Math.PI * 2); g.fill()
  g.fillStyle = fill
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill()
  cross(g, sizeCss, sizeCss * 0.115, '#FFFFFF')
  return toImage(c)
}

export const ICON_DCU_OFFLINE = 'ico-dcu-offline'
export const ICON_MIS_METER = 'ico-mis-meter'

/** 在 map.load 之後呼叫一次；重複註冊會被略過 */
export function registerMarkerIcons(map: maplibregl.Map) {
  if (!map.hasImage(ICON_DCU_OFFLINE)) {
    map.addImage(ICON_DCU_OFFLINE, squareCross(34, STATE_COLOR.offline) as any, { pixelRatio: PX })
  }
  if (!map.hasImage(ICON_MIS_METER)) {
    map.addImage(ICON_MIS_METER, circleCross(32, MIS_COLOR) as any, { pixelRatio: PX })
  }
}
