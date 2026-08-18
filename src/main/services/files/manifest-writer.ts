import { promises as fs } from 'fs'
import { join } from 'path'
import { PexelsManifestAttribution } from '../pexels/pexels-attribution'

export interface ManifestData {
  schemaVersion: 1
  projectId: string
  title: string
  createdAt: string
  finishedAt?: string
  script: string
  inputMode?: 'script' | 'idea'
  originalIdea?: string
  visualConcept?: string
  settingsSnapshot: {
    provider: 'openai' | 'openrouter' | 'gemini'
    modelId: string
    targetPlatform: string
    visualStyle: string
    assetMix: 'videos_only' | 'photos_only' | 'videos_and_photos'
    maxAssetsPerBeat: number
    maxTotalDownloads: number
    inputMode?: 'script' | 'idea'
    targetDuration?: string
    tone?: string
  }
  beats: unknown[]
  assets: unknown[]
  failures: unknown[]
  messages?: unknown[]
  pexelsCandidates?: Array<[string, unknown]>
  sourceDocsCheckedAt?: string
  attribution?: PexelsManifestAttribution
  pexelsQuotaSnapshot?: {
    limit: number
    remaining: number
    resetAt: number
    updatedAt: string
  }
}

export class ManifestWriter {
  private static writeQueues = new Map<string, Promise<void>>()

  public static cleanFolderName(title: string): string {
    let cleaned =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'untitled-project'
    if (cleaned.length > 80) {
      cleaned = cleaned.slice(0, 80).replace(/-$/, '')
    }
    return cleaned
  }

  public static async initializeProjectFolder(
    downloadRoot: string,
    projectName: string,
    uniqueSuffix?: string
  ): Promise<string> {
    const cleanName = uniqueSuffix
      ? `${this.cleanFolderName(projectName)}-${this.cleanFolderName(uniqueSuffix)}`
      : this.cleanFolderName(projectName)
    const projectDir = join(downloadRoot, cleanName)

    await this.ensureProjectStructure(projectDir)
    return projectDir
  }

  public static async ensureProjectStructure(projectDir: string): Promise<void> {
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(join(projectDir, 'photos'), { recursive: true })
    await fs.mkdir(join(projectDir, 'videos'), { recursive: true })
    await fs.mkdir(join(projectDir, 'thumbnails'), { recursive: true })
  }

  public static async writeManifest(projectDir: string, manifest: ManifestData): Promise<void> {
    await this.writeJsonFile(projectDir, 'manifest.json', manifest)
  }

  public static async writeJsonFile(
    projectDir: string,
    fileName: string,
    data: unknown
  ): Promise<void> {
    const filePath = join(projectDir, fileName)
    const previous = this.writeQueues.get(projectDir) || Promise.resolve()
    const next = previous
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(async () => {
        const tempPath = `${filePath}.tmp`
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
        await fs.rename(tempPath, filePath)
      })
    this.writeQueues.set(projectDir, next)
    await next
  }

  public static async appendLog(projectDir: string, event: Record<string, unknown>): Promise<void> {
    const logPath = join(projectDir, 'agent-log.jsonl')
    const logLine = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n'
    await fs.appendFile(logPath, logLine, 'utf-8')
  }
}
