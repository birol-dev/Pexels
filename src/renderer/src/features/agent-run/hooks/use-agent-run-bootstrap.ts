import { useEffect } from 'react'
import { useAppStore } from '@renderer/lib/store'

/** Loads settings and falls back to the most recent job when no job is active. */
export function useAgentRunBootstrap(): void {
  const activeJobId = useAppStore((s) => s.activeJobId)
  const loadJobs = useAppStore((s) => s.loadJobs)
  const setActiveJobId = useAppStore((s) => s.setActiveJobId)
  const loadSettings = useAppStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
    if (!activeJobId) {
      loadJobs().then(() => {
        const currentJobs = useAppStore.getState().jobs
        if (currentJobs.length > 0) {
          setActiveJobId(currentJobs[0].jobId)
        }
      })
    }
  }, [activeJobId, loadJobs, setActiveJobId, loadSettings])
}
