import { ChevronRight, ArrowLeft } from 'lucide-react'
import { useDashboard } from '@/store/useDashboard'

/** breadcrumb (台灣(L1) ＞ 桃園市(L2) ＞ 中壢區(L3), cross-level jump) + back
    button (§4.2). 層級編碼直接寫進麵包屑，右側不再另放層級備註。 */
export function MapNav() {
  const path = useDashboard((s) => s.drillPath)
  const goBack = useDashboard((s) => s.goBack)
  const jumpTo = useDashboard((s) => s.jumpTo)
  const canBack = path.length > 1 // L1 has no back button

  return (
    <div className="flex items-center gap-2">
      {canBack && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-[13px] text-ink-sub hover:text-brand px-2 py-1 rounded-lg hover:bg-inset"
          title="返回上一層"
        >
          <ArrowLeft size={15} />
          返回
        </button>
      )}
      <nav className="flex items-center gap-1 text-[13px]">
        {path.map((node, i) => {
          const last = i === path.length - 1
          const label = `${node.id === 'TW' ? '台灣' : node.name}(${node.level})`
          return (
            <span key={node.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-ink-mut" />}
              <button
                onClick={() => !last && jumpTo(i)}
                disabled={last}
                className={
                  last
                    ? 'font-semibold text-ink cursor-default'
                    : 'text-ink-sub hover:text-brand hover:underline'
                }
              >
                {label}
              </button>
            </span>
          )
        })}
      </nav>
    </div>
  )
}
