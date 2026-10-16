import { useState } from 'react'

/**
 * 裝置啟用／停用開關 —— 2026-09-29 業主意見（參考 截圖/電表裝置設定參考.png）：
 * 裝置設定的「修改裝置」要能直接啟用／停用，電表與 DCU 都要。
 * 放在裝置名稱旁，開＝啟用中、關＝已停用；停用時補一行說明停用的影響。
 *
 * demo：狀態只存在彈窗內，按「確定」也不會寫回清單。TODO: 上線改接啟用／停用 API。
 */
export function EnableToggle({ initial, kind }: { initial: boolean; kind: '電表' | 'DCU' }) {
  const [on, setOn] = useState(initial)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-mut">狀態</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((v) => !v)}
          title={on ? `停用此${kind}` : `啟用此${kind}`}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: on ? '#2F6BED' : '#D1D5DB' }}
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
        </button>
        <span className={`whitespace-nowrap text-[13px] font-semibold ${on ? 'text-ink' : 'text-ink-mut'}`}>
          {on ? '啟用中' : '已停用'}
        </span>
      </div>
      {!on && <span className="text-[11.5px] leading-snug text-ink-mut">停用後不列入連線率與讀表率統計</span>}
    </div>
  )
}
