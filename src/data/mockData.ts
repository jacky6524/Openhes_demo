import type { RegionNode, RegionMetrics } from '@/types'
import { rollup, round2 } from '@/lib/aggregate'
import { overallHealth } from '@/lib/health'
import { townRoster } from '@/data/geo/geo'
import { CASES, CASE_COUNTY_MAP } from '@/store/useCaseFilter'

/* ---------- seeded PRNG (deterministic mock) ---------- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* ---------- county roster (matches simplified TopoJSON names) ---------- */
// geoKey must equal the TopoJSON feature `name`. 2010 dataset uses 桃園縣 etc.
// deployed=false → 該縣市尚無智慧電表 (meterTotal=0)，地圖以「無智慧電表」樣式
// 呈現，不參與健康著色。以下未部署清單為 DEMO 佔位，實際部署狀態待 API 提供。
// tier='warning'/'alert' → 讓該縣市在 L1 全台層級呈現 注意 / 警告 (其行政區
// 讀表率整體壓低)，未標示者依隨機分佈 (多數為良好)。同為 DEMO 佔位。
// TODO: 部署狀態與健康分佈皆應改由 API 提供，而非前端寫死。
const COUNTIES: {
  id: string
  name: string
  geoKey: string
  meters: number
  deployed?: boolean
  tier?: 'warning' | 'alert'
}[] = [
  { id: 'TPE', name: '台北市', geoKey: '台北市', meters: 480000 },
  { id: 'NTPC', name: '新北市', geoKey: '新北市', meters: 720000, tier: 'warning' },
  { id: 'TYC', name: '桃園市', geoKey: '桃園縣', meters: 560000 },
  { id: 'HSC', name: '新竹市', geoKey: '新竹市', meters: 110000 },
  { id: 'HSCC', name: '新竹縣', geoKey: '新竹縣', meters: 140000 },
  { id: 'MIA', name: '苗栗縣', geoKey: '苗栗縣', meters: 130000, tier: 'warning' },
  { id: 'TCH', name: '台中市', geoKey: '台中市', meters: 620000, tier: 'warning' },
  { id: 'CHA', name: '彰化縣', geoKey: '彰化縣', meters: 230000, tier: 'alert' },
  { id: 'NTO', name: '南投縣', geoKey: '南投縣', meters: 95000 },
  { id: 'YUN', name: '雲林縣', geoKey: '雲林縣', meters: 160000, tier: 'alert' },
  { id: 'CYI', name: '嘉義市', geoKey: '嘉義市', meters: 70000 },
  { id: 'CYC', name: '嘉義縣', geoKey: '嘉義縣', meters: 120000, tier: 'warning' },
  { id: 'TNN', name: '台南市', geoKey: '台南市', meters: 410000 },
  { id: 'KHH', name: '高雄市', geoKey: '高雄市', meters: 560000, tier: 'alert' },
  { id: 'PIF', name: '屏東縣', geoKey: '屏東縣', meters: 150000 },
  { id: 'ILA', name: '宜蘭縣', geoKey: '宜蘭縣', meters: 120000 },
  { id: 'HUA', name: '花蓮縣', geoKey: '花蓮縣', meters: 95000 },
  { id: 'TTT', name: '台東縣', geoKey: '台東縣', meters: 70000, deployed: false },
  { id: 'KEE', name: '基隆市', geoKey: '基隆市', meters: 90000 },
  { id: 'PEH', name: '澎湖縣', geoKey: '澎湖縣', meters: 30000 },
  { id: 'KMN', name: '金門縣', geoKey: '金門縣', meters: 28000 },
  { id: 'LJU', name: '連江縣', geoKey: '連江縣', meters: 6000 },
]

/* ---------- leaf metric generator ---------- */
/** all-zero metrics for a region with no smart meters (無智慧電表 / 未部署) */
function emptyMetrics(): RegionMetrics {
  return {
    meterTotal: 0,
    connected: 0,
    connectRate: 0,
    lpRate: 0,
    midnightRate: 0,
    altRate: 0,
    eventCount: 0,
    dhcDisconnect: 0,
  }
}

function makeLeafMetrics(
  seedKey: string,
  meterTotal: number,
  band?: 'warning' | 'alert',
): RegionMetrics {
  if (meterTotal <= 0) return emptyMetrics() // 無智慧電表 → 不產生讀表/連線數據
  const r = mulberry32(hashStr(seedKey))
  // Bands align with THRESHOLDS.lp: 良好 ≥97 / 注意 95–97 / 告警 <95.
  // 縣市可透過 `band` 強制其行政區落在 注意 / 警告 帶，使 L1 rollup 呈現該色；
  // 未指定者依隨機分佈，多數為良好 (§ review：地圖以安靜為主)。
  let connectRate: number, lpRate: number
  if (band === 'alert') {
    connectRate = 92 + r() * 3.4 // 92–95.4
    lpRate = 90 + r() * 4.4 // 90–94.4 → <95 告警
  } else if (band === 'warning') {
    connectRate = 95.6 + r() * 2 // 95.6–97.6 (<98)
    lpRate = 95 + r() * 1.7 // 95–96.7 → 注意
  } else {
    const tier = r()
    if (tier < 0.12) {
      connectRate = 92.5 + r() * 3.5 // 告警
      lpRate = 90.5 + r() * 4.4 // 90.5–94.9 → <95
    } else if (tier < 0.32) {
      connectRate = 96 + r() * 2.5 // 注意
      lpRate = 95 + r() * 1.9 // 95–96.9
    } else {
      connectRate = 98 + r() * 1.8 // 良好
      lpRate = 97.2 + r() * 2.6 // ≥97
    }
  }
  connectRate = Math.min(99.9, round2(connectRate))
  lpRate = Math.min(99.9, round2(lpRate))
  const midnightRate = Math.min(99.9, round2(lpRate - 1 + r() * 4))
  const altRate = Math.min(99.9, round2(lpRate - 2 + r() * 5))
  const connected = Math.round((connectRate / 100) * meterTotal)
  const dhcDisconnect = Math.round((meterTotal - connected) * (0.2 + r() * 0.5))
  const eventCount = Math.round(meterTotal * 0.002 * (0.5 + r() * 2))
  return {
    meterTotal,
    connected,
    connectRate: round2((connected / meterTotal) * 100),
    lpRate,
    midnightRate,
    altRate,
    eventCount,
    dhcDisconnect,
  }
}

