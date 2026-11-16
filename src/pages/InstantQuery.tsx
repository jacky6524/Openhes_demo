import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
 *   圖表與連線紀錄一律為「近 24 小時」（每小時一筆）。頁名「即裝即查」業主仍在確認是否改名，暫不動。
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
      <PageTitle title="即裝即查" />
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
        <SortTable title="連線紀錄" hint="近 24 小時" fill columns={['連線日期', '訊號強度']} sortable={[0]} rows={connRows(hours)} empty={`近 24 小時沒有連線紀錄（最後回報 ${stamp}）`} />
        <ReadRateCard hours={hours} lastStamp={stamp} />
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
        <SortTable title="連線紀錄" hint="近 24 小時" fill columns={['連線日期', '訊號強度']} sortable={[0]} rows={connRows(hours)} empty="近 24 小時沒有連線紀錄" />
        <SignalCard title="訊號強度趨勢" hint="近 24 小時・每小時一筆・dBm，越接近 0 越好" points={hours} empty="近 24 小時沒有連線紀錄" />
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

/** DCU 近 24 小時：每小時一筆訊號強度；斷線的 DCU 最後 6 小時沒有回報 */
function dcuHours(d: DcuListRow): HourPoint[] {
  const s = seedOf(d.serial)
  return HOURS.map((h, i) => ({
    label: h.label,
    full: h.full,
    v: d.online || i < 18 ? -(78 + ((s + i * 7) % 26)) : null,
    lp: null,
    midnight: null,
    alt: null,
    cnt: { lp: null, midnight: null, alt: null },
  }))
}

/** 連線紀錄表：有連線的小時各一筆，新到舊 */
function connRows(hours: HourPoint[]): string[][] {
  return hours.filter((h) => h.v !== null).reverse().map((h) => [`${h.full}:00`, String(h.v)])
}

/* ───────────────────────── 圖表 ───────────────────────── */

/** 與系統總覽 SharedMetricCard 同色票 */
const RATE_SERIES = [
  { key: 'lp', label: 'LP 讀表率', short: 'LP', color: '#5E5CE6', note: '每 15 分 1 筆，每小時應收 4 筆' },
  { key: 'midnight', label: 'MN 午夜讀表率', short: 'MN', color: '#64D2FF', note: '每日 1 筆，00 點那一小時應收' },
  { key: 'alt', label: 'ALT 讀表率', short: 'ALT', color: '#FF858D', note: '每小時應收 1 筆' },
] as const

const fmtPct = (n: number | null) => (n === null ? '--' : `${n % 1 ? n.toFixed(1) : n}%`)

function ReadRateCard({ hours, lastStamp }: { hours: HourPoint[]; lastStamp: string }) {
  /** 近 24 小時完全沒有連線（斷線很久的表）：讀表率全是 0，線會貼在底部看不出來 → 疊一層說明 */
  const silent = hours.every((h) => h.v === null)
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
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle title="讀表 × 連線概況" />
        <span className="text-[12px] text-ink-mut">近 24 小時・每小時讀表率＝實收 ÷ 應收</span>
      </div>
      {/* 24 小時合計（兼圖例）：hover 看應收規則 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {total.map((t) => (
          <div key={t.key} className="rounded-lg bg-inset px-3 py-2" title={t.note}>
            <div className="flex items-center gap-1.5 text-[12px] text-ink-sub">
              <span className="h-[7px] w-2.5 rounded-[2px]" style={{ background: t.color }} />
              {t.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
              <b className="text-[20px] font-bold text-ink">{fmtPct(t.rate)}</b>
              <span className="text-[12px] text-ink-sub">{t.got} / {t.exp} 筆</span>
            </div>
          </div>
        ))}
      </div>
      <div className="relative mt-2 min-h-[180px] flex-1">
        {silent && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="rounded-lg border border-border bg-surface/95 px-4 py-3 text-center text-[13px] shadow-card">
              <div className="font-semibold" style={{ color: statusTok.danger.fg }}>近 24 小時沒有任何回報</div>
              <div className="mt-0.5 text-ink-sub">最後回報 {lastStamp}，此期間讀表率皆為 0%</div>
            </div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hours} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              {RATE_SERIES.map((r) => (
                <linearGradient key={r.key} id={`iq-grad-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={r.color} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={r.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF0F3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} interval={1} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} width={34} unit="%" />
            <Tooltip cursor={{ stroke: '#C9CDD4', strokeDasharray: '3 3' }} content={<RateTip />} />
            {RATE_SERIES.map((r) => (
              <Area
                key={r.key}
                type="linear"
                dataKey={r.key}
                name={r.label}
                stroke={r.color}
                strokeWidth={1.8}
                fill={`url(#iq-grad-${r.key})`}
                connectNulls={false}
                // 每小時都打點，數值一格一格看得到；MN 一天只有一點，不打點會看不見
                dot={{ r: r.key === 'midnight' ? 4 : 2.5, fill: '#fff', stroke: r.color, strokeWidth: 1.5 }}
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RateTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HourPoint }> }) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null
  return (
    <div className="min-w-[220px] rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card">
      <div className="mb-1 tabular-nums text-ink-sub">{p.full}</div>
      {p.v === null && <div className="mb-1" style={{ color: statusTok.danger.fg }}>該小時無連線</div>}
      {RATE_SERIES.map((r) => {
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

const WEAK_DBM = -110

function SignalCard({ title, hint, points, empty }: { title: string; hint: string; points: HourPoint[]; empty: string }) {
  const has = points.some((p) => p.v !== null)
  const line = statusTok.info.fg
  return (
    <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle title={title} />
        <span className="text-[12px] text-ink-mut">{hint}</span>
      </div>
      {has ? (
        <div className="mt-2 min-h-[180px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF0F3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} interval={1} />
              <YAxis domain={[-120, -40]} ticks={[-120, -100, -80, -60, -40]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6A7282' }} width={40} />
              <ReferenceLine y={WEAK_DBM} stroke={statusTok.danger.fg} strokeDasharray="3 3" label={{ value: '偏弱', position: 'right', fill: statusTok.danger.fg, fontSize: 11 }} />
              <Tooltip cursor={{ stroke: '#C9CDD4', strokeDasharray: '3 3' }} content={<SigTip />} />
              <Line dataKey="v" stroke={line} strokeWidth={2} connectNulls={false} dot={{ r: 3.5, fill: '#fff', stroke: line, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-ink-mut">{empty}</div>
      )}
    </div>
  )
}

function SigTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HourPoint }> }) {
  const p = active ? payload?.[0]?.payload : null
  if (!p) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-card">
      <div className="tabular-nums text-ink-sub">{p.full}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-ink">
        {p.v === null ? '無連線' : `${p.v} dBm`}{p.v !== null && p.v < WEAK_DBM && <span className="ml-1.5 font-normal" style={{ color: statusTok.danger.fg }}>偏弱</span>}
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
