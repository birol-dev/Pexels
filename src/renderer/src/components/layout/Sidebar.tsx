import React from 'react'
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/lib/store'
import { NAV_ITEMS, type AppRoute } from './nav'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const NAV_ACTIVE = 'border-ink-black bg-primary-container text-on-primary-container shadow-md'
const NAV_IDLE =
  'border-transparent text-outline hover:bg-surface-variant hover:text-on-surface'

export function Sidebar({ collapsed, onToggle }: SidebarProps): React.JSX.Element {
  const currentRoute = useAppStore((s) => s.currentRoute)
  const navigate = useAppStore((s) => s.navigate)
  const activeJobId = useAppStore((s) => s.activeJobId)
  const jobs = useAppStore((s) => s.jobs)
  const setActiveJobId = useAppStore((s) => s.setActiveJobId)
  const openTab = useAppStore((s) => s.openTab)

  const go = (route: AppRoute): void => {
    if (route === 'run' && !activeJobId && jobs.length > 0) {
      setActiveJobId(jobs[0].jobId)
    }
    navigate(route)
  }

  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 select-none flex-col justify-between overflow-hidden border-r-2 border-border bg-surface-container-low shadow-[inset_6px_6px_12px_rgba(0,0,0,0.1)] transition-[width] duration-300 ease-in-out dark:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.5)]',
        collapsed ? 'w-20' : 'w-[280px]'
      )}
    >
      <div className="p-4">
        {/* Both header layouts stay mounted and cross-fade, so nothing reflows mid-animation. */}
        <div className="mb-8 grid border-b-2 border-border pb-6">
          <div
            className={cn(
              'col-start-1 row-start-1 flex items-start justify-between gap-2 pl-2 transition-opacity duration-200',
              collapsed && 'pointer-events-none opacity-0'
            )}
            aria-hidden={collapsed}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <BrandLogo variant="lockup" size="lg" />
              <p className="whitespace-nowrap font-label-sm text-label-sm text-outline">
                AI Video Asset Engine
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-outline"
              onClick={onToggle}
              tabIndex={collapsed ? -1 : 0}
              aria-label="Collapse sidebar"
            >
              <CaretLeftIcon size={20} />
            </Button>
          </div>
          <div
            className={cn(
              'col-start-1 row-start-1 flex flex-col items-center gap-4 transition-opacity duration-200',
              !collapsed && 'pointer-events-none opacity-0'
            )}
            style={{ width: 48 }}
            aria-hidden={!collapsed}
          >
            <BrandLogo variant="icon" size="lg" className="rounded-lg" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-outline"
              onClick={onToggle}
              tabIndex={collapsed ? 0 : -1}
              aria-label="Expand sidebar"
            >
              <CaretRightIcon size={20} />
            </Button>
          </div>
        </div>

        <nav className="space-y-2.5">
          {NAV_ITEMS.map(({ route, label, icon: NavIcon }) => {
            const active = currentRoute === route
            return (
              <Tooltip key={route}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => go(route)}
                    aria-label={label}
                    className={cn(
                      'flex w-full cursor-pointer items-center rounded-md border-2 px-3 py-3 font-label-sm text-label-sm transition-colors',
                      active ? NAV_ACTIVE : NAV_IDLE
                    )}
                  >
                    <NavIcon size={24} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                    <CollapsibleLabel collapsed={collapsed}>{label}</CollapsibleLabel>
                  </button>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
              </Tooltip>
            )
          })}
        </nav>
      </div>

      <div className="border-t-2 border-border bg-surface-container p-4">
        <Button
          variant="secondary"
          size="lg"
          className="w-full justify-start gap-0 px-3"
          onClick={() => openTab('input', undefined, true)}
        >
          <PlusIcon size={20} weight="bold" className="shrink-0" />
          <CollapsibleLabel collapsed={collapsed}>New Project</CollapsibleLabel>
        </Button>
        <p
          className="mt-3 select-text text-center font-label-sm text-xs text-outline"
          title="StockFinder AI version"
        >
          v{__APP_VERSION__}
        </p>
      </div>
    </aside>
  )
}

/** Text that slides and fades away with the sidebar width instead of popping in and out. */
function CollapsibleLabel({
  collapsed,
  children
}: {
  collapsed: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out',
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
      )}
      aria-hidden={collapsed}
    >
      <span className="block pl-4">{children}</span>
    </span>
  )
}
