import { promises as fs } from 'fs'
import { join } from 'path'

export interface ManifestData {
  schemaVersion: 1
  projectId: string
  title: string
  createdAt: string
  finishedAt?: string
  script: string
  settingsSnapshot: {
    provider: 'openai' | 'openrouter' | 'gemini'
    modelId: string
    targetPlatform: string
    visualStyle: string
    assetMix: 'videos_only' | 'photos_only' | 'videos_and_photos'
    maxAssetsPerBeat: number
    maxTotalDownloads: number
  }
  beats: unknown[]
  assets: unknown[]
  failures: unknown[]
  messages?: unknown[]
  sourceDocsCheckedAt?: string
}

export class ManifestWriter {
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
    const manifestPath = join(projectDir, 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  }

  public static async appendLog(projectDir: string, event: Record<string, unknown>): Promise<void> {
    const logPath = join(projectDir, 'agent-log.jsonl')
    const logLine = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n'
    await fs.appendFile(logPath, logLine, 'utf-8')
  }
}
