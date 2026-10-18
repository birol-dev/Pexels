import React from 'react'
import { PlusIcon, SidebarSimpleIcon } from '@phosphor-icons/react'
import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { useAppStore, type JobSummary } from '@renderer/lib/store'
import { NAV_ITEMS, type AppRoute } from './nav'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const ITEM =
  'flex h-10 w-full cursor-pointer items-center rounded-xl px-[14px] text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none'
const ITEM_ACTIVE = 'bg-frame-selected text-on-surface'
const ITEM_IDLE = 'text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-surface'

/** How many recent packs the sidebar lists. The Create page shows the rest. */
const RECENT_COUNT = 5

const STATUS_DOT: Record<JobSummary['status'], string> = {
  running: 'bg-on-surface animate-pulse',
  paused: 'border-[1.5px] border-on-surface',
  completed: 'bg-outline',
  failed: 'bg-error',
  cancelled: 'border-[1.5px] border-outline'
}

const STATUS_LABEL: Record<JobSummary['status'], string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

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

  const openJob = (jobId: string): void => {
    setActiveJobId(jobId)
    navigate('run')
  }

  const recent = jobs.slice(0, RECENT_COUNT)

  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 select-none flex-col overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[76px]' : 'w-[256px]'
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-3">
        <div className="flex items-center pl-[12px]">
          <BrandLogo variant="icon" size="sm" />
          <CollapsibleLabel collapsed={collapsed} className="pl-2.5">
            <span className="text-[15px] font-medium tracking-[-0.01em] text-on-surface">
              StockFinder <span className="text-outline">AI</span>
            </span>
          </CollapsibleLabel>
        </div>
      </div>

      <div className="px-3 pt-1">
        <SidebarTooltip label="New pack" collapsed={collapsed}>
          <button
            type="button"
            onClick={() => openTab('input', undefined, true)}
            aria-label="New pack"
            className={cn(
              ITEM,
              'bg-primary-container text-on-primary-container hover:bg-primary-container/85'
            )}
          >
            <PlusIcon size={20} weight="bold" className="shrink-0" />
            <CollapsibleLabel collapsed={collapsed}>New pack</CollapsibleLabel>
          </button>
        </SidebarTooltip>
      </div>

      <nav className="mt-5 space-y-0.5 px-3" aria-label="Main">
        {NAV_ITEMS.map(({ route, label, icon: NavIcon }) => {
          const active = currentRoute === route
          return (
            <SidebarTooltip key={route} label={label} collapsed={collapsed}>
              <button
                type="button"
                onClick={() => go(route)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(ITEM, active ? ITEM_ACTIVE : ITEM_IDLE)}
              >
                <NavIcon size={20} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                <CollapsibleLabel collapsed={collapsed}>{label}</CollapsibleLabel>
              </button>
            </SidebarTooltip>
          )
        })}
      </nav>

      <div
        className={cn(
          'mt-7 min-h-0 flex-1 overflow-y-auto px-3 transition-opacity duration-200',
          collapsed && 'pointer-events-none opacity-0'
        )}
        aria-hidden={collapsed}
      >
        {recent.length > 0 && (
          <>
            <p className="px-[14px] pb-2 text-xs font-medium whitespace-nowrap text-outline">
              Recent packs
            </p>
            <ul className="space-y-0.5">
              {recent.map((job) => {
                const active = currentRoute === 'run' && activeJobId === job.jobId
                return (
                  <li key={job.jobId}>
                    <button
                      type="button"
                      onClick={() => openJob(job.jobId)}
                      tabIndex={collapsed ? -1 : 0}
                      title={`${job.title} · ${STATUS_LABEL[job.status]}`}
                      className={cn(
                        ITEM,
                        'h-9 gap-3 text-[13px]',
                        active ? ITEM_ACTIVE : ITEM_IDLE
                      )}
                    >
                      <span
                        className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[job.status])}
                        aria-hidden
                      />
                      <span className="truncate">{job.title}</span>
                      <span className="sr-only">, {STATUS_LABEL[job.status]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <CollapsibleLabel collapsed={collapsed} className="pl-[14px]">
          <span className="select-text text-xs text-outline" title="StockFinder AI version">
            v{__APP_VERSION__}
          </span>
        </CollapsibleLabel>
        <SidebarTooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} collapsed>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              ITEM,
              ITEM_IDLE,
              collapsed ? 'w-full' : 'w-10 shrink-0 justify-center px-0'
            )}
          >
            <SidebarSimpleIcon size={20} className="shrink-0" />
          </button>
        </SidebarTooltip>
      </div>
    </aside>
  )
}

/** Names an icon-only item while the sidebar is collapsed. */
function SidebarTooltip({
  label,
  collapsed,
  children
}: {
  label: string
  collapsed: boolean
  children: React.ReactElement
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  )
}

/** Text that slides and fades away with the sidebar width instead of popping in and out. */
function CollapsibleLabel({
  collapsed,
  className = 'pl-3',
  children
}: {
  collapsed: boolean
  className?: string
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
      <span className={cn('block', className)}>{children}</span>
    </span>
  )
}
