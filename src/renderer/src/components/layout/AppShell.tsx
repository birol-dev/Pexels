import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@renderer/lib/store'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const currentRoute = useAppStore((s) => s.currentRoute)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // A new page starts at the top instead of inheriting the previous page's scroll offset.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [currentRoute, activeTabId])

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-body-md text-on-background selection:bg-primary-container selection:text-on-primary-container">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col bg-background">
        <TabBar />
        <div ref={scrollRef} className="min-h-0 grow overflow-y-auto [scrollbar-gutter:stable]">
          <div
            key={`${currentRoute}:${activeTabId}`}
            className="mx-auto w-full max-w-[1280px] animate-page-in px-grid-margin py-8"
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
