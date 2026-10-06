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
      className="h-5 w-24 rounded-none border-0 border-b border-primary bg-transparent px-1 py-0 text-xs shadow-none focus-visible:shadow-none dark:focus-visible:shadow-none"
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
    <div className="scrollbar-none flex select-none items-center gap-3 overflow-x-auto border-b-2 border-border bg-surface-container px-6 py-2.5">
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
              'flex cursor-pointer items-center gap-2 rounded border-2 px-3 py-1.5 font-label-sm text-xs transition-all',
              active
                ? '-translate-x-px -translate-y-px border-ink-black bg-primary-container text-on-primary-container shadow-[2px_2px_0_var(--color-ink-black)] dark:shadow-[2px_2px_0_var(--color-cyber-lime)]'
                : 'border-border bg-paper-white text-outline hover:bg-surface-variant hover:text-on-surface dark:bg-surface-container-lowest dark:text-steel-secondary'
            )}
          >
            <TabIcon size={16} weight={active ? 'fill' : 'regular'} />
            {editingTabId === tab.id ? (
              <TabTitleEditor tab={tab} onDone={(title) => saveTitle(tab.id, title)} />
            ) : (
              <span className="max-w-[120px] truncate">{tab.title}</span>
            )}
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="flex size-4 cursor-pointer items-center justify-center rounded-full text-outline transition-colors hover:bg-white/20 hover:text-error"
            >
              <XIcon size={12} weight="bold" />
            </button>
          </div>
        )
      })}

      <Button
        variant="secondary"
        size="icon-xs"
        className="shrink-0"
        aria-label="New Create Pack tab"
        onClick={() => openTab('input', undefined, true)}
      >
        <PlusIcon size={16} weight="bold" />
      </Button>
    </div>
  )
}
