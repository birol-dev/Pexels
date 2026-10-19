import React from 'react'
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  ImagesIcon,
  PauseIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  XIcon
} from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { useAppStore, type JobSnapshot } from '@renderer/lib/store'

interface RunActionsProps {
  job: JobSnapshot
  hasPendingAssets: boolean
  /** Settings changed since the job was created, so resuming with the new ones is a choice. */
  canResumeWithCurrentSettings: boolean
  loading: boolean
  onPause: () => void
  onResumeOrApprove: () => void
  onResumeWithCurrentSettings: () => void
  onCancel: () => void
  onRerun: () => void
  onInspect: () => void
}

/** One ink pill for what the run needs next; everything else tinted or quiet. */
export function RunActions({
  job,
  hasPendingAssets,
  canResumeWithCurrentSettings,
  loading,
  onPause,
  onResumeOrApprove,
  onResumeWithCurrentSettings,
  onCancel,
  onRerun,
  onInspect
}: RunActionsProps): React.JSX.Element {
  const { status } = job
  const confirm = useAppStore((s) => s.confirm)

  // Cancelling is final (a cancelled run cannot be resumed), so one stray click must not do it.
  const handleCancel = async (): Promise<void> => {
    const confirmed = await confirm(
      'Cancel this run?',
      'The agent stops now and this run cannot be resumed. Files already downloaded stay in the project folder, and you can rerun the project afterwards.',
      { confirmText: 'Cancel run', cancelText: 'Keep running' }
    )
    if (confirmed) onCancel()
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {status === 'paused' && (
        <Button size="lg" onClick={onResumeOrApprove}>
          {hasPendingAssets ? <CheckIcon weight="bold" /> : <PlayIcon weight="fill" />}
          {hasPendingAssets ? 'Approve selected' : 'Resume'}
        </Button>
      )}
      {status === 'paused' && !hasPendingAssets && canResumeWithCurrentSettings && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onResumeWithCurrentSettings}
          title="Use the model and limits from Settings. The earlier conversation is dropped."
        >
          <SlidersHorizontalIcon /> Resume with current settings
        </Button>
      )}
      {status === 'running' && (
        <Button variant="secondary" size="lg" onClick={onPause}>
          <PauseIcon weight="fill" /> Pause
        </Button>
      )}
      {status === 'completed' && (
        <Button size="lg" onClick={onInspect}>
          <ImagesIcon />
          Open in library
        </Button>
      )}
      {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
        <Button
          variant={status === 'completed' ? 'secondary' : 'default'}
          size="lg"
          onClick={onRerun}
          disabled={loading}
        >
          <ArrowCounterClockwiseIcon /> Run again
        </Button>
      )}
      {(status === 'running' || status === 'paused') && (
        <Button
          variant="ghost"
          size="lg"
          onClick={handleCancel}
          className="text-outline hover:bg-error-container hover:text-on-error-container"
        >
          <XIcon /> Cancel run
        </Button>
      )}
    </div>
  )
}
