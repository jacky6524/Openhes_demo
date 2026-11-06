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
    // 2026-09-07 依業主指定的項目與順序；與正式前端 openhes-front 的 pages 對應：
    // dcu-list / meter-list / instant-query / registration-conflict / device-groups / device-record
    // 2026-09-17 依業主意見移除「裝置列表」（地圖＋DCU 列表那頁）——
    // 頁面檔 pages/DcuOverview.tsx 與 App 的 'dcu' 路由都還在，要復原只要把這一列加回來。
    // 2026-11-04 依《OpenHES_裝置列表_UIUX欄位規格.md》補齊後放回（DCU／LTE／NB-IoT＋地圖同步），
    // 同日業主又要求先隱藏 —— 頁面與 'dcu' 路由保留，要恢復就把 { label: '裝置列表', view: 'dcu' } 加回來。
    // 同日業主意見：電表清單移到第一個。
    children: [
      { label: '電表清單', view: 'meterList' },
      { label: 'DCU清單', view: 'dcuList' },
      { label: '即裝即查', view: 'instantQuery' },
      { label: '註冊衝突', view: 'registrationConflict' },
      { label: '裝置群組', view: 'deviceGroups' },
      { label: '裝置紀錄', view: 'deviceRecord' },
      { label: '停用清單', view: 'disabledList' },
    ],
  },
  {
    label: '讀表管理',
    icon: <BookOpenCheck size={18} />,
    // 設計稿「即時讀表」「MDMS上拋」
    children: [
      { label: '即時讀表', view: 'instantRead' },
      { label: 'MDMS上拋', view: 'mdmsUpload' },
    ],
  },
  {
    label: '統計分析',
    icon: <BarChart3 size={18} />,
    // Figma 4255:33532「統計分析」：長條（熱力）圖畫面＝讀表效能，報表任務清單＝統計報表
    children: [
      { label: '讀表效能', view: 'readPerformance' },
      { label: '統計報表', view: 'statsReport' },
    ],
  },
  { label: '事件管理', icon: <Bell size={18} /> },
  {
    label: '裝置模組',
    icon: <PackageOpen size={18} />,
    // 設計稿「裝置模組-1／-2／-3」；2026-11-04 業主意見：FAN／DCU 併成一頁用頁籤切換。
    // 這頁叫「模組型號」，不叫「裝置列表」—— 裝置管理底下已有「裝置列表」（裝置狀態＋地圖），避免撞名。
    children: [
      { label: '模組型號', view: 'deviceModule' },
      { label: '頻道規劃', view: 'channelPlan' },
    ],
  },
  {
    label: '權限管理',
    icon: <ShieldCheck size={18} />,
    // Figma 3892:24129「權限管理」整段
    children: [
      { label: '帳號管理', view: 'permAccount' },
      { label: '功能項目管理', view: 'permFunction' },
      { label: '角色權限管理', view: 'permRole' },
      // 2026-11-04 新增：調整燈號門檻（對應後端 AppConfig 的 status 分類）
      { label: '參數調整', view: 'permParams' },
    ],
  },
]

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const view = useNav((s) => s.view)
  const setView = useNav((s) => s.setView)
  const detailFrom = useNav((s) => s.dcuDetailFrom)
  // 裝置管理 starts open so its active child (裝置列表) is visible
  const [open, setOpen] = useState<Record<string, boolean>>({ 裝置管理: true })

  // 詳細頁沒有自己的側欄項目 —— 掛在「開啟它的那一頁」底下（裝置列表 or DCU總覽）
  const viewMatches = (v?: View) => v === view || (view === 'dcuDetail' && v === detailFrom)
  const groupActive = (item: NavItem) =>
    viewMatches(item.view) || (item.children?.some((c) => viewMatches(c.view)) ?? false)

  return (
    <aside
      className={[
        'shrink-0 bg-chrome py-3 px-2.5 overflow-y-auto',
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
                    ? 'bg-brand-soft-hover text-brand'
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
                            ? 'bg-brand-soft-hover text-brand font-semibold'
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
