/**
 * Jobs still marked `running` when the app starts were interrupted by a quit or
 * crash: no runner exists for them in this process. Returns copies of those jobs
 * marked `paused` so the user can resume them (a stale `running` job can only be
 * cancelled). Jobs in any other state are left alone.
 */
export function recoverInterruptedJobs<T extends { status: string; updatedAt: string }>(
  jobs: T[],
  now: Date = new Date()
): T[] {
  return jobs
    .filter((job) => job.status === 'running')
    .map((job) => ({ ...job, status: 'paused', updatedAt: now.toISOString() }))
}
