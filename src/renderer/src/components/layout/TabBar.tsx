import React, { useState } from 'react'
import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useAppStore, type TabItem } from '@renderer/lib/store'
import { TAB_ICONS } from './nav'

function TabTitleEditor({
  tab,
  onDone
}: {
  tab: TabItem
  onDone: (title: string | null) => void
}): React.JSX.Element {
  const [value, setValue] = useState(tab.title)
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value)
        else if (e.key === 'Escape') onDone(null)
      }}
      onBlur={() => onDone(value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="h-5 w-28 rounded-none border-0 border-b border-on-surface bg-transparent px-0.5 py-0 text-[13px] shadow-none focus-visible:ring-0"
    />
  )
}

export function TabBar(): React.JSX.Element | null {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const selectTab = useAppStore((s) => s.selectTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const openTab = useAppStore((s) => s.openTab)
  const updateInputTabState = useAppStore((s) => s.updateInputTabState)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)

  if (tabs.length === 0) return null

  const saveTitle = (tabId: string, title: string | null): void => {
    const trimmed = title?.trim()
    if (trimmed) updateInputTabState(tabId, { title: trimmed })
    setEditingTabId(null)
  }

  return (
    <div className="scrollbar-none flex shrink-0 select-none items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4 py-2.5">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        const TabIcon = TAB_ICONS[tab.type]
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => selectTab(tab.id)}
            onDoubleClick={() => {
              if (tab.type === 'input') setEditingTabId(tab.id)
            }}
            className={cn(
              'group/tab flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full pr-1.5 pl-3 text-[13px] font-medium transition-colors',
              active
                ? 'bg-surface-container text-on-surface dark:bg-surface-container-high'
                : 'text-outline hover:bg-surface-container/70 hover:text-on-surface'
            )}
          >
            <TabIcon size={16} weight={active ? 'fill' : 'regular'} className="shrink-0" />
            {editingTabId === tab.id ? (
              <TabTitleEditor tab={tab} onDone={(title) => saveTitle(tab.id, title)} />
            ) : (
              <span className="max-w-[160px] truncate">{tab.title}</span>
            )}
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className={cn(
                'flex size-5 cursor-pointer items-center justify-center rounded-full text-outline transition-[opacity,color,background-color] hover:bg-foreground/10 hover:text-on-surface focus-visible:opacity-100',
                active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100'
              )}
            >
              <XIcon size={12} weight="bold" />
            </button>
          </div>
        )
      })}

      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-1 shrink-0 text-outline"
        aria-label="New Create Pack tab"
        onClick={() => openTab('input', undefined, true)}
      >
        <PlusIcon size={16} weight="bold" />
      </Button>
    </div>
  )
}
