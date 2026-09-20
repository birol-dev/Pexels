import { app } from 'electron'
import { join } from 'path'
import { loadRecoverableJson, writeJsonAtomic } from './state-file-recovery.ts'

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

  public static async delete(jobId: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const list = await this.readProjectsFile()
      const filtered = list.filter((p) => p.jobId !== jobId)
      await this.persistProjects(filtered)
    })
  }
}
