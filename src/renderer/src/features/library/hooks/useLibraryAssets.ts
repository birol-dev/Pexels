import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import type { FlatAsset, GroupedProject } from '../types'

export interface LibraryAssets {
  assets: FlatAsset[]
  loading: boolean
  selectedAsset: FlatAsset | null
  setSelectedAsset: (asset: FlatAsset | null) => void
  groupedProjects: GroupedProject[]
  groupedLoading: boolean
  loadAssets: () => Promise<void>
  loadGroupedAssets: () => Promise<void>
}

/** Loads assets for the active job, or every project's completed assets when none is active. */
export function useLibraryAssets(): LibraryAssets {
  const activeJobId = useAppStore((s) => s.activeJobId)
  const downloadedCount = useAppStore((s) => s.activeJob?.downloadedCount)
  const failedCount = useAppStore((s) => s.activeJob?.failedCount)
  const loadJobs = useAppStore((s) => s.loadJobs)

  const [assets, setAssets] = useState<FlatAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<FlatAsset | null>(null)
  const selectedAssetRef = useRef<FlatAsset | null>(null)
  // Keep ref in sync so loadAssets can read latest without being a render dependency
  useEffect(() => {
    selectedAssetRef.current = selectedAsset
  }, [selectedAsset])

  const [groupedProjects, setGroupedProjects] = useState<GroupedProject[]>([])
  const [groupedLoading, setGroupedLoading] = useState(false)

  const loadAssets = useCallback(async (): Promise<void> => {
    if (!activeJobId) return
    const requestedJobId = activeJobId
    setLoading(true)
    try {
      const list = (await api.assets.list(requestedJobId)) as unknown as FlatAsset[]
      if (useAppStore.getState().activeJobId !== requestedJobId) {
        return
      }
      setAssets(list)
      if (selectedAssetRef.current) {
        const selectedId = selectedAssetRef.current.id
        const updated = list.find((a: FlatAsset) => a.id === selectedId)
        setSelectedAsset(updated || null)
      }
    } catch (err) {
      console.error('Failed to load assets:', err)
    } finally {
      if (useAppStore.getState().activeJobId === requestedJobId) {
        setLoading(false)
      }
    }
  }, [activeJobId])

  const loadGroupedAssets = useCallback(async (): Promise<void> => {
    setGroupedLoading(true)
    try {
      await loadJobs()
      const currentJobs = useAppStore.getState().jobs
      const results: GroupedProject[] = []

      await Promise.all(
        currentJobs.map(async (job) => {
          try {
            const list = (await api.assets.list(job.jobId)) as unknown as FlatAsset[]
            const completed = list
              .filter((a) => a.status === 'completed')
              .map((a) => ({ ...a, jobId: job.jobId }))
            if (completed.length > 0) {
              results.push({ jobId: job.jobId, title: job.title, assets: completed })
            }
          } catch (err) {
            console.error(`Failed to load assets for job ${job.jobId}:`, err)
          }
        })
      )

      results.sort((a, b) => {
        const indexA = currentJobs.findIndex((j) => j.jobId === a.jobId)
        const indexB = currentJobs.findIndex((j) => j.jobId === b.jobId)
        return indexA - indexB
      })

      setGroupedProjects(results)
    } catch (err) {
      console.error('Failed to load grouped assets:', err)
    } finally {
      setGroupedLoading(false)
    }
  }, [loadJobs])

  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedAsset(null)
      selectedAssetRef.current = null
      setAssets([])
      loadAssets()
    })
  }, [activeJobId, loadAssets])

  useEffect(() => {
    if (activeJobId && (downloadedCount !== undefined || failedCount !== undefined)) {
      Promise.resolve().then(() => {
        loadAssets()
      })
    }
  }, [activeJobId, downloadedCount, failedCount, loadAssets])

  useEffect(() => {
    if (!activeJobId) {
      Promise.resolve().then(() => {
        loadGroupedAssets()
      })
    }
  }, [activeJobId, loadGroupedAssets])

  return {
    assets,
    loading,
    selectedAsset,
    setSelectedAsset,
    groupedProjects,
    groupedLoading,
    loadAssets,
    loadGroupedAssets
  }
}
