import React from 'react'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { JobSnapshot } from '@renderer/lib/store'
import { RUN_STATUS, getPauseReasonText, getTokenUsageText } from '../utils'

interface RunHeaderProps {
  job: JobSnapshot
  /** The Settings toggle that hides the token line. */
  hideTokenUsage?: boolean
  onBack: () => void
  actions: React.ReactNode
}

/** The pack's name large, its status as faded words after it, and the run's actions. */
export function RunHeader({
  job,
  hideTokenUsage,
  onBack,
  actions
}: RunHeaderProps): React.JSX.Element {
  const status = RUN_STATUS[job.status] ?? RUN_STATUS.cancelled
  const pauseReason = getPauseReasonText(job)
  const tokenUsage = hideTokenUsage ? null : getTokenUsageText(job)
  // A paused run says why; otherwise the step, unless it only repeats the status.
  const detail =
    pauseReason && pauseReason !== 'Paused'
      ? pauseReason
      : job.currentStep && job.currentStep.toLowerCase() !== status.label.toLowerCase()
        ? job.currentStep
        : null
  return (
    <header className="flex flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-3 self-start text-outline hover:text-on-surface"
      >
        <ArrowLeftIcon />
        Project setup
      </Button>

      <div className="flex flex-col justify-between gap-x-8 gap-y-6 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {job.title}
            <span className="text-fade">, {status.fade}</span>
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-outline">
            <span className="flex items-center gap-2 font-medium text-on-surface">
              <span aria-hidden className={cn('size-2 rounded-full', status.dot)} />
              {status.label}
            </span>
            {detail && (
              <>
                <span aria-hidden>·</span>
                <span>{detail}</span>
              </>
            )}
          </p>
          {tokenUsage && (
            <p className="mt-1.5 text-[13px] text-outline tabular-nums">{tokenUsage}</p>
          )}
        </div>
        {actions}
      </div>
    </header>
  )
}
