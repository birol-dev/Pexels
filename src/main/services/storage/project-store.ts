import { app } from 'electron'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'

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
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(data)
      this.cachedProjects = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Missing file is a normal first-run state. Any other I/O or parse
      // failure must surface — treating it as [] would overwrite real data
      // on the next successful save.
      if (code === 'ENOENT') {
        this.cachedProjects = []
      } else {
        throw error
      }
    }
    return this.cachedProjects!
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
    await fs.mkdir(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(snapshot, null, 2), 'utf-8')
    await fs.rename(tempPath, filePath)
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
