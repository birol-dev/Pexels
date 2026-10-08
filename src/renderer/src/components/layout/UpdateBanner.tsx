import React, { useState } from 'react'
import { ArrowCircleUpIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { useUpdateState } from '@renderer/hooks/use-update-state'
import { api } from '@renderer/lib/api-client'
import { shouldShowUpdateBanner, updateReadyMessage } from '../../../../shared/update-policy'

/** Offers the restart once an update is downloaded, and never while a job is running. */
export function UpdateBanner(): React.JSX.Element | null {
  const update = useUpdateState()
  const [restarting, setRestarting] = useState(false)

  if (!update?.readyVersion || !shouldShowUpdateBanner(update)) return null

  const restart = async (): Promise<void> => {
    setRestarting(true)
    try {
      await api.app.restartToUpdate()
      // The app quits here, so the button stays disabled.
    } catch (err) {
      setRestarting(false)
      toast.error(err instanceof Error ? err.message : 'Could not restart to update.')
    }
  }

  return (
    <Card
      variant="accent"
      role="status"
      className="mx-grid-margin mt-4 gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3 text-sm font-bold text-on-surface">
        <ArrowCircleUpIcon size={20} weight="bold" className="shrink-0" aria-hidden />
        {updateReadyMessage(update.readyVersion)}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={restart}
        disabled={restarting}
      >
        {restarting ? 'Restarting...' : 'Restart to update'}
      </Button>
    </Card>
  )
}
