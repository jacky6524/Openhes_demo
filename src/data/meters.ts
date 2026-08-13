import type { Dcu, RegionNode } from '@/types'

/* deterministic per-region DCU list — only used by the deepest-level detail
   drawer (§4.5). This is the ONLY place individual DCUs appear. Rates wobble
   around the region's own rates so the status mix reconciles with the map. */
function rng(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, '0')
}
const round1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** DCU serial stem derived from the region id (stable, copy-friendly) */
function serialStem(id: string) {
  const s = id.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return (s.slice(-4) || 'AREA').padStart(4, '0')
}

export function dcusForRegion(node: RegionNode, limit = 60): Dcu[] {
  const r = rng(hash(node.id))
  // one DCU concentrates many meters — keep the list legible
  const count = Math.min(limit, Math.max(12, Math.round(node.metrics.meterTotal / 2500)))
  const stem = serialStem(node.id)
  const baseConnect = node.metrics.connectRate
  const baseLp = node.metrics.lpRate
  return Array.from({ length: count }, (_, i) => {
    const connectRate = clamp(round1(baseConnect + (r() - 0.5) * 8), 70, 100)
    const lpRate = clamp(round1(baseLp + (r() - 0.5) * 14), 55, 100)
    // 每台 DCU 收容電表數（排除停用）；連線/讀表數由對應比率導出，數字對得起來
    const meterTotal = 96 + Math.floor(r() * 40) // 96–135
    const connected = Math.round((connectRate / 100) * meterTotal)
    const read = Math.round((lpRate / 100) * meterTotal)
    return {
      serial: `DCU-${stem}-${pad(i + 1)}`,
      connectRate,
      lpRate,
      meterTotal,
      connected,
      read,
    }
  })
}
