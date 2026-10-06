import { useEffect } from 'react'
import { useAppStore } from '@renderer/lib/store'

/** Loads job history and settings when the Create Pack screen mounts. */
export function useScriptInputBootstrap(): void {
  const loadJobs = useAppStore((s) => s.loadJobs)
  const loadSettings = useAppStore((s) => s.loadSettings)

  useEffect(() => {
    loadJobs()
    loadSettings()
  }, [loadJobs, loadSettings])
}
