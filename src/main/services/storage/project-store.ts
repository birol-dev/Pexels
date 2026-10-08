import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { areAllBeatsDownloaded } from '../agent/tool-schemas.ts'
import { loadRecoverableJson, writeJsonAtomic } from './state-file-recovery.ts'
import { recoverInterruptedJobs } from './job-recovery.ts'

export interface JobSummary {
  jobId: string
  projectName: string
  title: string
  script: string
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  createdAt: string
  updatedAt: string
  downloadPath: string
  assetCount: number
}

/**
 * How many files a job has downloaded when its manifest shows every beat finished, else
 * null. A missing or unreadable manifest counts as not finished.
 */
async function countDownloadsIfFinished(job: JobSummary): Promise<number | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(join(job.downloadPath, 'manifest.json'), 'utf-8'))
    const beats: Array<{ status: string; assets?: Array<{ status: string }> }> = Array.isArray(
      manifest?.beats
    )
      ? manifest.beats
      : []
    if (!areAllBeatsDownloaded(beats)) return null
    return beats.flatMap((b) => b.assets || []).filter((a) => a.status === 'completed').length
  } catch {
    return null
  }
}

let projectsFile: string | null = null
function getProjectsFile(): string {
  if (!projectsFile) {
    projectsFile = join(app.getPath('userData'), 'projects.json')
  }
  return projectsFile
}

export class ProjectStore {
  private static cachedProjects: JobSummary[] | null = null
  private static writeQueue: Promise<void> = Promise.resolve()

  private static async readProjectsFile(): Promise<JobSummary[]> {
    if (this.cachedProjects) return this.cachedProjects
    const filePath = getProjectsFile()
    const result = await loadRecoverableJson(filePath, (value): value is JobSummary[] =>
      Array.isArray(value)
    )
    if (result.status === 'unavailable') {
      // Transient I/O must surface. Treating it as [] would overwrite a live
      // registry on the next successful save.
      throw result.error
    }
    this.cachedProjects = result.status === 'ok' ? result.value : []
    return this.cachedProjects
  }

  private static enqueueWrite(op: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(op)
    return this.writeQueue
  }

  private static async persistProjects(projects: JobSummary[]): Promise<void> {
    const filePath = getProjectsFile()
    const snapshot = projects.map((p) => ({ ...p }))
    await writeJsonAtomic(filePath, snapshot)
    this.cachedProjects = snapshot
  }

  public static async list(): Promise<JobSummary[]> {
    return await this.readProjectsFile()
  }

  public static async get(jobId: string): Promise<JobSummary | undefined> {
    const list = await this.list()
    return list.find((p) => p.jobId === jobId)
  }

  public static async save(project: JobSummary): Promise<void> {
    // Read-modify-write must run inside the queue. Concurrent jobs previously
    // snapshot the same list, then the later write dropped the earlier update.
    await this.enqueueWrite(async () => {
      const list = [...(await this.readProjectsFile())]
      const index = list.findIndex((p) => p.jobId === project.jobId)
      if (index !== -1) {
        list[index] = project
      } else {
        list.push(project)
      }
      await this.persistProjects(list)
    })
  }

  /**
   * Startup only: no runner exists yet, so any job still marked `running` was
   * interrupted by a quit or crash. A job whose manifest shows every beat downloaded
   * is completed; the others are marked paused so they can be resumed. This is the
   * only place that corrects a status from the manifest: reads never do.
   * Returns how many jobs were recovered.
   */
  public static async recoverInterruptedJobs(): Promise<number> {
    const jobs = await this.list()
    const finished = new Map<string, number>()
    for (const job of jobs) {
      if (job.status !== 'running') continue
      const downloaded = await countDownloadsIfFinished(job)
      if (downloaded !== null) finished.set(job.jobId, downloaded)
    }

    const interrupted = recoverInterruptedJobs(jobs, (job) => finished.has(job.jobId))
    for (const job of interrupted) {
      await this.save({ ...job, assetCount: finished.get(job.jobId) ?? job.assetCount })
    }
    return interrupted.length
  }

  public static async delete(jobId: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const list = await this.readProjectsFile()
      const filtered = list.filter((p) => p.jobId !== jobId)
      await this.persistProjects(filtered)
    })
  }
}
