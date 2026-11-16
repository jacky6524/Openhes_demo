import { AppShell } from '@/components/layout/AppShell'
import { SystemOverview } from '@/pages/SystemOverview'
import { DcuOverview } from '@/pages/DcuOverview'
import { DcuList } from '@/pages/DcuList'
import { MeterList } from '@/pages/MeterList'
import { InstantQuery } from '@/pages/InstantQuery'
import { RegistrationConflict } from '@/pages/RegistrationConflict'
import { DeviceGroups } from '@/pages/DeviceGroups'
import { DeviceRecord } from '@/pages/DeviceRecord'
import { DisabledList } from '@/pages/DisabledList'
import { DeviceModule } from '@/pages/DeviceModule'
import { ChannelPlan } from '@/pages/ChannelPlan'
import { InstantRead } from '@/pages/InstantRead'
import { MdmsUpload } from '@/pages/MdmsUpload'
import { StatsReport } from '@/pages/StatsReport'
import { ReadPerformance } from '@/pages/ReadPerformance'
import { DcuDetail } from '@/pages/DcuDetail'
import { DcuWarRoom } from '@/pages/DcuWarRoom'
import { AccountAdmin } from '@/pages/AccountAdmin'
import { FunctionAdmin } from '@/pages/FunctionAdmin'
import { RolePermission } from '@/pages/RolePermission'
import { ParamSettings } from '@/pages/ParamSettings'
import { useNav } from '@/store/useNav'

export default function App() {
  const view = useNav((s) => s.view)
  return (
    <AppShell>
      {view === 'dcu' ? (
        <DcuOverview />
      ) : view === 'dcuList' ? (
        <DcuList />
      ) : view === 'meterList' ? (
        <MeterList />
      ) : view === 'instantQuery' ? (
        <InstantQuery />
      ) : view === 'registrationConflict' ? (
        <RegistrationConflict />
      ) : view === 'deviceGroups' ? (
        <DeviceGroups />
      ) : view === 'deviceRecord' ? (
        <DeviceRecord />
      ) : view === 'disabledList' ? (
        <DisabledList />
      ) : view === 'deviceModule' ? (
        <DeviceModule />
      ) : view === 'channelPlan' ? (
        <ChannelPlan />
      ) : view === 'instantRead' ? (
        <InstantRead />
      ) : view === 'mdmsUpload' ? (
        <MdmsUpload />
      ) : view === 'readPerformance' ? (
        <ReadPerformance />
      ) : view === 'statsReport' ? (
        <StatsReport />
      ) : view === 'dcuDetail' ? (
        <DcuDetail />
      ) : view === 'warroom' ? (
        <DcuWarRoom />
      ) : view === 'permAccount' ? (
        <AccountAdmin />
      ) : view === 'permFunction' ? (
        <FunctionAdmin />
      ) : view === 'permRole' ? (
        <RolePermission />
      ) : view === 'permParams' ? (
        <ParamSettings />
      ) : (
        <SystemOverview />
      )}
    </AppShell>
  )
}
