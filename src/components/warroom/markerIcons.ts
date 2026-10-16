import type maplibregl from 'maplibre-gl'
import { STATE_COLOR, MIS_COLOR, FREQ_COLORS } from './warroomConfig'

/**
 * 地圖標記圖示 —— 以 canvas 產生後註冊給 maplibre（circle 圖層畫不出方形與叉）。
 *
 * 形狀本身就是編碼，不只靠顏色（色弱友善）：
 *   方塊（底色＝頻點色）  ＝ DCU（正常）
 *   方塊（灰）           ＝ DCU（停用）
 *   方塊 + ✕（紅）       ＝ DCU（斷線）—— 與正常 DCU 同尺寸（2026-09-03 業主意見）
 *   圓圈 + ✕（灰）       ＝ 歸屬錯誤電表
 *   小圓點               ＝ 一般電表（GPU circle 圖層，不在這裡）
 *
 * 2026-08-27 依業主意見：**DCU 一律方形**（原本正常／停用是圓形），
 * 讓「方形＝DCU、圓形＝電表」成為一條乾淨的形狀規則。
 * 頻點色有 10 種，maplibre 的 symbol 圖層不能像 circle 那樣吃 `['get','color']`，
 * 所以每個頻點各註冊一張圖示，feature 自帶 `icon` 屬性指名要用哪一張。
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

/** 圓角方塊 + 白外框；`withCross` 時再加白色 ✕（斷線） */
function square(sizeCss: number, fill: string, withCross = false) {
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
  if (withCross) cross(g, sizeCss, sizeCss * 0.115, '#FFFFFF')
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

/**
 * 歸屬錯誤電表匯總球：平頂六邊形（尖端朝上下）。
 * 2026-08-28 依業主意見從圓形改為六邊形 —— 匯總球和「電表小圓點」都是圓的，
 * 混在一起讀不出層級；六邊形一眼就知道是「一群」而不是「一顆」。
 * sizeCss 是外接圓直徑；畫布留白避免白外框被裁掉。
 */
function hexagon(sizeCss: number, fill: string) {
  const { c, g } = canvas(sizeCss)
  const cx = sizeCss / 2
  const r = sizeCss * 0.44 // 留 6% 給白外框
  const path = (radius: number) => {
    g.beginPath()
    for (let i = 0; i < 6; i++) {
      // -90° 起算＝尖端朝上
      const a = (Math.PI / 180) * (60 * i - 90)
      const x = cx + radius * Math.cos(a)
      const y = cx + radius * Math.sin(a)
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.closePath()
  }
  g.fillStyle = '#FFFFFF'
  path(r + 2)
  g.fill()
  g.fillStyle = fill
  path(r)
  g.fill()
  return toImage(c)
}

/** 停用電表：灰色**空心**圓圈 —— 與實心小圓點（一般）、畫叉圓圈（歸屬錯誤）三者可辨 */
function circleHollow(sizeCss: number, stroke: string) {
  const { c, g } = canvas(sizeCss)
  const r = sizeCss * 0.32
  const cx = sizeCss / 2
  g.strokeStyle = '#FFFFFF'
  g.lineWidth = sizeCss * 0.16
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = stroke
  g.lineWidth = sizeCss * 0.1
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke()
  return toImage(c)
}

export const ICON_DCU_OFFLINE = 'ico-dcu-offline'
export const ICON_DCU_DISABLED = 'ico-dcu-disabled'
export const ICON_MIS_METER = 'ico-mis-meter'
export const ICON_METER_DISABLED = 'ico-meter-disabled'
/** 歸屬錯誤匯總（六邊形）—— 2026-09-23 依業主意見統一一個尺寸，不再依數量分大小 */
export const ICON_MIS_AGG = 'ico-mis-agg'
/** 正常 DCU：一個頻點一張圖示，`ico-dcu-f1` … `ico-dcu-f10` */
export const iconForFreq = (freq: number) =>
  `ico-dcu-f${((freq - 1) % FREQ_COLORS.length + FREQ_COLORS.length) % FREQ_COLORS.length + 1}`

/** 依 DCU 狀態 / 頻點解析出該用哪張圖示（GeoJSON feature 的 `icon` 屬性） */
export function dcuIconName(state: 'active' | 'disabled' | 'offline', freq: number) {
  if (state === 'offline') return ICON_DCU_OFFLINE
  if (state === 'disabled') return ICON_DCU_DISABLED
  return iconForFreq(freq)
}

/** 在 map.load 之後呼叫一次；重複註冊會被略過 */
export function registerMarkerIcons(map: maplibregl.Map) {
  if (!map.hasImage(ICON_DCU_OFFLINE)) {
    map.addImage(ICON_DCU_OFFLINE, square(30, STATE_COLOR.offline, true) as any, { pixelRatio: PX })
  }
  if (!map.hasImage(ICON_DCU_DISABLED)) {
    map.addImage(ICON_DCU_DISABLED, square(30, STATE_COLOR.disabled) as any, { pixelRatio: PX })
  }
  FREQ_COLORS.forEach((color, i) => {
    const name = `ico-dcu-f${i + 1}`
    if (!map.hasImage(name)) map.addImage(name, square(30, color) as any, { pixelRatio: PX })
  })
  if (!map.hasImage(ICON_MIS_METER)) {
    map.addImage(ICON_MIS_METER, circleCross(18, MIS_COLOR) as any, { pixelRatio: PX })
  }
  if (!map.hasImage(ICON_METER_DISABLED)) {
    map.addImage(ICON_METER_DISABLED, circleHollow(18, STATE_COLOR.disabled) as any, { pixelRatio: PX })
  }
  if (!map.hasImage(ICON_MIS_AGG)) {
    map.addImage(ICON_MIS_AGG, hexagon(40, MIS_COLOR) as any, { pixelRatio: PX })
  }
}
