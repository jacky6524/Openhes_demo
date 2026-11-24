import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { METER_LIST_ROWS, DCU_LIST_ROWS, type MeterListRow, type DcuListRow } from '@/data/dcuListPage'
import { Th, SortHead, InfiniteFooter, useInfiniteRows, type SortDir } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'
import { PageTitle } from '@/components/shared/PageTitle'
import { PillTabs } from '@/components/shared/PillTabs'

/**
 * 裝置管理 · 即裝即查（Figma 3966:26671／3966:28710／3966:29593，同一頁依「搜尋模式」變三種版面）：
 *   表號         → 電表註冊／最後連線回報／最後LP時間（同一張卡片）
 *   FAN IMEI/MAC → 電表註冊（卡片）＋事件資料（獨立表格）
 *   DCU序號      → 電表註冊（DCU 版欄位）／最後連線回報（卡片）＋網管資料（獨立表格）
 * 2026-10-22 業主新版設計稿「即裝即查-1／-2／-3」：搜尋模式改單選鈕；「最後連線回報」「最後LP時間」
 * 的時間移到標題旁（紅字）；表格獨立成卡片、欄位可排序、無限捲動（不分頁）；電表註冊多「來源 HES」。
 * 設計稿 -3（DCU序號）的電表註冊欄位是整段複製電表版，DCU 沒有表號／電號，這裡仍用 DCU 版欄位。
 * 另有 3971:30755、3977:31162… 等同名畫面，經確認是註冊衝突、裝置群組，各自獨立成頁。
 * 資料全為 mock，取自電表清單／DCU清單；清單沒有的欄位用序號 hash 補。
 *
 * 2026-11-04 業主意見：結果下方留白太多 → 整頁撐滿視窗，並以圖表補足：
 *   表號         卡片＋「今日 LP 回報」（96 格，每 15 分一格：已收到／缺漏／未到時間）＋「今日訊號強度」折線
 *   FAN IMEI/MAC 卡片＋事件資料表（撐滿剩餘高度）
 *   DCU序號      卡片＋網管資料：訊號強度趨勢折線＋表格並排（撐滿剩餘高度）
 * 2026-11-06 業主設計稿：搜尋模式改膠囊頁籤（同即時讀表）；「事件資料」「網管資料」標題原本浮在頁面底色上，
 *   改放進表格卡片內、表格上方。
 * 2026-11-11 業主意見＋設計稿（1111調整內容/1110修改）：
 *   表號／FAN IMEI/MAC → 版面相同：卡片＋左下「連線紀錄」表＋右下「讀表 × 連線概況」LP/MN/ALT 三線（比照系統總覽）
 *   DCU序號             → 卡片＋左下「連線紀錄」表＋右下「訊號強度趨勢」
 *   圖表與連線紀錄一律為「近 24 小時」（每小時一筆）。頁名 2026-11-17 依業主改為「即時查詢」（原「即裝即查」）。
 * mock 的「現在」＝2025/01/01 15:00；近 24 小時＝2024/12/31 16:00 ～ 2025/01/01 15:00。
 */
const MODES = [
  { key: 'meterNo', label: '表號' },
  { key: 'fanMac', label: 'FAN IMEI/MAC' },
  { key: 'dcuSerial', label: 'DCU 序號' },
] as const
type Mode = (typeof MODES)[number]['key']

/**
 * 各搜尋模式的預設搜尋內容（2026-10-22 業主要求先填預設值，按下搜尋一定查得到）。
 * 2026-11-11：原本取清單第一筆，剛好是斷線、最後回報在 24 小時之外的表 → 圖表、連線紀錄全空，
 * 業主以為沒做好。改取「在線、今天有回報」的第一顆表／在線的第一台 DCU。
 */
const SAMPLE_METER = METER_LIST_ROWS.find((m) => m.online && m.lastLpSameDay) ?? METER_LIST_ROWS[0]
const SAMPLE: Record<Mode, string> = {
  meterNo: SAMPLE_METER.meterNo,
  fanMac: SAMPLE_METER.fanMac,
  dcuSerial: (DCU_LIST_ROWS.find((d) => d.online) ?? DCU_LIST_ROWS[0]).serial,
}

type Result = { kind: 'meter'; m: MeterListRow; mode: Mode } | { kind: 'dcu'; d: DcuListRow } | 'none' | null

