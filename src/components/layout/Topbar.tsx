import { useEffect, useRef, useState } from 'react'
import { ChevronDown, UserCircle2, Settings, LogOut, PanelLeft, Check } from 'lucide-react'
import { useCaseFilter, caseLabel, CASES } from '@/store/useCaseFilter'

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="h-14 shrink-0 bg-surface border-b border-border flex items-center px-4 gap-3">
      {/* sidebar collapse toggle */}
      <button
        onClick={onToggleSidebar}
        className="grid place-items-center h-9 w-9 rounded-lg text-ink-sub hover:bg-inset hover:text-ink"
        title="收合 / 展開側欄"
        aria-label="收合 / 展開側欄"
      >
        <PanelLeft size={18} />
      </button>

      {/* FET OpenHES logo */}
      <div className="flex items-center gap-2">
        <div className="grid place-items-center h-7 w-9 rounded-md bg-ink text-white text-[11px] font-black tracking-tight">
          FET
        </div>
        <span className="text-[17px] font-bold text-ink">OpenHES</span>
      </div>

      {/* 目前案別徽章 — logo 右側醒目位置；無篩選顯示 ALL */}
      <CaseBadge />

      <div className="flex-1" />

      <CaseDropdown />

      <div className="h-5 w-px bg-divider" />

      <nav className="flex items-center gap-1 text-ink-sub">
        <TopAction icon={<UserCircle2 size={16} />} label="帳號" />
        <TopAction icon={<Settings size={16} />} label="設定" />
        <TopAction icon={<LogOut size={16} />} label="登出" />
      </nav>
    </header>
  )
}

/**
 * 目前案別徽章 — 顯示於 logo 右側醒目位置；未做任何案別篩選時顯示 ALL。
 * 與右上角案別下拉共用 useCaseFilter 狀態。
 */
function CaseBadge() {
  const selected = useCaseFilter((s) => s.selected)
  const label = caseLabel(selected)
  const isAll = selected.size === 0
  return (
    <div className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-brand/30 bg-brand-soft px-2.5 py-1">
      <span className="text-[11px] font-medium text-ink-mut">案別</span>
      <span className={`text-[13px] font-bold tracking-wide ${isAll ? 'text-ink-sub' : 'text-brand'}`}>{label}</span>
    </div>
  )
}

/**
 * 案別 dropdown — 支援複數勾選（評估複數篩選可行性），預留「一案」「二案」。
 * 案別狀態存於 useCaseFilter，與 logo 右側徽章同步。
 * TODO: 案別清單與多選後的資料篩選需接 API；目前為前端 demo。
 */
function CaseDropdown() {
  const [open, setOpen] = useState(false)
  const selected = useCaseFilter((s) => s.selected)
  const toggle = useCaseFilter((s) => s.toggle)
  const clear = useCaseFilter((s) => s.clear)
  const ref = useRef<HTMLDivElement>(null)

  // close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = selected.size === 0 ? 'ALL' : caseLabel(selected)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg hover:bg-inset ${
          open ? 'bg-inset text-ink' : 'text-ink-sub hover:text-ink'
        }`}
      >
        <span className="text-ink-mut">案別</span>
        <span className="text-ink font-medium max-w-[200px] truncate">{label}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-[236px] rounded-lg bg-surface border border-border shadow-card py-1">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] text-ink-mut">案別（可複選）</span>
            {selected.size > 0 && (
              <button onClick={clear} className="text-[11px] text-brand hover:underline">清除</button>
            )}
          </div>
          {CASES.map((c) => {
            const on = selected.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-inset"
              >
                <span
                  className={`grid place-items-center h-4 w-4 rounded border shrink-0 ${
                    on ? 'bg-brand border-brand text-white' : 'border-border-strong text-transparent'
                  }`}
                  style={on ? undefined : { borderColor: '#D8C9CC' }}
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={`flex-1 ${on ? 'text-ink font-medium' : 'text-ink-sub'}`}>{c.name}</span>
                <span className={`font-mono text-[11.5px] tabular-nums ${on ? 'text-brand' : 'text-ink-mut'}`}>{c.code}-{c.vendor}</span>
              </button>
            )
          })}
          <div className="px-3 py-1.5 text-[11px] text-ink-mut border-t border-divider">標案編號-得標廠商（demo）</div>
        </div>
      )}
    </div>
  )
}

function TopAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg hover:bg-inset hover:text-ink">
      {icon}
      <span>{label}</span>
    </button>
  )
}
