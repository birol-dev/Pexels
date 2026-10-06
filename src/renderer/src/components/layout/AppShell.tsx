import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-body-md text-on-background selection:bg-primary-container selection:text-on-primary-container">
      <div className="riso-grain" />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col bg-background">
        <TabBar />
        <div className="grow overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