export function InstantQuery() {
  const [mode, setMode] = useState<Mode>('meterNo')
  const [text, setText] = useState(SAMPLE.meterNo)
  const [result, setResult] = useState<Result>(null)

  const search = () => {
    const q = text.trim().toLowerCase()
    if (!q) return setResult(null)
    if (mode === 'dcuSerial') {
      const d = DCU_LIST_ROWS.find((x) => x.serial.toLowerCase() === q)
      return setResult(d ? { kind: 'dcu', d } : 'none')
    }
    const m = METER_LIST_ROWS.find((x) => String(x[mode]).toLowerCase() === q)
    setResult(m ? { kind: 'meter', m, mode } : 'none')
  }
  const clear = () => { setMode('meterNo'); setText(SAMPLE.meterNo); setResult(null) }

  return (
    <div className="flex h-full min-h-[760px] min-w-[1280px] flex-col gap-3 p-4">
      <PageTitle title="即時查詢" />
      <div className="flex flex-col gap-1">
        <PillTabs tabs={MODES} value={mode} onChange={(k) => { setMode(k); setText(SAMPLE[k]); setResult(null) }} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={`請輸入${MODES.find((x) => x.key === mode)!.label}`}
            className={`${BOX} w-[480px]`}
          />
          <button onClick={clear} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button onClick={search} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            搜尋
          </button>
        </div>
      </div>

      {result === null && <Card><Empty text="請選擇搜尋模式並輸入關鍵字後按「搜尋」" /></Card>}
      {result === 'none' && <Card><Empty text="查無符合條件的裝置" /></Card>}
      {result && result !== 'none' && result.kind === 'meter' && <MeterResult m={result.m} />}
      {result && result !== 'none' && result.kind === 'dcu' && <DcuResult d={result.d} />}
    </div>
  )
}

/* ───────────────────────── 兩種結果版面 ───────────────────────── */

function lpStamp(s: string) {
  const [d, t] = s.split(' ')
  return `${d.replace(/-/g, '/')} ${t.slice(0, 5)}`
}
const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const missing = (label: string) => <span style={{ color: statusTok.danger.fg }}>{label}</span>
const sourceHes = (seed: string) => `TP-HES-0${1 + (seedOf(seed) % 9)}`

function ConnTag({ online }: { online: boolean }) {
  const tok = online ? statusTok.normal : statusTok.danger
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink" style={{ background: tok.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: tok.fg }} />
      {online ? '連線' : '斷線'}
    </span>
  )
}

/** 表號、FAN IMEI/MAC 兩種模式查到的都是電表，版面相同（2026-11-11 設計稿） */
function MeterResult({ m }: { m: MeterListRow }) {
  /** 一部分電表 OpenHES 沒有首次註冊記錄（紅字提示，設計稿即為此狀態） */
  const noFirst = seedOf(m.meterNo) % 2 === 0
  const stamp = lpStamp(m.lastLp)
  const hours = useMemo(() => meterHours(m), [m])
  return (
    <>
      <Card>
        <Section title="電表註冊">
          <Cell label="時間" value={stamp} />
          <Cell label="表號" value={m.meterNo} />
          <Cell label="電號" value={m.elecNo} />
          <Cell label="FAN" value={m.fanMac} />
          <Cell label="模組韌體型號" value={m.moduleModel} />
          <Cell label="模組韌體版本" value="--" />
          <Cell label="狀態" value="已註冊" />
          <Cell label="首次註冊時間" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊時間') : stamp} />
          <Cell label="來源 HES" value={sourceHes(m.meterNo)} />
          <Cell label="IP address" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : m.ip} />
        </Section>
        <Section title="最後連線回報" stamp={stamp}>
          <Cell label="Cell ID" value={String(8000000 + (seedOf(m.meterNo) % 99999))} />
          <Cell label="IP" value={m.ip} />
          <Cell label="Parent" value={m.dcuSerial || '--'} />
          <Cell label="連線狀態" value={<ConnTag online={m.online} />} />
        </Section>
        <Section title="最後LP時間" stamp={stamp} />
      </Card>
      <div className="grid min-h-[320px] flex-1 grid-cols-2 gap-3">
        <SortTable title="連線紀錄" hint="近 24 小時" fill columns={['連線日期', '訊號強度']} sortable={[]} rows={connRows(hours)} empty={`近 24 小時沒有連線紀錄（最後回報 ${stamp}）`} />
        <ReadRateCard hours={hours} lastStamp={stamp} meterNo={m.meterNo} />
      </div>
    </>
  )
}

