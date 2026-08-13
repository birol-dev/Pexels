import { ipcMain, BrowserWindow } from 'electron'
import { randomInt } from 'crypto'
import { AgentRunner, StartJobInput, JobSnapshot } from '../services/agent/agent-runner'
import { ProjectStore, JobSummary } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'

function createJobId(): string {
  // Millisecond timestamps alone can collide under rapid start/rerun clicks.
  return `job_${Date.now()}${randomInt(100000, 999999)}`
}

const StartJobInputSchema = z.object({
  title: z.string().min(1),
  script: z.string().min(1),
  platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']),
  style: z.string().min(1),
  mix: z.enum(['videos only', 'photos only', 'videos + photos']),
  maxAssetsPerBeat: z.number().min(1).max(10),
  maxTotalDownloads: z.number().min(1).max(100)
})

const JobIdSchema = z.string().regex(/^job_\d+$/)
const ApprovalDecisionSchema = z
  .object({
    approvedAssetIds: z.array(z.string()).optional(),
    rejectedAssetIds: z.array(z.string()).optional()
  })
  .optional()

function broadcastJobEvent(event: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const w of windows) {
    w.webContents.send('jobs:event', event)
  }
}

async function getJobInputFromManifest(summary: JobSummary): Promise<StartJobInput> {
  const defaultInput: StartJobInput = {
    title: summary.title,
    script: summary.script,
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 3,
    maxTotalDownloads: 15
  }

  try {
    const manifestPath = join(summary.downloadPath, 'manifest.json')
    const data = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(data) as {
      title?: string
      script?: string
      settingsSnapshot?: {
        targetPlatform?: string
        visualStyle?: string
        assetMix?: string
        maxAssetsPerBeat?: number
        maxTotalDownloads?: number
      }
    }
    if (manifest.settingsSnapshot) {
      const snap = manifest.settingsSnapshot

      const mapAssetMixBack = (mix: string): StartJobInput['mix'] => {
        if (mix === 'videos_only') return 'videos only'
        if (mix === 'photos_only') return 'photos only'
        return 'videos + photos'
      }

      return {
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        platform: (snap.targetPlatform || 'YouTube') as StartJobInput['platform'],
        style: (snap.visualStyle || 'cinematic') as StartJobInput['style'],
        mix: mapAssetMixBack(snap.assetMix || ''),
        maxAssetsPerBeat: snap.maxAssetsPerBeat || 3,
        maxTotalDownloads: snap.maxTotalDownloads || 15
      }
    }
  } catch (err) {
    console.warn(`Could not read manifest for job settings:`, err)
  }
  return defaultInput
}

