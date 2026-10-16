import { useDashboard } from '@/store/useDashboard'

/**
 * 地圖麵包屑 — 對齊前端 MapLibreDashboardMap.vue 的 `.breadcrumb`：
 *   容器 16px、gap 8；分隔符 `›` 用 #9f9397
 *   `← 返回` 15px #6f6267；層級連結 16px #6f6267，hover 轉 #b83257
 *   目前層級 #241f23 / font-weight 800 / 不可點
 *
 * ⚠ #b83257 / #241f23 是前端 dashboard 自帶的區域色（非全域 token），
 *   為了畫面一致這裡照抄，不要換成 brand token。
 */
export function MapNav() {
  const path = useDashboard((s) => s.drillPath)
  const goBack = useDashboard((s) => s.goBack)
  const jumpTo = useDashboard((s) => s.jumpTo)
  const canBack = path.length > 1 // L1 has no back button

  return (
    <div className="inline-flex min-w-0 items-center gap-2 overflow-hidden text-[16px]" style={{ color: '#241F23' }}>
      {canBack && (
        <button
          type="button"
          onClick={goBack}
          className="whitespace-nowrap border-0 bg-transparent text-[15px]"
          style={{ color: '#6F6267' }}
          title="返回上一層"
        >
          ← 返回
        </button>
      )}
      {path.map((node, i) => {
        const last = i === path.length - 1
        const label = `${node.id === 'TW' ? '台灣' : node.name}(${node.level})`
        return (
          <span key={node.id} className="inline-flex items-center gap-2">
            {i > 0 && <span style={{ color: '#9F9397' }}>›</span>}
            <button
              type="button"
              onClick={() => !last && jumpTo(i)}
              disabled={last}
              className={[
                'whitespace-nowrap p-0 text-[16px]',
                last ? 'cursor-default font-extrabold' : 'hover:text-[#B83257]',
              ].join(' ')}
              style={{ color: last ? '#241F23' : '#6F6267' }}
            >
              {label}
            </button>
          </span>
        )
      })}
    </div>
  )
}