function DcuResult({ d }: { d: DcuListRow }) {
  const noFirst = seedOf(d.serial) % 2 === 0
  const stamp = '2026/08/26 15:00'
  const hours = useMemo(() => dcuHours(d), [d])
  return (
    <>
      <Card>
        <Section title="電表註冊">
          <Cell label="時間" value={stamp} />
          <Cell label="型號" value={d.model} />
          <Cell label="韌體版本" value="--" />
          <Cell label="狀態" value="已註冊" />
          <Cell label="首次註冊時間" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊時間') : stamp} />
          <Cell label="IMSI" value={noFirst ? missing('OpenHES目前沒有記錄首次註冊IP') : `466${String(seedOf(d.serial)).padStart(12, '0').slice(0, 12)}`} />
          <Cell label="來源 HES" value={sourceHes(d.serial)} />
          <Cell label="IP address" value={d.ip} />
        </Section>
        <Section title="最後連線回報" stamp={stamp}>
          <Cell label="Cell ID" value={String(8000000 + (seedOf(d.serial) % 99999))} />
          <Cell label="IP" value={d.ip} />
          <Cell label="Parent" value={d.serial} />
          <Cell label="連線狀態" value={<ConnTag online={d.online} />} />
        </Section>
      </Card>
      <div className="grid min-h-[320px] flex-1 grid-cols-2 gap-3">
        <SortTable title="連線紀錄" hint="近 24 小時" fill columns={['連線日期', '訊號強度']} sortable={[]} rows={connRows(hours)} empty="近 24 小時沒有連線紀錄" />
        <SignalCard title="訊號強度趨勢" hint="近 24 小時・每小時一筆・數值越大訊號越好" points={hours} empty="近 24 小時沒有連線紀錄" />
      </div>
    </>
  )
}

/* ───────────────────────── 近 24 小時 mock 資料（2026-11-11） ───────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, '0')
/** mock 的「現在」＝2025/01/01 15:00；近 24 小時＝前一天 16:00 起，每小時一格，共 24 格 */
const NOW_HOUR = 15
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = (NOW_HOUR + 1 + i) % 24
  const date = i < 24 - NOW_HOUR - 1 ? '2024/12/31' : '2025/01/01'
  return { label: `${pad2(h)}:00`, full: `${date} ${pad2(h)}:00`, key: `${date} ${pad2(h)}` }
})

type RateKey = 'lp' | 'midnight' | 'alt'
/** [實收筆數, 應收筆數]；null＝該小時本來就不該有這類資料（例如 MN 只在 00 點那一小時） */
type Count = [number, number] | null

interface HourPoint {
  label: string
  full: string
  /** 該小時的訊號強度 dBm；null＝該小時沒有連線 */
  v: number | null
  /** 每小時讀表率（%）＝實收 ÷ 應收；null＝該小時不應收 */
  lp: number | null
  midnight: number | null
  alt: number | null
  cnt: Record<RateKey, Count>
}

/** 每小時應收筆數：LP 每 15 分一筆＝4；ALT 每小時 1 筆；MN 每日 1 筆，落在 00 點那一小時 */
const EXPECT: Record<RateKey, (hour: number) => number> = {
  lp: () => 4,
  alt: () => 1,
  midnight: (h) => (h === 0 ? 1 : 0),
}
const pct = (c: Count) => (c ? Math.round((c[0] / c[1]) * 1000) / 10 : null)

/**
 * 電表近 24 小時（2026-11-11）：先產生**每小時實收筆數**，讀表率一律由筆數算出，數字可以逐格核對。
 *   連線中的小時：LP 偶爾漏 1～2 筆、ALT 偶爾漏 1 筆（依表號 hash 固定，重整不變）
 *   最後 LP（＝最後回報）之後沒有連線 → 全部 0 筆
 */
function meterHours(m: MeterListRow): HourPoint[] {
  const last = m.lastLp.slice(0, 13) // 'YYYY/MM/DD HH'
  const s = seedOf(m.meterNo)
  const base = -(68 + (s % 18))
  return HOURS.map((h, i) => {
    const hour = Number(h.label.slice(0, 2))
    const on = m.online || h.key <= last
    const got: Record<RateKey, number> = {
      lp: !on ? 0 : (s + i * 7) % 23 === 0 ? 2 : (s + i * 7) % 7 === 0 ? 3 : 4,
      alt: !on ? 0 : (s + i * 5) % 9 === 0 ? 0 : 1,
      midnight: on ? 1 : 0,
    }
    const cnt = Object.fromEntries(
      (['lp', 'midnight', 'alt'] as RateKey[]).map((k) => {
        const exp = EXPECT[k](hour)
        return [k, exp ? [Math.min(got[k], exp), exp] : null]
      }),
    ) as Record<RateKey, Count>
    return {
      label: h.label,
      full: h.full,
      v: on ? base + (((s >> (i % 8)) + i * 5) % 11) - 5 : null,
      lp: pct(cnt.lp),
      midnight: pct(cnt.midnight),
      alt: pct(cnt.alt),
      cnt,
    }
  })
}

