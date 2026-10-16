import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, Pencil, Monitor, Trash2, Loader2, Lock, Ban, SlidersHorizontal } from 'lucide-react'
import { EnableToggle } from './EnableToggle'
import { FeatureNotice } from '@/components/shared/FeatureNotice'
import { ModePanel } from './ModePanel'
import { meterInfo } from '@/data/meterInfo'
import type { DcuMeterRow } from '@/data/dcuMeters'
import { status as statusTok, brand } from '@/tokens'

/**
 * 電表裝置設定 modal (Figma 3812:25895／25861)。從電表列表的齒輪進入。
 *
 * 2026-09-07 依新設計稿改版：
 *   · 頁籤收斂為兩個（修改裝置／線上操作），原本的「刪除」已改成頁內危險區
 *   · 修改裝置：頂部屬性條（裝置＋區處／電號／CT／TOU ID／PT）＋兩個表單區塊
 *   · 主要按鈕在「修改裝置」是「下一頁」（帶到線上操作），在「線上操作」才是「確定」
 *   · 線上操作：五列動作（設定功率／重啟 FAN／Ping IP／Ping Meter／Ping FAN）
 */
const TABS = [
  { key: 'edit', label: '修改裝置', icon: Pencil },
  { key: 'online', label: '線上操作', icon: Monitor },
  { key: 'mode', label: '修改模式', icon: SlidersHorizontal },
] as const
type TabKey = (typeof TABS)[number]['key']

/** 2026-10-01 業主意見：齒輪（裝置設定）內的功能原則上都無法實際使用 → 預設一律暫不啟用 */
const DEFAULT_INACTIVE_NOTICE = '電表裝置設定暫無功能，畫面僅供瀏覽，無法修改或執行操作。'

