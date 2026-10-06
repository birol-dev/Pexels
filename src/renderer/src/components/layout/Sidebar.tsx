import React from 'react'
import { CaretLeftIcon, CaretRightIcon, PlusIcon, TerminalWindowIcon } from '@phosphor-icons/react'
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

const NAV_ACTIVE =
  'bg-primary-container text-on-primary-container border-2 border-ink-black shadow-hard -translate-x-0.5 -translate-y-0.5'
const NAV_IDLE = 'text-outline hover:bg-surface-variant hover:text-on-surface'

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
        'relative z-20 flex shrink-0 select-none flex-col justify-between border-r-2 border-border bg-surface-container-low shadow-[inset_6px_6px_12px_rgba(0,0,0,0.1)] transition-all duration-300 dark:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.5)]',
        collapsed ? 'w-20' : 'w-[280px]'
      )}
    >
      <div className={collapsed ? 'flex flex-col items-center p-4' : 'p-component-padding'}>
        <div
          className={cn(
            'flex items-center border-b-2 border-border pb-6',
            collapsed ? 'mb-8 flex-col gap-4' : 'mb-10 justify-between'
          )}
        >
          {collapsed ? (
            <BrandLogo variant="icon" size="lg" className="rounded-lg" />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <BrandLogo variant="lockup" size="lg" />
              <p className="font-label-sm text-label-sm text-outline">AI Video Asset Engine</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-outline"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <CaretRightIcon size={20} /> : <CaretLeftIcon size={20} />}
          </Button>
        </div>

        <nav className={cn('space-y-2.5', collapsed && 'flex w-full flex-col items-center')}>
          {NAV_ITEMS.map(({ route, label, icon: NavIcon }) => {
            const active = currentRoute === route
            const button = (
              <button
                type="button"
                onClick={() => go(route)}
                className={cn(
                  'flex cursor-pointer items-center transition-all',
                  collapsed
                    ? 'justify-center rounded-xl p-3'
                    : 'w-full gap-4 rounded px-component-padding py-3 font-label-sm text-label-sm',
                  active ? NAV_ACTIVE : NAV_IDLE
                )}
              >
                <NavIcon size={24} weight={active ? 'fill' : 'regular'} />
                {!collapsed && <span>{label}</span>}
              </button>
            )
            if (!collapsed) return <React.Fragment key={route}>{button}</React.Fragment>
            return (
              <Tooltip key={route}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-border bg-surface-container p-4">
        <Button
          variant="secondary"
          size="lg"
          className={cn('w-full', collapsed && 'px-2')}
          onClick={() => openTab('input', undefined, true)}
        >
          <PlusIcon size={20} weight="bold" />
          {!collapsed && <span>New Project</span>}
        </Button>
        {collapsed ? (
          <div className="flex select-none flex-col items-center gap-1 text-outline">
            <TerminalWindowIcon size={18} />
            <span className="font-mono text-[11px]">v1.0</span>
          </div>
        ) : (
          <div className="pt-2 text-center font-mono text-[11px] text-outline">v1.0 Industrial</div>
        )}
      </div>
    </aside>
  )
}