/**
 * DCU 近 24 小時：每小時一筆訊號強度；斷線的 DCU 最後 6 小時沒有回報。
 * 2026-11-19 業主：原本用取餘數產生，鋸齒狀亂跳 → 改成「正常漲跌」：
 * 以該 DCU 的基準值為中心隨機漫步（每小時 ±0～3 dB、會被拉回基準），疊一點日夜起伏（深夜干擾少、略好）。
 */
function dcuHours(d: DcuListRow): HourPoint[] {
  const s = seedOf(d.serial)
  let r = s || 1
  const rand = () => { r = (r * 1103515245 + 12345) >>> 0; return (r >>> 8) / 0x1000000 } // 0～1，依序號固定
  const base = -(80 + (s % 14)) // -80 ～ -93
  let cur = base + (rand() - 0.5) * 6
  const sig = HOURS.map((h) => {
    const hour = Number(h.label.slice(0, 2))
    const diurnal = Math.cos(((hour - 3) / 24) * 2 * Math.PI) * 2.5 // 03 點最好、15 點最差
    cur += (rand() - 0.5) * 5 + (base + diurnal - cur) * 0.3
    return Math.round(Math.max(-112, Math.min(-62, cur)))
  })
  return HOURS.map((h, i) => ({
    label: h.label,
    full: h.full,
    v: d.online || i < 18 ? sig[i] : null,
    lp: null,
    midnight: null,
    alt: null,
    cnt: { lp: null, midnight: null, alt: null },
  }))
}

/** 連線紀錄表：有連線的小時各一筆，新到舊 */
function connRows(hours: HourPoint[]): string[][] {
  return hours.filter((h) => h.v !== null).reverse().map((h) => [`${h.full}:00`, `${h.v} dBm（${gradeOf(h.v!).label}）`])
}

/* ───────────────────────── 圖表 ───────────────────────── */

/** 圖表時序折線系列（24 小時連續讀表率，對齊 MDMS 色彩：LP 藍紫、ALT 粉紅） */
const CHART_SERIES = [
  { key: 'lp', label: 'LP 讀表率', short: 'LP', color: '#5B5BD6', note: '每 15 分 1 筆，每小時應收 4 筆' },
  { key: 'alt', label: 'ALT 讀表率', short: 'ALT', color: '#D9588F', note: '每小時應收 1 筆' },
] as const

type ChartKey = 'lp' | 'alt'

/** 所有讀表類型（含每日結算型的 MN） */
const RATE_SERIES = [
  ...CHART_SERIES,
  { key: 'midnight', label: 'MN 午夜讀表', short: 'MN', color: '#0284C7', note: '每日 1 筆，00 點固定凍結讀值' },
] as const

const fmtPct = (n: number | null) => (n === null ? '--' : `${n % 1 ? n.toFixed(1) : n}%`)

interface MidnightRecord {
  id: string
  time: string
  type: '定時凍結' | '自動補抄' | '手動讀取'
  status: '成功' | '缺漏'
  rate: string
}

function getMidnightRecords(meterNo?: string): MidnightRecord[] {
  const seed = meterNo ? seedOf(meterNo) : 7
  // 某些表有補抄情境（示範可能有多於一筆資料）：
  if (seed % 3 === 0) {
    return [
      { id: '1', time: '2025/01/01 00:00', type: '定時凍結', status: '缺漏', rate: '0%' },
      { id: '2', time: '2025/01/01 03:22', type: '自動補抄', status: '成功', rate: '100%' },
    ]
  }
  // 一般正常 1 筆：
  return [
    { id: '1', time: '2025/01/01 00:00', type: '定時凍結', status: '成功', rate: '100%' },
  ]
}

