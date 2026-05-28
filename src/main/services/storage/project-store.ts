import { app } from 'electron'
import { join } from 'path'
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

  private static async readProjectsFile(): Promise<JobSummary[]> {
    if (this.cachedProjects) return this.cachedProjects
    const filePath = getProjectsFile()
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      this.cachedProjects = JSON.parse(data)
    } catch {
      this.cachedProjects = []
    }
    return this.cachedProjects!
  }

  private static async writeProjectsFile(projects: JobSummary[]): Promise<void> {
    this.cachedProjects = projects
    const filePath = getProjectsFile()
    try {
      await fs.writeFile(filePath, JSON.stringify(projects, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to write projects file:', error)
    }
  }

  public static async list(): Promise<JobSummary[]> {
    return await this.readProjectsFile()
  }

  public static async get(jobId: string): Promise<JobSummary | undefined> {
    const list = await this.list()
    return list.find((p) => p.jobId === jobId)
  }

  public static async save(project: JobSummary): Promise<void> {
    const list = await this.list()
    const index = list.findIndex((p) => p.jobId === project.jobId)
    if (index !== -1) {
      list[index] = project
    } else {
      list.push(project)
    }
    await this.writeProjectsFile(list)
  }

  public static async delete(jobId: string): Promise<void> {
    const list = await this.list()
    const filtered = list.filter((p) => p.jobId !== jobId)
    await this.writeProjectsFile(filtered)
  }
}
