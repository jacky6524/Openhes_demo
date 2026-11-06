import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, Pencil, Cog, Trash2, Monitor, Loader2, Ban } from 'lucide-react'
import { dcuInfo } from '@/data/dcuInfo'
import { dcuById } from '@/data/dcuFleet'
import type { DcuRow } from '@/data/dcuList'
import { status as statusTok } from '@/tokens'
import { EnableToggle } from './EnableToggle'
import { FeatureNotice } from '@/components/shared/FeatureNotice'
import { DCU_MODES, DCU_MODE_DESC } from '@/data/dcuListPage'

/**
 * DCU裝置設定 modal — opened from 裝置設定 in the DCU資料 drawer。
 * 2026-08-28 依業主意見移除「轉移電表」。
 * 2026-09-07 依 Figma 3812:26377／26417／26436 更新：
 *   · 頁籤收斂為三個（原本另有「更新紀錄」「刪除」）
 *   · 修改裝置：裝置與唯讀屬性併成同一條，底部加「刪除此DCU」危險區
 *   · 線上操作：由空狀態改為三列實際動作（設定功率／重啟 FAN／Ping IP）
 * 2026-10-01 業主意見：
 *   · 線上操作只留 重啟DCU／Ping IP（設定功率、重啟 FAN 移除），開窗預設就在這一頁
 * 2026-10-16 業主意見：清單的「修改模式」搬進齒輪 → 當時新增第四個頁籤（只刻畫面）；
 *   全部頁籤都不開放，所以右上「送出」一律停用（游標顯示禁止符號）。
 * 2026-10-22 業主意見（設計稿「Untitled (4).png」）：「修改模式」併入「遠端設定」，第四個頁籤拿掉，
 *   頁籤回到三個；遠端設定＝頻道組別／RF清單模式／時間校正設定／修改模式。
 * 2026-11-04 業主意見：修改模式由四選一單選鈕改為下拉選單，選中模式的說明顯示在下拉下方。
 *   · **頁籤全部暫不啟用**：頁籤帶禁止符號、仍可點開瀏覽，內容用 FeatureNotice 停用；
 *     重啟DCU／Ping 只是示意，按鈕不能執行（OnlinePanel 的模擬執行邏輯保留，要恢復把 online 的 inactive 拿掉）
 */
const TABS = [
  { key: 'modify', label: '修改裝置', icon: Pencil, inactive: true },
  { key: 'remote', label: '遠端設定', icon: Cog, inactive: true },
  { key: 'online', label: '線上操作', icon: Monitor, inactive: true },
] as const
type TabKey = (typeof TABS)[number]['key']
const INACTIVE_NOTICE: Record<TabKey, string> = {
  modify: 'DCU 裝置資料修改暫無功能，畫面僅供瀏覽，無法修改或刪除。',
  remote: 'DCU 遠端設定（含修改模式）暫無功能，畫面僅供瀏覽，無法修改。',
  online: '重啟DCU、Ping 僅為功能示意，畫面僅供瀏覽，無法執行。',
}