function finalize(node: RegionNode): RegionNode {
  if (node.children && node.children.length) {
    node.children = node.children.map(finalize)
    node.metrics = rollup(node.children.map((c) => c.metrics))
  }
  // 無智慧電表 → 沒有健康狀態可言 (以 good 避免 0 讀表率被誤判為 alert 而導致
  // 趨勢/著色變紅)；地圖層另以 meterTotal===0 判定顯示「無智慧電表」樣式。
  node.health = node.metrics.meterTotal === 0 ? 'good' : overallHealth(node.metrics)
  return node
}

/* ---------- build hierarchy ----------
   L2 counties → L3 行政區(鄉鎮市區) leaves. Districts come from the REAL MOI
   township roster (id = TOWNCODE) so the region tree and the map geographies
   share keys. 行政區 is the deepest level — no 村里 drill-down; clicking one
   opens the meter-detail drawer. */
function buildCounty(c: (typeof COUNTIES)[number], isDeployed: boolean): RegionNode {
  const r = mulberry32(hashStr(c.id))
  const roster = townRoster(c.name)
  const towns =
    roster.length > 0
      ? roster
      : Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => ({
          code: `${c.id}-D${i}`,
          name: `${c.name}第${i + 1}區`,
        }))

  const districts: RegionNode[] = towns.map((town) => {
    const dId = town.code
    const rd = mulberry32(hashStr(dId))
    // 行政區 is a leaf — its meter count is the county's share ± variance.
    // 未部署縣市其行政區全無電表；已部署縣市中亦保留少數 (~8%) 尚未佈建的行政區,
    // 讓「無智慧電表」在下鑽層級也看得到區分。
    const undeployedDistrict = !isDeployed || rd() < 0.08
    const dMeters = undeployedDistrict
      ? 0
      : Math.max(300, Math.round((c.meters / towns.length) * (0.6 + rd() * 0.8)))
    return {
      id: dId,
      name: town.name,
      level: 'L3' as const,
      parentId: c.id,
      metrics: makeLeafMetrics(dId, dMeters, c.tier),
      health: 'good' as const,
    }
  })

  return finalize({
    id: c.id,
    name: c.name,
    level: 'L2',
    geoKey: c.geoKey,
    metrics: {} as RegionMetrics,
    health: 'good',
    children: districts,
  })
}

/* ---------- public tree + helpers ---------- */

export function buildTaiwanTree(selectedCases?: Set<string>): {
  root: RegionNode
  index: Record<string, RegionNode>
  countyNodes: RegionNode[]
} {
  const hasFilter = !!(selectedCases && selectedCases.size > 0 && selectedCases.size < CASES.length)
  const activeCounties = new Set<string>()
  if (hasFilter && selectedCases) {
    selectedCases.forEach((cid) => {
      CASE_COUNTY_MAP[cid]?.forEach((id) => activeCounties.add(id))
    })
  }

  const isCountyDeployed = (c: (typeof COUNTIES)[number]) => {
    if (!hasFilter) {
      // 未篩選或全選：依預設（TTT 台東為未部署）
      return c.deployed !== false
    }
    return activeCounties.has(c.id)
  }

  const counties = COUNTIES.map((c) => buildCounty(c, isCountyDeployed(c)))
  const root = finalize({
    id: 'TW',
    name: '全台',
    level: 'L1',
    metrics: {} as RegionMetrics,
    health: 'good',
    children: counties,
  })

  const index: Record<string, RegionNode> = {}
  const walk = (n: RegionNode) => {
    index[n.id] = n
    n.children?.forEach(walk)
  }
  walk(root)

  return { root, index, countyNodes: root.children ?? [] }
}

const initialTree = buildTaiwanTree()
let currentIndex: Record<string, RegionNode> = initialTree.index

export const TAIWAN: RegionNode = initialTree.root
export const COUNTY_NODES: RegionNode[] = initialTree.countyNodes

/** 依目前套用的案別動態重算全台樹與索引 */
export function updateTaiwanTree(selectedCases?: Set<string>) {
  const next = buildTaiwanTree(selectedCases)
  currentIndex = next.index
  return next
}

export const getById = (id: string) => currentIndex[id]
