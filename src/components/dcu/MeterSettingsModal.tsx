import { useEffect, useState, type ReactNode } from 'react'
import { X, Pencil, Trash2, Monitor } from 'lucide-react'
import { meterInfo } from '@/data/meterInfo'
import type { DcuMeterRow } from '@/data/dcuMeters'

/**
 * 電表裝置設定 modal (Figma 2958:15836) — opened from 裝置設定 in the 電表資料
 * drawer. Active tab 修改裝置 shows enable toggles, a read-only info strip and an
 * edit form. Other tabs are stubbed for the demo.
 */
const TABS = [
  { key: 'edit', label: '修改裝置', icon: Pencil },
  { key: 'delete', label: '刪除', icon: Trash2 },
  { key: 'online', label: '線上操作', icon: Monitor },
] as const

export function MeterSettingsModal({ meter, onClose }: { meter: DcuMeterRow; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('edit')
  const [enabled, setEnabled] = useState(true)
  const [keyUpdate, setKeyUpdate] = useState(true)
  const [autoMac, setAutoMac] = useState(true)
  const extra = meterInfo(meter.meterNo)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />

      <div className="relative z-10 w-[min(1000px,95vw)] max-h-[90vh] rounded-2xl bg-surface border border-border shadow-drawer flex flex-col modal-pop">
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
            <button onClick={onClose} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-deep">
              確定
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 shrink-0">
          {TABS.map((t) => {
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
                <Icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* body */}
        <div className="overflow-y-auto p-5">
          {tab !== 'edit' ? (
            <div className="py-16 text-center text-ink-mut text-[13px]">「{TABS.find((t) => t.key === tab)?.label}」功能示意（demo）</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* device + toggles */}
              <div className="flex items-end gap-8 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-ink-mut">裝置</span>
                  <span className="text-[20px] font-bold font-mono text-ink">{meter.meterNo}</span>
                </div>
                <ToggleField label="裝置啟用" checked={enabled} onChange={setEnabled} />
                <ToggleField label="金鑰更新" checked={keyUpdate} onChange={setKeyUpdate} />
                <ToggleField label="自動修正MAC" checked={autoMac} onChange={setAutoMac} />
              </div>

              {/* read-only info strip */}
              <div className="grid grid-cols-6 gap-4 rounded-xl bg-inset/50 border border-border px-4 py-3">
                <Info label="區處及營業區" value="01 北南-62" />
                <Info label="電號" value={meter.elecNo} />
                <Info label="CT" value="1" />
                <Info label="TOU ID" value={extra.touId} />
                <Info label="PT" value="1" />
                <Info label="模組序號" value={meter.reportDevice} />
              </div>

              {/* edit form */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="編輯表號" placeholder="請輸入" />
                <Field label="郵遞區號" placeholder="請輸入" />
                <Field label="位置類型" placeholder="請輸入" />
                <Field label="樓層" placeholder="請輸入" />
                <Field label="用電地址" placeholder="請輸入" />
                <Field label="電表分類" placeholder="請選擇" select />
                <Field label="經度" placeholder="請輸入" />
                <Field label="緯度" placeholder="請輸入" />
                <Field label="模組型號" placeholder="selection" select />
                <Field label="模組序號" placeholder="selection" select />
                <Field label="通訊設定" placeholder="selection" select />
                <Field label="FAN MAC" placeholder="請輸入" />
                <Field label="電表Qos" placeholder="selection" select />
                <Field label="AMI編號代碼(對照AMI契約清單)" placeholder="請輸入" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-ink-mut">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-info' : 'bg-border'}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-mut mb-0.5">{label}</div>
      <div className="text-[13px] text-ink font-mono truncate" title={value}>
        {value}
      </div>
    </div>
  )
}

function Field({ label, placeholder, select }: { label: string; placeholder: string; select?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-sub">{label}</span>
      {select ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-inset/40 px-3 py-2 text-[13px] text-ink-mut">
          {placeholder}
          <Chevron />
        </div>
      ) : (
        <input placeholder={placeholder} className="rounded-lg border border-border bg-inset/40 px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand" />
      )}
    </label>
  )
}

function Chevron(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-ink-mut">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
