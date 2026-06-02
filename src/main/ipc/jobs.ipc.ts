import { ipcMain, BrowserWindow } from 'electron'
import { AgentRunner, StartJobInput, JobSnapshot } from '../services/agent/agent-runner'
import { ProjectStore, JobSummary } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const StartJobInputSchema = z.object({
  title: z.string().min(1),
  script: z.string().min(1),
  platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']),
  style: z.string().min(1),
  mix: z.enum(['videos only', 'photos only', 'videos + photos']),
  maxAssetsPerBeat: z.number().min(1).max(10),
  maxTotalDownloads: z.number().min(1).max(100)
})

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
    const jobId = `job_${Date.now()}`

    const runner = new AgentRunner(jobId, input)
    runner.on('event', (evt) => {
      broadcastJobEvent(evt)
    })

    // Start asynchronously in background
    runner.start().catch((err) => {
      console.error(`Runner ${jobId} failed during execution:`, err)
    })

    return jobId
  })

  ipcMain.handle('jobs:pause', async (_, jobId: string): Promise<void> => {
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.pause()
    }
  })

  ipcMain.handle('jobs:resume', async (_, jobId: string): Promise<void> => {
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.resume()
    } else {
      // If not active (e.g. process restarted), we can start a new runner
      const summary = await ProjectStore.get(jobId)
      if (summary) {
        const input = await getJobInputFromManifest(summary)
        const newRunner = new AgentRunner(jobId, input)
        newRunner.on('event', (evt) => broadcastJobEvent(evt))
        newRunner.start().catch((err) => console.error(err))
      }
    }
  })

  ipcMain.handle('jobs:approveAndResume', async (_, jobId: string, rawDecision): Promise<void> => {
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
  })

  ipcMain.handle('jobs:cancel', async (_, jobId: string): Promise<void> => {
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

  ipcMain.handle('jobs:rerun', async (_, jobId: string): Promise<string> => {
    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found')

    const newJobId = `job_${Date.now()}`
    const input = await getJobInputFromManifest(summary)
    input.title = `${input.title} (Rerun)`

    const runner = new AgentRunner(newJobId, input)
    runner.on('event', (evt) => broadcastJobEvent(evt))
    runner.start().catch((err) => console.error(err))

    return newJobId
  })

  ipcMain.handle('jobs:get', async (_, jobId: string): Promise<JobSnapshot> => {
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

      return {
        jobId: manifest.projectId || jobId,
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        status: summary.status,
        progress: summary.status === 'completed' ? 100 : 0,
        currentStep: summary.status === 'completed' ? 'Finished' : 'Stopped',
        beats: (manifest.beats || []) as JobSnapshot['beats'],
        logs: logs as JobSnapshot['logs'],
        downloadedCount: manifest.assets?.length || 0,
        failedCount: manifest.failures?.length || 0
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

  ipcMain.handle('jobs:delete', async (_, jobId: string): Promise<void> => {
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.cancel()
    }
    const summary = await ProjectStore.get(jobId)
    if (summary && summary.downloadPath) {
      try {
        await fs.rm(summary.downloadPath, { recursive: true, force: true })
      } catch (err) {
        console.error(`Failed to delete local project files at ${summary.downloadPath}:`, err)
      }
    }
    await ProjectStore.delete(jobId)
  })
}
