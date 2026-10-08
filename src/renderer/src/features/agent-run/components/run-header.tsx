import React from 'react'
import { ArrowLeftIcon, ClockIcon } from '@phosphor-icons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { JobSnapshot } from '@renderer/lib/store'
import { getPauseReasonText, getStatusBadgeClass, getTokenUsageText } from '../utils'

interface RunHeaderProps {
  job: JobSnapshot
  /** The Settings toggle that hides the token line. */
  hideTokenUsage?: boolean
  onBack: () => void
  actions: React.ReactNode
}

export function RunHeader({
  job,
  hideTokenUsage,
  onBack,
  actions
}: RunHeaderProps): React.JSX.Element {
  const pauseReason = getPauseReasonText(job)
  const tokenUsage = hideTokenUsage ? null : getTokenUsageText(job)
  return (
    <header className="relative z-10 flex items-end justify-between border-b-2 border-edge pb-8">
      <div className="flex flex-col gap-2">
        <Button variant="link" size="xs" onClick={onBack} className="self-start px-0 text-outline">
          <ArrowLeftIcon weight="bold" />
          Back to project setup
        </Button>
        <div className="flex items-center gap-4">
          <h2 className="font-display-xl text-display-xl text-on-surface">{job.title}</h2>
          <Badge
            className={cn(
              'px-3 py-1 border-2 border-ink-black dark:border-primary-container font-label-sm text-label-sm tracking-widest uppercase inline-block brutal-shadow translate-y-[-2px]',
              getStatusBadgeClass(job.status)
            )}
          >
            {job.status}
          </Badge>
        </div>
        {pauseReason && (
          <p className="font-body-md text-body-md text-on-surface-variant">{pauseReason}</p>
        )}
        <p className="font-body-md text-body-md text-outline flex items-center gap-2">
          <ClockIcon size={18} />
          Status: {job.currentStep}
        </p>
        {tokenUsage && <p className="font-body-md text-body-md text-outline">{tokenUsage}</p>}
      </div>
      {actions}
    </header>
  )
}