export function MeterSettingsModal({ meter, onClose, inactiveNotice = DEFAULT_INACTIVE_NOTICE, showMode = false, mode = '正常模式' }: {
  meter: DcuMeterRow; onClose: () => void
  /** 2026-10-16 業主意見：電表清單的「修改模式」搬進齒輪 → 只有電表清單開這個頁籤 */
  showMode?: boolean; mode?: string
  /** 暫不啟用的說明：仍可瀏覽兩個頁籤，但上方顯示這段說明、所有欄位與按鈕停用。傳空字串＝啟用 */
  inactiveNotice?: string
}) {
  const [tab, setTab] = useState<TabKey>('edit')
  const tabs = showMode ? TABS : TABS.filter((t) => t.key !== 'mode')
  const nextTab = tabs[tabs.findIndex((t) => t.key === tab) + 1]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      {/* 固定高度而非 max-h：彈窗垂直置中，高度若隨分頁內容變動，頂部就會上下跳 */}
      <div className="relative z-10 w-[min(1440px,96vw)] h-[92vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="grid place-items-center h-7 w-7 rounded-lg text-ink-sub hover:bg-inset hover:text-ink" title="關閉">
              <X size={18} />
            </button>
            <h2 className="text-[16px] font-semibold text-ink">電表裝置設定</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              取消
            </button>
            {/* 主要動作是「下一頁」，帶到下一個頁籤；最後一頁才是「確定」。
                暫不啟用時沒有可儲存的內容 → 最後一頁的確定停用（游標顯示禁止符號） */}
            <button
              onClick={() => (nextTab ? setTab(nextTab.key) : onClose())}
              disabled={!nextTab && !!inactiveNotice}
              title={!nextTab && inactiveNotice ? '暫不啟用，無法儲存' : undefined}
              className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand"
            >
              {nextTab ? '下一頁' : '確定'}
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 shrink-0">
          {tabs.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] border transition-colors',
                  active ? 'bg-brand-soft text-brand border-brand/30 font-medium' : 'text-ink-sub border-border hover:bg-inset',
                ].join(' ')}
              >
                {inactiveNotice ? <Ban size={14} strokeWidth={2.4} className={active ? '' : 'opacity-70'} /> : <Icon size={15} />}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {inactiveNotice ? (
            <div className="flex flex-col gap-4">
              <FeatureNotice text={inactiveNotice}>
                {tab === 'edit' ? <EditPanel meter={meter} onDeleted={onClose} /> : tab === 'mode' ? <ModePanel device={meter.meterNo} current={mode} /> : <OnlinePanel meter={meter} />}
              </FeatureNotice>
            </div>
          ) : tab === 'edit' ? <EditPanel meter={meter} onDeleted={onClose} /> : tab === 'mode' ? <ModePanel device={meter.meterNo} current={mode} /> : <OnlinePanel meter={meter} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 修改裝置 */

function EditPanel({ meter, onDeleted }: { meter: DcuMeterRow; onDeleted: () => void }) {
  const extra = useMemo(() => meterInfo(meter.meterNo), [meter.meterNo])
  const [autoMac, setAutoMac] = useState(true)
  const [keyUpdate, setKeyUpdate] = useState(true)
  const [lat, lng] = extra.latlng.split(',').map((s) => s.trim())

  return (
    <div className="flex flex-col gap-5">
      {/* 頂部屬性條：裝置在最左、字級加大，接著啟用／停用開關，其餘五項唯讀 */}
      <div className="grid grid-cols-2 md:grid-cols-7 items-end gap-x-6 gap-y-3 rounded-xl bg-inset/60 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-ink-mut">裝置</span>
          <span className="text-[17px] font-bold font-mono text-ink">{meter.reportDevice}</span>
        </div>
        <EnableToggle key={meter.meterNo} initial={meter.disabled !== 'Y'} kind="電表" />
        {(
          [
            ['區處及營業區', '01 北南-62'],
            ['電號', meter.elecNo],
            ['CT', '1'],
            ['TOU ID', extra.touId],
            ['PT', '1'],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[12px] text-ink-mut">{label}</span>
            <span className="truncate text-[13px] font-medium text-ink tabular-nums" title={value}>{value}</span>
          </div>
        ))}
      </div>

      {/* 2026-09-29 依業主參考截圖（截圖/電表裝置設定參考.png）逐欄核對：
          編輯表號加「若無變動則不需填寫」、用電地址帶入現值、篩選條件＝關鍵字＋下拉、
          通訊設定鎖住、開票日序改下拉、guk_m／ak_m 只能讀取（遮罩顯示、不可修改） */}
      <Section title="基本資料">
        <Field label="編輯表號" hint="若無變動則不需填寫" />
        <Field label="郵遞區號" />
        <Field label="位置類型" />
        <Field label="樓層" />
        <Field label="用電地址" defaultValue={meter.address} />
        <Field label="電表分類" kind="select" placeholder="請選擇" options={['A', 'B', 'C']} />
        <Field label="經度" defaultValue={lng} />
        <Field label="緯度" defaultValue={lat} />
      </Section>

      {/* 設計稿上這一段的標題同樣寫「基本資料」，照稿實作；名稱待確認 */}
      <Section title="基本資料">
        <Field label="模組型號" kind="select" options={[`${extra.moduleModel}（RF）`]} />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-sub">篩選條件</span>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
            <input className={BOX} placeholder="請輸入關鍵字" />
            <select className={BOX} defaultValue={meter.reportDevice}>
              <option value={meter.reportDevice}>{meter.reportDevice}</option>
            </select>
          </div>
        </label>
        <Field label="通訊設定" kind="select" disabled />
        <ReadOnlyField label="模組序號" value={meter.reportDevice} />
        <Field label="FAN MAC" defaultValue={meter.fanMac} />
        <ToggleField label="自動修正MAC" checked={autoMac} onChange={setAutoMac} />
        <Field label="電表Qos" kind="select" options={['FAN', 'RF', 'PLC']} />
        <Field label="AMI編號代碼(對照AMI契約清單)" />
        <Field label="用電契約" />
        <Field label="用戶型態" />
        <Field label="開票日序" kind="select" placeholder="請選擇" options={BILL_DAYS} />
        <Field label="備註1" />
        <Field label="備註2" />
        <Field label="備註3" />
        <LockedField label="guk_m" value={maskedKey(meter.meterNo, 'guk')} />
        <LockedField label="ak_m" value={maskedKey(meter.meterNo, 'ak')} />
        <ToggleField label="金鑰更新" checked={keyUpdate} onChange={setKeyUpdate} />
      </Section>

      <DeleteBlock onDeleted={onDeleted} />
    </div>
  )
}

/** 刪除此電表 —— 放在表單最底部、與儲存動作分開，並強制二次確認 */
function DeleteBlock({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-danger-bd bg-danger-bg/50 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold" style={{ color: statusTok.danger.fg }}>刪除此電表</div>
        <div className="text-[12.5px] text-ink-sub">
          刪除裝置不可復原，該裝置資料亦會全數刪除，請謹慎操作。若仍確認需要刪除，請按下刪除按鈕。
        </div>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setConfirming(false)} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
            取消
          </button>
          <button
            onClick={onDeleted}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white"
            style={{ background: statusTok.danger.fg }}
          >
            <Trash2 size={14} />確認刪除
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-danger-bg"
          style={{ color: statusTok.danger.fg, borderColor: statusTok.danger.fg }}
        >
          <Trash2 size={14} />刪除
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ 線上操作 */

/**
 * 線上操作（Figma 3812:25861）—— 左欄灰底標籤、右欄動作區的五列表。
 * 設計稿只畫出「設定功率」有輸入框與執行鈕，其餘四列右側留白；
 * 這裡各補一顆執行鈕，否則列出動作名稱卻無處可按。實際參數待確認。
 *
 * 2026-09-29 依業主意見比照 DCU裝置設定：執行後要有顯示結果的空間 —— 下方「執行結果」
 * 逐筆列出時間、動作、成功／失敗與裝置回傳內容（最新在最上面）。
 * 回傳內容是 demo 模擬值（斷線電表一律逾時失敗）。TODO: 上線改接下行指令 API 的回應。
 */
type OpKey = 'power' | 'fan' | 'pingIp' | 'pingMeter' | 'pingFan'
const OP_LABEL: Record<OpKey, string> = {
  power: '設定功率', fan: '重啟 FAN', pingIp: 'Ping IP', pingMeter: 'Ping Meter', pingFan: 'Ping FAN',
}
const ONLINE_ACTIONS: OpKey[] = ['fan', 'pingIp', 'pingMeter', 'pingFan']
interface OpResult { id: number; op: OpKey; at: string; ok: boolean; lines: string[] }

function nowStamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** demo：依動作與電表連線狀態組出裝置回傳內容 */
function simulate(op: OpKey, meter: DcuMeterRow, power: string): { ok: boolean; lines: string[] } {
  const info = meterInfo(meter.meterNo)
  const online = meter.status === 'online'
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
  if (op === 'pingIp' || op === 'pingMeter' || op === 'pingFan') {
    const target = op === 'pingIp' ? info.ip : op === 'pingMeter' ? meter.meterNo : meter.fanMac
    if (!online) {
      return {
        ok: false,
        lines: [`PING ${target}：傳送 4 個封包`, ...[1, 2, 3, 4].map((i) => `seq=${i}　要求逾時`), '統計：傳送 4、接收 0、遺失 100%'],
      }
    }
    // 走 FAN 網路的 Ping Meter／Ping FAN 比 Ping IP 慢
    const times = [1, 2, 3, 4].map(() => (op === 'pingIp' ? rnd(40, 180) : rnd(220, 900)))
    return {
      ok: true,
      lines: [
        `PING ${target}：傳送 4 個封包`,
        ...times.map((t, i) => `回覆自 ${target}：seq=${i + 1} time=${t} ms`),
        `統計：傳送 4、接收 4、遺失 0%　最小／平均／最大 = ${Math.min(...times)}／${Math.round(times.reduce((s, t) => s + t, 0) / 4)}／${Math.max(...times)} ms`,
      ],
    }
  }
  if (!online) return { ok: false, lines: ['指令已送出', '等待裝置回應逾時（30 秒），電表目前斷線'] }
  if (op === 'power') return { ok: true, lines: [`指令已送出：設定功率 ${power}`, '電表回應：ACK', `目前功率：${power}`] }
  return {
    ok: true,
    lines: [
      '指令已送出：重啟 FAN 模組',
      'FAN 模組離線',
      `FAN 模組重新上線（耗時 ${rnd(20, 48)} 秒）`,
      `FAN MAC：${meter.fanMac}　模組：${info.moduleModel}`,
      `訊號值：${meter.signal}`,
    ],
  }
}

function OnlinePanel({ meter }: { meter: DcuMeterRow }) {
  const [power, setPower] = useState('100%')
  const [running, setRunning] = useState<OpKey | null>(null)
  const [results, setResults] = useState<OpResult[]>([])

  const timerRef = useRef<number | null>(null)
  // 換一顆電表（或關閉彈窗）就清掉上一顆的輸出與還在等的指令
  useEffect(() => {
    setResults([]); setRunning(null)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [meter.meterNo])

  const run = (op: OpKey) => {
    if (running) return
    if (op === 'power') {
      const n = Number(power.replace('%', '').trim())
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setResults((r) => [{ id: Date.now(), op, at: nowStamp(), ok: false, lines: [`參數錯誤：功率需為 0–100%（輸入值「${power}」）`] }, ...r])
        return
      }
    }
    setRunning(op)
    // 模擬下行指令的等待時間
    timerRef.current = window.setTimeout(() => {
      const res = simulate(op, meter, power.includes('%') ? power.trim() : `${power.trim()}%`)
      setResults((r) => [{ id: Date.now(), op, at: nowStamp(), ...res }, ...r])
      setRunning(null)
    }, op === 'power' || op === 'fan' ? 1300 : 900)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">裝置</span>
        <span className="text-[20px] font-bold font-mono text-ink">{meter.reportDevice}</span>
      </div>
      <div className="flex flex-col gap-2">
        <ActionRow label="設定功率">
          <input
            value={power}
            onChange={(e) => setPower(e.target.value)}
            className="w-[140px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-brand"
          />
          <RunButton running={running === 'power'} disabled={!!running} onClick={() => run('power')} />
        </ActionRow>
        {ONLINE_ACTIONS.map((op) => (
          <ActionRow key={op} label={OP_LABEL[op]}>
            <RunButton running={running === op} disabled={!!running} onClick={() => run(op)} />
          </ActionRow>
        ))}
      </div>
      <ResultPanel results={results} running={running} onClear={() => setResults([])} />
    </div>
  )
}

/** 執行結果 —— 固定高度、自己捲動；最新一筆在最上面（與 DCU裝置設定同一個版式） */
function ResultPanel({ results, running, onClear }: { results: OpResult[]; running: OpKey | null; onClear: () => void }) {
  return (
    <div className="flex flex-col rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-inset px-4 py-2">
        <span className="text-[13px] font-semibold text-ink">執行結果</span>
        {results.length > 0 && <span className="text-[12px] text-ink-mut">共 {results.length} 筆</span>}
        <span className="flex-1" />
        {results.length > 0 && (
          <button onClick={onClear} className="text-[12px] text-ink-sub hover:text-brand">清除</button>
        )}
      </div>
      <div className="h-[280px] overflow-y-auto px-4 py-2">
        {running && (
          <div className="flex items-center gap-2 py-2 text-[12.5px] text-ink-sub">
            <Loader2 size={14} className="animate-spin" />
            {OP_LABEL[running]} 執行中，等待裝置回應…
          </div>
        )}
        {!running && results.length === 0 && (
          <div className="grid h-full place-items-center text-[12.5px] text-ink-fai">尚未執行任何操作，按下「執行」後結果會顯示在這裡</div>
        )}
        {results.map((r) => {
          const t = r.ok ? statusTok.normal : statusTok.danger
          return (
            <div key={r.id} className="border-b border-divider py-2 last:border-b-0">
              <div className="mb-1 flex items-center gap-2 text-[12.5px]">
                <span className="tabular-nums text-ink-mut">{r.at}</span>
                <span className="font-semibold text-ink">{OP_LABEL[r.op]}</span>
                <span className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium" style={{ background: t.bg, color: t.fg }}>
                  {r.ok ? '成功' : '失敗'}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-inset/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-sub">
                {r.lines.join('\n')}
              </pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[168px_minmax(0,1fr)] items-stretch overflow-hidden rounded-lg">
      <div className="grid place-items-center bg-inset px-3 py-3 text-[13px] font-medium text-ink">{label}</div>
      <div className="flex items-center gap-2 bg-inset/40 px-4 py-3">{children}</div>
    </div>
  )
}

function RunButton({ running, disabled, onClick }: { running: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-ink-sub hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:text-ink-sub"
    >
      {running && <Loader2 size={13} className="animate-spin" />}
      {running ? '執行中' : '執行'}
    </button>
  )
}

/* ---------------------------------------------------------------- 共用 */

/** 區塊標題：紅色小豎線 + 標題，底下是兩欄表單 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-sm" style={{ background: brand.base }} />
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  )
}

const BOX =
  'rounded-md border border-border bg-inset/50 px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

/** 開票日序（1–31 日） */
const BILL_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

/**
 * 金鑰遮罩顯示 —— 前 6、後 6 碼，中間以 * 遮住（同參考截圖 B178A3******C08E30）。
 * demo 值由表號雜湊產生。TODO: 上線改由 API 回傳已遮罩的值，前端不持有完整金鑰。
 */
function maskedKey(meterNo: string, salt: string) {
  let h = 2166136261
  const s = meterNo + salt
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  const hex = (n: number) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0')
  const a = hex(h), b = hex(Math.imul(h ^ 0x5bd1e995, 2654435761))
  return `${a.slice(0, 6)}******${b.slice(2)}`
}

/** demo 用的空表單欄位；上線接 API 後改為受控欄位 */
function Field({
  label,
  kind = 'input',
  placeholder,
  defaultValue,
  options,
  hint,
  disabled,
}: {
  label: string
  kind?: 'input' | 'select' | 'date'
  /** 輸入框預設「請輸入」；下拉有給才會多一個空白的提示選項（例如「請選擇」） */
  placeholder?: string
  defaultValue?: string
  options?: string[]
  /** 標籤右側的紅字提示（例如「若無變動則不需填寫」） */
  hint?: string
  disabled?: boolean
}) {
  let control: ReactNode
  if (kind === 'select') {
    const opts = options ?? []
    const blank = placeholder ?? (opts.length ? null : 'selection')
    control = (
      <select
        className={`${BOX} disabled:cursor-not-allowed disabled:opacity-60`}
        defaultValue={defaultValue ?? (blank != null ? '' : opts[0])}
        disabled={disabled}
        title={disabled ? '此欄位不開放修改' : undefined}
      >
        {blank != null && <option value="">{blank}</option>}
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    )
  } else if (kind === 'date') {
    control = <input type="date" className={BOX} defaultValue="2026-01-01" />
  } else {
    control = <input className={BOX} placeholder={placeholder ?? '請輸入'} defaultValue={defaultValue} />
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">
        {label}
        {hint && <span className="ml-2" style={{ color: statusTok.danger.fg }}>＊{hint}</span>}
      </span>
      {control}
    </label>
  )
}

/**
 * 只能讀取的欄位（guk_m／ak_m）—— 2026-09-29 業主意見：僅開放資料讀取，無修改功能。
 * 外觀仍是欄位框（與其他欄位對齊），但灰底、不可聚焦，右側鎖頭說明不可修改。
 */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      <div
        className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md border border-border bg-inset px-3 py-2 text-[13px]"
        title="僅供讀取，無法修改"
      >
        <span className="truncate font-mono text-ink-sub">{value}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-mut">
          <Lock size={12} />唯讀
        </span>
      </div>
    </div>
  )
}

/** 唯讀欄位：與可輸入欄位同一個版式，但值直接顯示、不給輸入框 */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      <span className="px-3 py-2 text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 self-start rounded-full transition-colors"
        style={{ background: checked ? '#2F6BED' : '#D1D5DB' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? 22 : 2 }}
        />
      </button>
    </div>
  )
}