function ReadRateCard({
  hours,
  lastStamp,
  meterNo,
}: {
  hours: HourPoint[]
  lastStamp: string
  meterNo?: string
}) {
  const [focus, setFocus] = useState<ChartKey | null>(null)
  /** 近 24 小時完全沒有連線（斷線很久的表）：讀表率全是 0，線會貼在底部看不出來 → 疊一層說明 */
  const silent = hours.every((h) => h.v === null)

  const mnRecords = useMemo(() => {
    if (silent) {
      return [
        { id: '1', time: '2025/01/01 00:00', type: '定時凍結' as const, status: '缺漏' as const, rate: '0%' },
      ]
    }
    return getMidnightRecords(meterNo)
  }, [meterNo, silent])

  // 24 小時合計：實收 / 應收
  const total = useMemo(
    () =>
      RATE_SERIES.map((r) => {
        let got = 0
        let exp = 0
        for (const h of hours) {
          const c = h.cnt[r.key]
          if (c) { got += c[0]; exp += c[1] }
        }
        return { ...r, got, exp, rate: exp ? Math.round((got / exp) * 1000) / 10 : null }
      }),
    [hours],
  )

  const lpTotal = total.find((t) => t.key === 'lp')!
  const altTotal = total.find((t) => t.key === 'alt')!

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionTitle title="讀表 × 連線概況" />
          {focus !== null && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="rounded bg-inset px-2 py-0.5 text-[11px] font-medium text-ink-sub hover:bg-divider hover:text-ink transition-colors cursor-pointer"
            >
              顯示全部
            </button>
          )}
        </div>
        <span className="text-[12px] text-ink-mut">
          {focus !== null
            ? `目前顯示：${CHART_SERIES.find((r) => r.key === focus)?.label}`
            : '近 24 小時・每小時讀表率＝實收 ÷ 應收'}
        </span>
      </div>

      {/* 左右分區：左側【LP / ALT 時序折線區塊】，右側【MN 午夜資料條列區塊】 */}
      <div className="mt-3 flex flex-1 min-h-[220px] gap-4">
        {/* ─── 左側：LP / ALT 兩張切換卡 + 24小時折線圖 ─── */}
        <div className="flex flex-1 min-w-0 flex-col">
          {/* 上方 2 張時序折線開關卡（參考 MDMS style：淡紫/淡粉低飽和底色、移除標題 icon） */}
          <div className="grid grid-cols-2 gap-2">
            {/* LP 讀表率 */}
            <button
              type="button"
              onClick={() => setFocus((prev) => (prev === 'lp' ? null : 'lp'))}
              className={[
                'rounded-lg px-3 py-2 text-left transition-all duration-150 relative cursor-pointer border',
                focus === 'lp'
                  ? 'shadow-card -translate-y-0.5'
                  : focus !== null
                  ? 'opacity-40 hover:opacity-80'
                  : 'hover:shadow-card hover:-translate-y-0.5',
              ].join(' ')}
              style={{
                background: focus === 'lp' ? '#EAEAFB' : '#F2F2FD',
                borderColor: focus === 'lp' ? '#5B5BD6' : 'rgba(91, 91, 214, 0.22)',
                boxShadow: focus === 'lp' ? 'inset 0 0 0 1.5px #5B5BD6' : undefined,
              }}
              title={focus === 'lp' ? '目前顯示中（再點一次看全部）' : '每 15 分 1 筆，每小時應收 4 筆（點擊切換折線）'}
            >
              <div className="text-[12.5px] font-semibold text-ink">LP 讀表率</div>
              <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
                <b className="text-[20px] font-bold" style={{ color: '#5B5BD6' }}>{fmtPct(lpTotal.rate)}</b>
                <span className="text-[12px] text-ink-sub">{lpTotal.got} / {lpTotal.exp} 筆</span>
              </div>
            </button>

            {/* ALT 讀表率 */}
            <button
              type="button"
              onClick={() => setFocus((prev) => (prev === 'alt' ? null : 'alt'))}
              className={[
                'rounded-lg px-3 py-2 text-left transition-all duration-150 relative cursor-pointer border',
                focus === 'alt'
                  ? 'shadow-card -translate-y-0.5'
                  : focus !== null
                  ? 'opacity-40 hover:opacity-80'
                  : 'hover:shadow-card hover:-translate-y-0.5',
              ].join(' ')}
              style={{
                background: focus === 'alt' ? '#FBE8F0' : '#FCEFF5',
                borderColor: focus === 'alt' ? '#D9588F' : 'rgba(217, 88, 143, 0.22)',
                boxShadow: focus === 'alt' ? 'inset 0 0 0 1.5px #D9588F' : undefined,
              }}
              title={focus === 'alt' ? '目前顯示中（再點一次看全部）' : '每小時應收 1 筆（點擊切換折線）'}
            >
              <div className="text-[12.5px] font-semibold text-ink">ALT 讀表率</div>
              <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
                <b className="text-[20px] font-bold" style={{ color: '#D9588F' }}>{fmtPct(altTotal.rate)}</b>
                <span className="text-[12px] text-ink-sub">{altTotal.got} / {altTotal.exp} 筆</span>
              </div>
            </button>
          </div>

          {/* 下方 24 小時時序折線圖 */}
          <div className="relative mt-2 min-h-[160px] flex-1">
            {silent && (
              <div className="absolute inset-0 z-10 grid place-items-center">
                <div className="rounded-lg border border-border bg-surface/95 px-4 py-3 text-center text-[13px] shadow-card">
                  <div className="font-semibold" style={{ color: statusTok.danger.fg }}>近 24 小時沒有任何回報</div>
                  <div className="mt-0.5 text-ink-sub">最後回報 {lastStamp}，此期間讀表率皆為 0%</div>
                </div>
              </div>
            )}

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hours} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  {CHART_SERIES.map((r) => (
                    <linearGradient key={r.key} id={`iq-grad-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={r.color} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={r.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="#EEF0F3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} interval={2} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} width={32} unit="%" />
                <Tooltip cursor={{ stroke: '#C9CDD4', strokeDasharray: '3 3' }} content={<RateTip focus={focus} />} />

                {/* LP 讀表率 */}
                {(focus === null || focus === 'lp') && (
                  <Area
                    type="linear"
                    dataKey="lp"
                    name="LP 讀表率"
                    stroke="#5B5BD6"
                    strokeWidth={focus === 'lp' ? 2.2 : 1.8}
                    fill="url(#iq-grad-lp)"
                    connectNulls={false}
                    dot={{ r: 2.5, fill: '#fff', stroke: '#5B5BD6', strokeWidth: 1.5 }}
                    activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                )}

                {/* ALT 讀表率 */}
                {(focus === null || focus === 'alt') && (
                  <Area
                    type="linear"
                    dataKey="alt"
                    name="ALT 讀表率"
                    stroke="#D9588F"
                    strokeWidth={focus === 'alt' ? 2.2 : 1.8}
                    fill="url(#iq-grad-alt)"
                    connectNulls={false}
                    dot={{ r: 2.5, fill: '#fff', stroke: '#D9588F', strokeWidth: 1.5 }}
                    activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ─── 右側：MN 午夜資料整張卡片（MDMS style：淡青藍底色、無藍點、無底部備註、顯示％與日期幾時幾分） ─── */}
        <div
          className="flex w-[240px] shrink-0 flex-col rounded-lg border p-3"
          style={{
            background: '#EAF6FA',
            borderColor: 'rgba(26, 159, 196, 0.22)',
          }}
        >
          {/* 卡片標題列 */}
          <div
            className="flex items-center justify-between pb-2 border-b"
            style={{ borderColor: 'rgba(26, 159, 196, 0.16)' }}
          >
            <span className="text-[12.5px] font-semibold text-ink">午夜資料</span>
            <span className="text-[11px] font-medium text-ink-sub tabular-nums">
              {mnRecords.length} 筆回報
            </span>
          </div>

          {/* 條列內容 */}
          <div className="flex flex-1 flex-col divide-y divide-sky-200/50 overflow-y-auto">
            {mnRecords.map((r) => {
              const isMiss = r.status === '缺漏'
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2.5 text-[12.5px]"
                >
                  <div className="flex items-center gap-1.5 tabular-nums text-ink">
                    <span>{r.time}</span>
                    {r.type === '自動補抄' && (
                      <span className="rounded bg-sky-100/90 text-sky-800 border border-sky-300/70 px-1 py-0.2 text-[10px] font-medium">
                        補抄
                      </span>
                    )}
                  </div>
                  <span
                    className="font-bold tabular-nums"
                    style={{ color: isMiss ? statusTok.danger.fg : '#1A9FC4' }}
                  >
                    {r.rate}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function RateTip({
  active,
  payload,
  focus,
}: {
  active?: boolean
  payload?: Array<{ payload: HourPoint }>
  focus?: ChartKey | null
}) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null

  // 若有單獨聚焦，只顯示該指標；否則同時顯示 LP 與 ALT
  const seriesToShow = focus ? CHART_SERIES.filter((r) => r.key === focus) : CHART_SERIES

  return (
    <div className="min-w-[190px] rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card">
      <div className="mb-1 tabular-nums text-ink-sub">{p.full}</div>
      {p.v === null && <div className="mb-1" style={{ color: statusTok.danger.fg }}>該小時無連線</div>}
      {seriesToShow.map((r) => {
        const c = p.cnt[r.key]
        return (
          <div key={r.key} className="flex items-center gap-2 leading-[1.8]">
            <span className="size-2 rounded-full" style={{ background: r.color }} />
            <span className="text-ink-sub">{r.short}</span>
            {c ? (
              <span className="ml-auto tabular-nums text-ink">
                <span className="text-ink-sub">{c[0]} / {c[1]} 筆＝</span>
                <b className="font-medium">{fmtPct(p[r.key])}</b>
              </span>
            ) : (
              <span className="ml-auto text-ink-mut">本小時不需讀</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 訊號強度分級與色卡設定：
 * - 圖表左側 Y 軸標記明確的 dBm 數值，數值越大（越接近 0）代表訊號越強。
 * - 強 / 中 / 弱 獨立以色卡呈現，對應圖表中三帶背景色與門檻線。
 */
const SIG_FLOOR = -120
const SIG_CEIL = -50
const SIG_TICKS = [-120, -100, -85, -70, -50]
const SIG_GRADES = [
  {
    label: '強',
    min: -85,
    max: SIG_CEIL,
    fill: '#ECFDF5',
    color: '#059669',
    cardBg: '#F0FDF4',
    cardBorder: '#BBF7D0',
    range: '≥ -85 dBm',
  },
  {
    label: '中',
    min: -100,
    max: -85,
    fill: '#FFFBEB',
    color: '#D97706',
    cardBg: '#FFFDF5',
    cardBorder: '#FDE68A',
    range: '-85 ~ -100 dBm',
  },
  {
    label: '弱',
    min: SIG_FLOOR,
    max: -100,
    fill: '#FEF2F2',
    color: '#DC2626',
    cardBg: '#FEF2F2',
    cardBorder: '#FECACA',
    range: '< -100 dBm',
  },
] as const
const gradeOf = (v: number) => SIG_GRADES.find((g) => v >= g.min) ?? SIG_GRADES[2]

function SignalCard({ title, hint, points, empty }: { title: string; hint: string; points: HourPoint[]; empty: string }) {
  const has = points.some((p) => p.v !== null)
  const line = statusTok.info.fg
  const validTotal = points.filter((p) => p.v !== null).length

  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle title={title} />
        <span className="text-[12px] text-ink-mut">{hint}</span>
      </div>

      {has ? (
        <>
          {/* 強 / 中 / 弱 色卡對應 */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SIG_GRADES.map((g) => {
              const count = points.filter((p) => p.v !== null && gradeOf(p.v).label === g.label).length
              const pct = validTotal > 0 ? Math.round((count / validTotal) * 100) : 0
              return (
                <div
                  key={g.label}
                  className="rounded-lg border px-3 py-2 transition-shadow"
                  style={{ background: g.cardBg, borderColor: g.cardBorder }}
                  title={`訊號${g.label}：${g.range}，近 24 小時共 ${count} 筆 (${pct}%)`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">訊號{g.label}</span>
                    <span className="text-[11px] font-medium text-ink-sub tabular-nums">{g.range}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                    <b className="text-[20px] font-bold" style={{ color: g.color }}>
                      {count}
                    </b>
                    <span className="text-[12px] text-ink-sub">
                      / {validTotal} 筆<span className="ml-1 text-[11px] text-ink-mut">({pct}%)</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-2 min-h-[180px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              {/* 純折線圖：保留強/中/弱綠黃紅背景分級色塊與門檻線，移除曲線下方的漸層面積底色 */}
              <LineChart data={points} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                {SIG_GRADES.map((g) => (
                  <ReferenceArea key={g.label} y1={g.min} y2={g.max} fill={g.fill} fillOpacity={0.85} stroke="none" ifOverflow="hidden" />
                ))}
                {[-100, -85].map((y) => (
                  <ReferenceLine key={y} y={y} stroke="#CBD5E1" strokeDasharray="3 3" />
                ))}
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} interval={1} />
                <YAxis
                  domain={[SIG_FLOOR, SIG_CEIL]}
                  ticks={SIG_TICKS}
                  tickFormatter={(v: number) => `${v} dBm`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#6A7282' }}
                  width={62}
                />
                <Tooltip cursor={{ stroke: '#C9CDD4', strokeDasharray: '3 3' }} content={<SigTip />} />
                <Line
                  dataKey="v"
                  type="monotone"
                  stroke={line}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, fill: '#fff', stroke: line, strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-ink-mut">{empty}</div>
      )}
    </div>
  )
}

function SigTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HourPoint }> }) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null
  const g = p.v !== null ? gradeOf(p.v) : null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card">
      <div className="tabular-nums text-ink-sub">{p.full}</div>
      <div className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-ink">
        {p.v === null ? (
          <span style={{ color: statusTok.danger.fg }}>無連線</span>
        ) : (
          <>
            <span className="size-2 rounded-full" style={{ background: g?.color }} />
            <span>訊號{g?.label}</span>
            <span className="ml-1 font-normal text-ink-sub">{p.v} dBm</span>
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── 共用小零件 ───────────────────────── */

/**
 * 獨立表格卡片：表頭釘住、表格自己捲、無限捲動（業主 2026-08-27 表格標準、不要頁碼）。
 * 只有 sortable 列出的欄位有排序箭頭；排序以字串比對（時間格式為 ISO，字串序即時間序）。
 */
function SortTable({ title, hint, columns, sortable, rows, fill = false, empty = '沒有資料' }: { title?: string; hint?: string; columns: string[]; sortable: number[]; rows: string[][]; fill?: boolean; empty?: string }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (sortCol === null) return rows
    return [...rows].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortCol].localeCompare(b[sortCol]))
  }, [rows, sortCol, sortDir])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(sorted.length, [rows, sortCol, sortDir], 10)

  const toggle = (c: number) => {
    if (c === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(c); setSortDir('asc') }
  }

  return (
    <div className={`overflow-hidden rounded-card border border-border bg-surface shadow-card ${fill ? 'flex min-h-[300px] flex-1 flex-col' : ''}`}>
      {/* 標題在卡片內、表格上方（2026-11-06 設計稿） */}
      {title && (
        <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pb-3 pt-4">
          <SectionTitle title={title} />
          {hint && <span className="text-[12px] text-ink-mut">{hint}</span>}
        </div>
      )}
      {/* fill：撐滿父層剩餘高度（父層要是 flex column）；否則維持固定上限 */}
      <div ref={scrollRef} className={fill ? 'min-h-[200px] flex-1 overflow-auto' : 'max-h-[calc(100vh-460px)] min-h-[240px] overflow-auto'}>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-ink-sub">
              {columns.map((c, i) => (
                <Th key={c} className="sticky top-0 z-10 bg-inset">
                  {sortable.includes(i)
                    ? <SortHead label={c} active={sortCol === i} dir={sortDir} onClick={() => toggle(i)} />
                    : c}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, visible).map((r, i) => (
              <tr key={i} className="border-b border-divider">
                {r.map((v, j) => <td key={j} className="px-3 py-2.5 text-ink tabular-nums">{v}</td>)}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-[13px] text-ink-mut">{empty}</td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} />
      </div>
      <InfiniteFooter loaded={visible} total={sorted.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">{children}</div>
}

function SectionTitle({ title, stamp }: { title: string; stamp?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px] rounded-full bg-danger" />
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {stamp && <span className="text-[13px] tabular-nums text-brand">{stamp}</span>}
    </div>
  )
}

/** stamp：標題旁的紅字時間；沒有 children 時只有標題列（最後LP時間） */
function Section({ title, stamp, children }: { title: string; stamp?: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} stamp={stamp} />
      {children && <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-divider">{children}</div>}
    </section>
  )
}

/** 三欄網格＋斑馬紋：以 CSS 奇偶「列」上色（每列三格），不用算 index */
function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-[13px] [&:nth-child(6n+1)]:bg-inset [&:nth-child(6n+2)]:bg-inset [&:nth-child(6n+3)]:bg-inset">
      <span className="flex w-[120px] shrink-0 items-center gap-2 text-ink-sub">
        <span className="size-1.5 rounded-full" style={{ background: '#2B7FFF' }} />{label}
      </span>
      <span className="min-w-0 truncate text-ink">{value}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-[13px] text-ink-mut">
      <Search size={22} className="text-ink-fai" />
      <span>{text}</span>
    </div>
  )
}

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
