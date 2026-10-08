import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api-client'
import { useAppStore } from '@renderer/lib/store'
import type { UpdateState } from '../../../shared/update-policy'

/** While an update waits for a restart, the main process is asked again this often. */
const UPDATE_STATE_POLL_MS = 15_000

function loadUpdateState(apply: (state: UpdateState) => void): void {
  api.app.getUpdateState().then(apply, () => {
    // Keep the last answer. Update state is never worth an error in the UI.
  })
}

/**
 * What the main process knows about updates: whether this build can update, whether a
 * downloaded version is waiting, and whether a job is running. Null until the first answer.
 *
 * The main process owns `jobRunning` because the renderer only hears about the job that is
 * open. It is asked again when the open job changes status and, while an update is waiting,
 * on a timer, so the banner appears once a job ends and goes away when one starts.
 */
export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  const openJobStatus = useAppStore((s) => s.activeJob?.status)

  useEffect(() => {
    let active = true
    const apply = (next: UpdateState): void => {
      if (active) setState(next)
    }
    loadUpdateState(apply)
    const stopListening = api.app.onUpdateReady(() => loadUpdateState(apply))
    return () => {
      active = false
      stopListening()
    }
  }, [openJobStatus])

  const updateWaiting = state?.readyVersion != null
  useEffect(() => {
    if (!updateWaiting) return
    let active = true
    const timer = setInterval(() => {
      loadUpdateState((next) => {
        if (active) setState(next)
      })
    }, UPDATE_STATE_POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [updateWaiting])

  return state
}
