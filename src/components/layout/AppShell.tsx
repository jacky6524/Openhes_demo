import { useState, type ReactNode } from 'react'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="h-full flex flex-col bg-page">
      <Topbar onToggleSidebar={() => setCollapsed((c) => !c)} />
      <div className="flex-1 flex min-h-0">
        <Sidebar collapsed={collapsed} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
