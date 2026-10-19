import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api-client'
import type { JobSummary } from '@renderer/lib/store'

/** Preview images per job, kept for the session. Keyed by job and its last update. */
const covers = new Map<string, string[]>()
const coverKey = (job: JobSummary): string => `${job.jobId}:${job.updatedAt}`

/** How many previews a pack card shows. */
const COVER_COUNT = 3

async function loadCovers(job: JobSummary): Promise<void> {
  try {
    const assets = (await api.assets.list(job.jobId)) as { imageUrl?: unknown }[]
    const urls = assets
      .map((asset) => asset.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0)
    covers.set(coverKey(job), urls.slice(0, COVER_COUNT))
  } catch {
    covers.set(coverKey(job), [])
  }
}

/** Up to three Pexels preview URLs for each job, by jobId. Empty until they load. */
export function useJobCovers(jobs: JobSummary[]): Record<string, string[]> {
  const [, setLoaded] = useState(0)

  useEffect(() => {
    const missing = jobs.filter((job) => !covers.has(coverKey(job)))
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(missing.map(loadCovers)).then(() => {
      if (!cancelled) setLoaded((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [jobs])

  return Object.fromEntries(jobs.map((job) => [job.jobId, covers.get(coverKey(job)) ?? []]))
}
