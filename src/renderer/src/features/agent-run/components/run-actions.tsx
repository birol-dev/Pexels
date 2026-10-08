import React from 'react'
import { EyeIcon, PauseIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { LiquidMetalButton } from '@renderer/components/ui/liquid-metal-button'
import { useAppStore, type JobSnapshot } from '@renderer/lib/store'

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
    <div className="flex gap-4 shrink-0">
      {status === 'running' && (
        <Button variant="secondary" size="lg" onClick={onPause}>
          <PauseIcon weight="fill" /> Pause Run
        </Button>
      )}
      {status === 'paused' && (
        <LiquidMetalButton
          label={hasPendingAssets ? 'Approve Selected' : 'Resume Run'}
          width={hasPendingAssets ? 190 : 150}
          onClick={onResumeOrApprove}
        />
      )}
      {(status === 'running' || status === 'paused') && (
        <Button variant="destructive" size="lg" onClick={handleCancel}>
          <XIcon weight="bold" /> Cancel Run
        </Button>
      )}
      {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
        <LiquidMetalButton label="Rerun Agent" width={160} onClick={onRerun} disabled={loading} />
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
