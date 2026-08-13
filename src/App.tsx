import { AppShell } from '@/components/layout/AppShell'
import { SystemOverview } from '@/pages/SystemOverview'
import { DcuOverview } from '@/pages/DcuOverview'
import { DcuDetail } from '@/pages/DcuDetail'
import { DcuWarRoom } from '@/pages/DcuWarRoom'
import { useNav } from '@/store/useNav'

export default function App() {
  const view = useNav((s) => s.view)
  return (
    <AppShell>
      {view === 'dcu' ? (
        <DcuOverview />
      ) : view === 'dcuDetail' ? (
        <DcuDetail />
      ) : view === 'warroom' ? (
        <DcuWarRoom />
      ) : (
        <SystemOverview />
      )}
    </AppShell>
  )
}
