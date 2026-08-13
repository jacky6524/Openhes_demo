import {
  LayoutDashboard,
  Radar,
  Cpu,
  BookOpenCheck,
  BarChart3,
  Bell,
  PackageOpen,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNav, type View } from '@/store/useNav'

/** a leaf nav item optionally bound to a view */
interface Leaf {
  label: string
  view?: View
}
interface NavItem {
  label: string
  icon: ReactNode
  view?: View // direct-navigation item
  children?: Leaf[] // expandable group
}

const NAV: NavItem[] = [
  { label: '系統總覽', icon: <LayoutDashboard size={18} />, view: 'overview' },
  { label: 'DCU總覽', icon: <Radar size={18} />, view: 'warroom' },
  {
    label: '裝置管理',
    icon: <Cpu size={18} />,
    children: [
      { label: 'DCU裝置列表', view: 'dcu' },
      { label: '模組裝置列表' },
      { label: '頻道規劃' },
    ],
  },
  { label: '讀表管理', icon: <BookOpenCheck size={18} /> },
  { label: '統計分析', icon: <BarChart3 size={18} /> },
  { label: '事件管理', icon: <Bell size={18} /> },
  { label: '裝置模組', icon: <PackageOpen size={18} /> },
  { label: '權限管理', icon: <ShieldCheck size={18} /> },
]

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const view = useNav((s) => s.view)
  const setView = useNav((s) => s.setView)
  const detailFrom = useNav((s) => s.dcuDetailFrom)
  // 裝置管理 starts open so its active child (DCU裝置列表) is visible
  const [open, setOpen] = useState<Record<string, boolean>>({ 裝置管理: true })

  // 詳細頁沒有自己的側欄項目 —— 掛在「開啟它的那一頁」底下（裝置列表 or DCU總覽）
  const viewMatches = (v?: View) => v === view || (view === 'dcuDetail' && v === detailFrom)
  const groupActive = (item: NavItem) =>
    viewMatches(item.view) || (item.children?.some((c) => viewMatches(c.view)) ?? false)

  return (
    <aside
      className={[
        'shrink-0 bg-surface border-r border-border py-3 px-2.5 overflow-y-auto',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[188px]',
      ].join(' ')}
    >
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = groupActive(item)
          const isOpen = open[item.label] ?? false
          return (
            <div key={item.label} className="flex flex-col gap-1">
              <button
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  if (item.children) setOpen((o) => ({ ...o, [item.label]: !isOpen }))
                  else if (item.view) setView(item.view)
                }}
                className={[
                  'flex items-center gap-2.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  active
                    ? 'bg-brand-soft text-brand border border-brand/25'
                    : 'text-ink-sub hover:bg-inset hover:text-ink',
                ].join(' ')}
              >
                <span className={active ? 'text-brand' : 'text-ink-mut'}>{item.icon}</span>
                {!collapsed && <span className="whitespace-nowrap flex-1 text-left">{item.label}</span>}
                {!collapsed && item.children && (
                  <ChevronDown
                    size={15}
                    className={`text-ink-mut transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {/* sub-items */}
              {!collapsed && item.children && isOpen && (
                <div className="flex flex-col gap-0.5 pl-9 pr-1 pb-1">
                  {item.children.map((child) => {
                    const childActive = viewMatches(child.view)
                    return (
                      <button
                        key={child.label}
                        onClick={() => child.view && setView(child.view)}
                        className={[
                          'text-left text-[13px] py-1.5 px-2 rounded-lg transition-colors',
                          childActive
                            ? 'text-brand font-semibold'
                            : 'text-ink-sub hover:text-ink hover:bg-inset',
                        ].join(' ')}
                      >
                        {child.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
