import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import type { JobSummary } from '@renderer/lib/store'
import { cn } from '@renderer/lib/utils'

const STATUS_STYLES: Record<
  JobSummary['status'],
  { label: string; badge: string; dot: string; pulse?: boolean }
> = {
  running: {
    label: 'Running',
    badge: 'bg-primary-container text-on-primary-container animate-pulse',
    dot: 'bg-on-primary-container animate-ping'
  },
  paused: {
    label: 'Paused',
    badge: 'bg-tertiary-container text-on-tertiary-container',
    dot: 'bg-on-tertiary-container'
  },
  completed: {
    label: 'Completed',
    badge: 'bg-cyber-lime text-on-primary-container',
    dot: 'bg-ink-black'
  },
  failed: {
    label: 'Failed',
    badge: 'bg-error-container text-on-error-container',
    dot: 'bg-error'
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-surface-container-high text-outline',
    dot: 'bg-outline'
  }
}

export function JobStatusBadge({ status }: { status: JobSummary['status'] }): React.JSX.Element {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.cancelled

  return (
    <Badge
      className={cn(
        'gap-1.5 border-2 border-edge px-2.5 py-1 font-label-sm text-[11px] shadow-sm',
        style.badge
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </Badge>
  )
}
