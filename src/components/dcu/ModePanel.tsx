import { useState } from 'react'
import { DCU_MODES, DCU_MODE_DESC } from '@/data/dcuListPage'

/**
 * 修改模式 —— 2026-10-16 業主意見：從清單右上的批次按鈕搬進齒輪（裝置設定）裡，
 * 只刻畫面、不開放功能（外層用 FeatureNotice 停用）。四個模式與說明由業主指定。
 */
export function ModePanel({ device, current }: { device: string; current: string }) {
  const [mode, setMode] = useState(current)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">裝置</span>
        <span className="text-[17px] font-bold font-mono text-ink">{device}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DCU_MODES.map((m) => {
          const on = mode === m
          return (
            <label
              key={m}
              className={[
                'flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer',
                on ? 'border-brand/40 bg-brand-soft' : 'border-border bg-surface hover:bg-inset/50',
              ].join(' ')}
            >
              <input type="radio" name="dcu-mode" checked={on} onChange={() => setMode(m)} className="mt-1 accent-brand" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink">{m}</span>
                <span className="text-[12.5px] text-ink-sub">{DCU_MODE_DESC[m]}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
