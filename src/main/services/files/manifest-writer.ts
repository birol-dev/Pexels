import { promises as fs } from 'fs'
import { join } from 'path'
import type { PexelsManifestAttribution } from '../pexels/pexels-attribution.ts'

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
  private static throttledTimers = new Map<string, NodeJS.Timeout>()
  private static pendingThrottledData = new Map<
    string,
    { projectDir: string; fileName: string; data: unknown }
  >()

  public static cleanFolderName(title: string): string {
    let cleaned =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled-project'
    if (cleaned.length > 80) {
      cleaned = cleaned.slice(0, 80).replace(/-+$/, '')
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
    await Promise.all([
      fs.mkdir(join(projectDir, 'photos'), { recursive: true }),
      fs.mkdir(join(projectDir, 'videos'), { recursive: true }),
      fs.mkdir(join(projectDir, 'thumbnails'), { recursive: true })
    ])
  }

  public static async writeManifest(projectDir: string, manifest: ManifestData): Promise<void> {
    this.cancelThrottledWrite(projectDir, 'manifest.json')
    await this.writeJsonFile(projectDir, 'manifest.json', manifest)
  }

  public static writeManifestThrottled(
    projectDir: string,
    manifest: ManifestData,
    throttleMs = 800
  ): void {
    const key = `${projectDir}:manifest.json`
    this.pendingThrottledData.set(key, { projectDir, fileName: 'manifest.json', data: manifest })

    if (this.throttledTimers.has(key)) {
      return
    }

    const timer = setTimeout(() => {
      this.throttledTimers.delete(key)
      const pending = this.pendingThrottledData.get(key)
      if (pending) {
        this.pendingThrottledData.delete(key)
        this.writeJsonFile(pending.projectDir, pending.fileName, pending.data).catch((err) => {
          console.error(`Failed to execute throttled write for ${pending.fileName}:`, err)
        })
      }
    }, throttleMs)

    this.throttledTimers.set(key, timer)
  }

  public static async flushPendingWrites(projectDir?: string): Promise<void> {
    const promises: Promise<void>[] = []

    for (const [key, timer] of this.throttledTimers.entries()) {
      const pending = this.pendingThrottledData.get(key)
      if (!projectDir || (pending && pending.projectDir === projectDir)) {
        clearTimeout(timer)
        this.throttledTimers.delete(key)
        if (pending) {
          this.pendingThrottledData.delete(key)
          promises.push(this.writeJsonFile(pending.projectDir, pending.fileName, pending.data))
        }
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises)
    }

    if (projectDir) {
      const queue = this.writeQueues.get(projectDir)
      if (queue) await queue
    }
  }

  private static cancelThrottledWrite(projectDir: string, fileName: string): void {
    const key = `${projectDir}:${fileName}`
    const timer = this.throttledTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.throttledTimers.delete(key)
    }
    this.pendingThrottledData.delete(key)
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
