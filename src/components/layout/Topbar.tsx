import { useEffect, useRef, useState } from 'react'
import { ChevronDown, UserCircle2, Settings, LogOut, PanelLeft, Check } from 'lucide-react'
import { useCaseFilter, caseLabel, CASES } from '@/store/useCaseFilter'
import { ProfileModal } from '@/components/layout/ProfileModal'

/*
 * 2026-11-06 業主設計稿：拿掉「設定」、logo 前的 FET 方塊與案別徽章；案別下拉移到 logo 右側
 * （直接顯示已選案別全名）；「帳號」點開個人資料維護。
 * 2026-11-17 同步正式機系統總覽截圖：加回「設定」（demo 無功能）；案別未選時顯示「全部」，
 * 按鈕改為品牌淡粉底、無框，已選文字用品牌紅。
 */

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [profile, setProfile] = useState(false)
  return (
    <header className="h-14 shrink-0 bg-chrome shadow-[0_1px_4px_rgba(120,60,70,0.12)] relative z-10 flex items-center px-4 gap-3">
      {/* sidebar collapse toggle */}
      <button
        onClick={onToggleSidebar}
        className="grid place-items-center h-9 w-9 rounded-lg text-ink-sub hover:bg-inset hover:text-ink"
        title="收合 / 展開側欄"
        aria-label="收合 / 展開側欄"
      >
        <PanelLeft size={18} />
      </button>

      <span className="text-[17px] font-bold text-ink">OpenHES</span>

      {/* 案別下拉 — logo 右側，直接顯示已選案別 */}
      <CaseDropdown />

      <div className="flex-1" />

      <nav className="flex items-center gap-1 text-ink-sub">
        <TopAction icon={<UserCircle2 size={16} />} label="帳號" onClick={() => setProfile(true)} />
        <TopAction icon={<Settings size={16} />} label="設定" />
        <TopAction icon={<LogOut size={16} />} label="登出" />
      </nav>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </header>
  )
}

/**
 * 案別 dropdown — 支援複數勾選（評估複數篩選可行性），預留「一案」「二案」。
 * 案別狀態存於 useCaseFilter。
 * TODO: 案別清單與多選後的資料篩選需接 API；目前為前端 demo。
 */
function CaseDropdown() {
  const [open, setOpen] = useState(false)
  const selected = useCaseFilter((s) => s.selected)
  const toggle = useCaseFilter((s) => s.toggle)
  const setSelected = useCaseFilter((s) => s.setSelected)
  const ref = useRef<HTMLDivElement>(null)

  // close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = caseLabel(selected)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3 py-1.5 text-sm hover:bg-brand-soft-hover"
      >
        <span className="text-ink-sub">案別</span>
        {/* 已選案別完整顯示，不截斷（業主 2026-11-06） */}
        <span className="text-brand font-semibold whitespace-nowrap">{label}</span>
        <ChevronDown size={15} className={`text-brand transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-[248px] rounded-lg bg-surface border border-border shadow-card py-1 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-divider">
            <span className="text-[11px] font-medium text-ink-sub">案別篩選（可複選）</span>
            {selected.size === CASES.length ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-brand hover:underline"
              >
                清空
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelected(new Set(CASES.map((c) => c.id)))}
                className="text-[11px] text-brand hover:underline"
              >
                全選
              </button>
            )}
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {CASES.map((c) => {
              const on = selected.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-inset transition-colors"
                >
                  <span
                    className={`grid place-items-center h-4 w-4 rounded border shrink-0 transition-colors ${
                      on ? 'bg-brand border-brand text-white' : 'border-border-strong text-transparent'
                    }`}
                    style={on ? undefined : { borderColor: '#D8C9CC' }}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className={`flex-1 ${on ? 'text-ink font-semibold' : 'text-ink-sub'}`}>{c.name}</span>
                  <span className={`font-mono text-[11.5px] tabular-nums ${on ? 'text-brand font-medium' : 'text-ink-mut'}`}>{c.code}-{c.vendor}</span>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-1.5 text-[11px] text-ink-mut border-t border-divider">
            標案編號-得標廠商（demo）
          </div>
        </div>
      )}
    </div>
  )
}

function TopAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg hover:bg-inset hover:text-ink">
      {icon}
      <span>{label}</span>
    </button>
  )
}