export function registerJobsHandlers(): void {
  ipcMain.handle('jobs:start', async (_, rawInput): Promise<string> => {
    const input = StartJobInputSchema.parse(rawInput) as StartJobInput
    const jobId = createJobId()

    const runner = new AgentRunner(jobId, input)
    runner.on('event', (evt) => {
      broadcastJobEvent(evt)
    })

    // Register before returning so jobs:list cannot miss this job.
    await runner.ensureRegistered()
    runner.start().catch((err) => {
      console.error(`Runner ${jobId} failed during execution:`, err)
    })

    return jobId
  })

  ipcMain.handle('jobs:pause', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.pause()
    }
  })

  ipcMain.handle('jobs:resume', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.resume()
    } else {
      // If not active (e.g. process restarted), restore state then resume
      const summary = await ProjectStore.get(jobId)
      if (summary && summary.status === 'paused') {
        const input = await getJobInputFromManifest(summary)
        const newRunner = new AgentRunner(jobId, input)
        newRunner.on('event', (evt) => broadcastJobEvent(evt))
        await newRunner.initializeAndLoadState()
        await newRunner.resume()
      }
    }
  })

  ipcMain.handle(
    'jobs:approveAndResume',
    async (_, rawJobId: unknown, rawDecision): Promise<void> => {
      const jobId = JobIdSchema.parse(rawJobId)
      const decision = ApprovalDecisionSchema.parse(rawDecision) || {}
      let runner = AgentRunner.getActive(jobId)
      if (!runner) {
        const summary = await ProjectStore.get(jobId)
        if (summary) {
          const input = await getJobInputFromManifest(summary)
          const newRunner = new AgentRunner(jobId, input)
          newRunner.on('event', (evt) => broadcastJobEvent(evt))
          await newRunner.initializeAndLoadState()
          runner = newRunner
        }
      }

      if (runner) {
        await runner.approveAndResume(decision)
      }
    }
  )

  ipcMain.handle('jobs:cancel', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.cancel()
    } else {
      const summary = await ProjectStore.get(jobId)
      if (summary) {
        summary.status = 'cancelled'
        await ProjectStore.save(summary)
      }
    }
  })

  ipcMain.handle('jobs:rerun', async (_, rawJobId: unknown): Promise<string> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found')

    const newJobId = createJobId()
    const input = await getJobInputFromManifest(summary)
    input.title = `${input.title} (Rerun)`

    const runner = new AgentRunner(newJobId, input)
    runner.on('event', (evt) => broadcastJobEvent(evt))
    await runner.ensureRegistered()
    runner.start().catch((err) => console.error(err))

    return newJobId
  })

  ipcMain.handle('jobs:get', async (_, rawJobId: unknown): Promise<JobSnapshot> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const active = AgentRunner.getActive(jobId)
    if (active) {
      return active.getSnapshot()
    }

    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found in registry')

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data) as {
        projectId?: string
        title?: string
        script?: string
        beats?: unknown[]
        assets?: unknown[]
        failures?: unknown[]
      }

      let logs: unknown[] = []
      try {
        const logsPath = join(summary.downloadPath, 'agent-log.jsonl')
        const logData = await fs.readFile(logsPath, 'utf-8')
        logs = logData
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => {
            try {
              return JSON.parse(line) as unknown
            } catch {
              return null
            }
          })
          .filter((log) => log !== null)
      } catch {
        // Logs file may be missing, which is fine
      }

      const beatAssets = (manifest.beats || []).flatMap(
        (beat) => (beat as { assets?: Array<{ status?: string }> }).assets || []
      )
      // Prefer beat-level asset status — top-level assets/failures arrays can
      // be empty or partial after resume (fresh downloader task list).
      const downloadedCount = beatAssets.filter((a) => a.status === 'completed').length
      const failedCount = beatAssets.filter((a) => a.status === 'failed').length

      return {
        jobId: manifest.projectId || jobId,
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        status: summary.status,
        progress: summary.status === 'completed' ? 100 : 0,
        currentStep: summary.status === 'completed' ? 'Finished' : 'Stopped',
        beats: (manifest.beats || []) as JobSnapshot['beats'],
        logs: logs as JobSnapshot['logs'],
        downloadedCount,
        failedCount
      }
    } catch {
      return {
        jobId: summary.jobId,
        title: summary.title,
        script: summary.script,
        status: summary.status,
        progress: summary.status === 'completed' ? 100 : 0,
        currentStep: summary.status === 'completed' ? 'Finished' : 'Stopped',
        beats: [],
        logs: [],
        downloadedCount: summary.assetCount,
        failedCount: 0
      }
    }
  })

  ipcMain.handle('jobs:list', async (): Promise<JobSummary[]> => {
    return await ProjectStore.list()
  })

  ipcMain.handle('jobs:delete', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.cancel()
      await runner.waitForShutdown()
    }
    const summary = await ProjectStore.get(jobId)
    if (summary && summary.downloadPath) {
      try {
        await fs.rm(summary.downloadPath, { recursive: true, force: true })
      } catch (err) {
        // Keep the registry entry so the user can retry — otherwise files
        // remain on disk while the project becomes unreachable in-app.
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Failed to delete local project files at ${summary.downloadPath}: ${message}`
        )
      }
    }
    await ProjectStore.delete(jobId)
  })
}
