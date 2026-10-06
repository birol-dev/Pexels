import React from 'react'
import {
  ArrowCounterClockwiseIcon,
  EyeIcon,
  PauseIcon,
  PlayIcon,
  SealCheckIcon,
  XIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import type { JobSnapshot } from '@renderer/lib/store'

interface RunActionsProps {
  job: JobSnapshot
  hasPendingAssets: boolean
  loading: boolean
  onPause: () => void
  onResumeOrApprove: () => void
  onCancel: () => void
  onRerun: () => void
  onInspect: () => void
}

export function RunActions({
  job,
  hasPendingAssets,
  loading,
  onPause,
  onResumeOrApprove,
  onCancel,
  onRerun,
  onInspect
}: RunActionsProps): React.JSX.Element {
  const { status } = job
  return (
    <div className="flex gap-4 shrink-0">
      {status === 'running' && (
        <Button variant="secondary" size="lg" onClick={onPause}>
          <PauseIcon weight="fill" /> Pause Run
        </Button>
      )}
      {status === 'paused' && (
        <Button size="lg" onClick={onResumeOrApprove}>
          {hasPendingAssets ? <SealCheckIcon weight="fill" /> : <PlayIcon weight="fill" />}
          {hasPendingAssets ? 'Approve Selected' : 'Resume Run'}
        </Button>
      )}
      {(status === 'running' || status === 'paused') && (
        <Button variant="destructive" size="lg" onClick={onCancel}>
          <XIcon weight="bold" /> Cancel Run
        </Button>
      )}
      {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
        <Button size="lg" onClick={onRerun} disabled={loading}>
          <ArrowCounterClockwiseIcon weight="bold" />
          Rerun Agent
        </Button>
      )}
      {status === 'completed' && (
        <Button variant="secondary" size="lg" onClick={onInspect}>
          <EyeIcon />
          Inspect Assets
        </Button>
      )}
    </div>
  )
}