export function DcuSettingsModal({ dcu, onClose, mode = '正常模式' }: { dcu: DcuRow; onClose: () => void; mode?: string }) {
  const [tab, setTab] = useState<TabKey>('online')

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
            <h2 className="text-[16px] font-semibold text-ink">DCU裝置設定</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset">
              取消
            </button>
            {/* 所有頁籤都暫不啟用，沒有可儲存的內容 → 送出停用，游標顯示禁止符號 */}
            <button
              disabled
              title="暫不啟用，無法儲存"
              className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white opacity-40 cursor-not-allowed"
            >
              送出
            </button>
          </div>
        </div>

        {/* tabs —— 一列排得下，不做橫向捲動 */}
        <div className="flex items-center gap-2 px-5 pt-3 shrink-0">
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.inactive ? '暫不啟用，僅供瀏覽' : undefined}
                className={[
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] border transition-colors',
                  active ? 'bg-brand-soft text-brand border-brand/30 font-medium' : 'text-ink-sub border-border hover:bg-inset',
                ].join(' ')}
              >
                {t.inactive ? <Ban size={14} strokeWidth={2.4} className={active ? '' : 'opacity-70'} /> : <Icon size={15} />}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {TABS.find((t) => t.key === tab)?.inactive ? (
            <div className="flex flex-col gap-4">
              <FeatureNotice text={INACTIVE_NOTICE[tab]}>
                {tab === 'modify' ? <ModifyPanel dcu={dcu} onDeleted={onClose} /> : tab === 'remote' ? <RemotePanel dcu={dcu} mode={mode} /> : <OnlinePanel dcu={dcu} />}
              </FeatureNotice>
            </div>
          ) : tab === 'online' ? (
            <OnlinePanel dcu={dcu} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 修改裝置 */

function ModifyPanel({ dcu, onDeleted }: { dcu: DcuRow; onDeleted: () => void }) {
  const extra = useMemo(() => dcuInfo(dcu.model), [dcu.model])
  const deviceModel = dcuById.get(dcu.model)?.model ?? '—'

  return (
    <div className="flex flex-col gap-4">
      {/* 裝置與唯讀屬性同一條（Figma 3812:26377）：裝置在最左、字級加大，接著啟用／停用開關
          （2026-09-29 業主意見，電表與 DCU 都要），其餘四項接續 */}
      <div className="grid grid-cols-2 md:grid-cols-6 items-end gap-x-8 gap-y-3 rounded-xl bg-inset/60 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-ink-mut">裝置</span>
          <span className="text-[17px] font-bold font-mono text-ink">{dcu.model}</span>
        </div>
        <EnableToggle key={dcu.model} initial={dcuById.get(dcu.model)?.state !== 'disabled'} kind="DCU" />
        {(
          [
            ['Cell ID', extra.cellId],
            ['FAN IMSI', extra.imsi || '--'],
            ['型號', deviceModel],
            ['經緯度', extra.latlng],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[12px] text-ink-mut">{label}</span>
            <span className="truncate text-[13px] font-medium text-ink tabular-nums" title={value}>{value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <Field label="DCU編號" />
        <Field label="台電圖號座標" />
        <Field label="通訊方式" />
        <Field label="位置類型" />
        <Field label="DCU引電類型" />
        <Field label="郵遞區號" kind="select" placeholder="請選擇" />
        <Field label="樓層" />
        <Field label="用電地址" />
        <Field label="AMI編號代碼" kind="select" />
        <Field label="NCC編號有限效期" kind="date" />
        <Field label="NCC電台名稱" kind="select" />
        <Field label="NCC核准編號" />
        <Field label="備註1" kind="select" />
        <Field label="備註2" />
      </div>

      <DeleteBlock onDeleted={onDeleted} />
    </div>
  )
}

/** 刪除此DCU —— 放在修改裝置頁最底部、與儲存動作分開，並強制二次確認 */
function DeleteBlock({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border border-danger-bd bg-danger-bg/50 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold" style={{ color: statusTok.danger.fg }}>刪除此DCU</div>
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

/* ------------------------------------------------------------ 遠端設定 */

/** 修改模式的排列順序（設計稿：正常模式在最前）；選項與說明取自 DCU_MODES */
const MODE_ORDER = ['正常模式', ...DCU_MODES.filter((m) => m !== '正常模式')] as const
const CHANNEL_GROUPS = ['0', 'A', 'B', 'C', 'P']

function RemotePanel({ dcu, mode }: { dcu: DcuRow; mode: string }) {
  const [rfList, setRfList] = useState(true)
  const [picked, setPicked] = useState(mode)

  return (
    <div className="flex flex-col gap-4">
      <DeviceHeading model={dcu.model} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <Field label="頻道組別" kind="select" options={CHANNEL_GROUPS} />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-sub">RF清單模式</span>
          <button
            type="button"
            role="switch"
            aria-checked={rfList}
            onClick={() => setRfList((v) => !v)}
            className="w-11 h-6 rounded-full p-0.5 transition-colors self-start"
            style={{ background: rfList ? '#2B7FFF' : '#D1D5DB' }}
          >
            <span
              className="block h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: rfList ? 'translateX(20px)' : 'none' }}
            />
          </button>
        </label>
        <Field label="時間校正設定" placeholder="Input" />
        {/* 2026-11-04 業主意見：修改模式由單選鈕改為下拉；原本 hover 才看得到的模式說明改常駐在下拉下方 */}
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-sub">修改模式</span>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-lg border border-border bg-inset/50 px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand"
          >
            {MODE_ORDER.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {DCU_MODE_DESC[picked as keyof typeof DCU_MODE_DESC] && (
            <span className="text-[12px] leading-snug text-ink-mut">{DCU_MODE_DESC[picked as keyof typeof DCU_MODE_DESC]}</span>
          )}
        </label>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- 共用 */

function DeviceHeading({ model }: { model: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-ink-mut">裝置</span>
      <span className="text-[20px] font-bold font-mono text-ink">{model}</span>
    </div>
  )
}

/** demo 用的空表單欄位；上線接 API 後改為受控欄位 */
function Field({
  label,
  kind = 'input',
  placeholder,
  options,
}: {
  label: string
  kind?: 'input' | 'select' | 'date'
  placeholder?: string
  /** select 的選項；有給時預設選第一個，沒給時只有佔位字 */
  options?: string[]
}) {
  const box = 'rounded-lg border border-border bg-inset/50 px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand'
  let control: ReactNode
  if (kind === 'select') {
    control = (
      <select className={box} defaultValue={options ? options[0] : ''}>
        {!options && <option value="">{placeholder ?? 'selection'}</option>}
        {options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else if (kind === 'date') {
    control = <input type="date" className={box} defaultValue="2026-01-01" />
  } else {
    control = <input className={box} placeholder={placeholder ?? '請輸入'} />
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      {control}
    </label>
  )
}

/* ------------------------------------------------------------ 線上操作 */

/**
 * 線上操作（Figma 3812:26436）—— 左欄灰底標籤、右欄動作區。
 * 2026-10-01 業主意見：DCU 實際只有「重啟DCU」「Ping」兩個功能，設定功率／重啟 FAN 已移除。
 * 設計稿只畫出「設定功率」有輸入框與執行鈕，「重啟 FAN」「Ping IP」右側留白；
 * 這裡各補一顆執行鈕，否則列出動作名稱卻無處可按。實際參數待確認。
 *
 * 2026-09-23 依業主意見：執行之後要有**資料輸出**的欄位 —— 下方「執行結果」區塊
 * 逐筆列出每次執行的時間、動作、成功／失敗與裝置回傳內容（最新的在最上面）。
 * 回傳內容是 demo 模擬值（斷線 DCU 一律逾時失敗）。TODO: 上線改接下行指令 API 的回應。
 */
type OpKey = 'reboot' | 'ping'
const OP_LABEL: Record<OpKey, string> = { reboot: '重啟DCU', ping: 'Ping IP' }
interface OpResult { id: number; op: OpKey; at: string; ok: boolean; lines: string[] }

function nowStamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** demo：依動作與 DCU 狀態組出裝置回傳內容 */
function simulate(op: OpKey, dcuId: string): { ok: boolean; lines: string[] } {
  const info = dcuInfo(dcuId)
  const online = dcuById.get(dcuId)?.online ?? true
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
  if (op === 'ping') {
    if (!online) {
      return {
        ok: false,
        lines: [
          `PING ${info.ip}：傳送 4 個封包`,
          ...[1, 2, 3, 4].map((i) => `icmp_seq=${i}　要求逾時`),
          '統計：傳送 4、接收 0、遺失 100%',
        ],
      }
    }
    const times = [1, 2, 3, 4].map(() => rnd(38, 160))
    return {
      ok: true,
      lines: [
        `PING ${info.ip}：傳送 4 個封包`,
        ...times.map((t, i) => `回覆自 ${info.ip}：icmp_seq=${i + 1} ttl=58 time=${t} ms`),
        `統計：傳送 4、接收 4、遺失 0%　最小／平均／最大 = ${Math.min(...times)}／${Math.round(times.reduce((s, t) => s + t, 0) / 4)}／${Math.max(...times)} ms`,
      ],
    }
  }
  if (!online) return { ok: false, lines: ['指令已送出：重啟DCU', '等待裝置回應逾時（30 秒），DCU 目前斷線'] }
  return {
    ok: true,
    lines: [
      '指令已送出：重啟DCU',
      'DCU 回應：ACK，開始重新啟動',
      'DCU 離線',
      `DCU 重新上線（耗時 ${rnd(45, 120)} 秒）`,
      `IMSI：${info.imsi || '--'}　Cell ID：${info.cellId}`,
      `訊號強度：${info.signal} dBm`,
    ],
  }
}

function OnlinePanel({ dcu }: { dcu: DcuRow }) {
  const [running, setRunning] = useState<OpKey | null>(null)
  const [results, setResults] = useState<OpResult[]>([])

  const timerRef = useRef<number | null>(null)
  // 換一台 DCU（或關閉彈窗）就清掉上一台的輸出與還在等的指令
  useEffect(() => {
    setResults([]); setRunning(null)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [dcu.model])

  const run = (op: OpKey) => {
    if (running) return
    setRunning(op)
    // 模擬下行指令的等待時間
    timerRef.current = window.setTimeout(() => {
      const res = simulate(op, dcu.model)
      setResults((r) => [{ id: Date.now(), op, at: nowStamp(), ...res }, ...r])
      setRunning(null)
    }, op === 'ping' ? 900 : 1300)
  }

  return (
    <div className="flex flex-col gap-4">
      <DeviceHeading model={dcu.model} />
      <div className="flex flex-col gap-2">
        <ActionRow label="重啟DCU"><RunButton running={running === 'reboot'} disabled={!!running} onClick={() => run('reboot')} /></ActionRow>
        <ActionRow label="Ping IP"><RunButton running={running === 'ping'} disabled={!!running} onClick={() => run('ping')} /></ActionRow>
      </div>
      <ResultPanel results={results} running={running} onClear={() => setResults([])} />
    </div>
  )
}

/** 執行結果 —— 固定高度、自己捲動；最新一筆在最上面 */
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
