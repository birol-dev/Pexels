/**
 * Jobs still marked `running` at startup were cut off by a quit or crash: no runner
 * exists for them in this process. A job whose downloads had all finished is completed;
 * any other job becomes resumable (a stale `running` job could only be cancelled).
 * Returns copies of those jobs. Jobs in any other state are left alone.
 */
export function recoverInterruptedJobs<
  T extends { jobId: string; status: string; updatedAt: string }
>(jobs: T[], allBeatsDownloaded: (job: T) => boolean, now: Date = new Date()): T[] {
  return jobs
    .filter((job) => job.status === 'running')
    .map((job) => ({
      ...job,
      status: allBeatsDownloaded(job) ? 'completed' : 'paused',
      updatedAt: now.toISOString()
    }))
}
