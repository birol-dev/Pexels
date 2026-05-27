import { ipcMain, BrowserWindow } from 'electron'
import { AgentRunner, StartJobInput } from '../services/agent/agent-runner'
import { ProjectStore } from '../services/storage/project-store'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const StartJobInputSchema = z.object({
  title: z.string().min(1),
  script: z.string().min(1),
  platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']),
  style: z.enum([
    'cinematic',
    'documentary',
    'business',
    'tech',
    'nature',
    'lifestyle',
    'abstract'
  ]),
  mix: z.enum(['videos only', 'photos only', 'videos + photos']),
  maxAssetsPerBeat: z.number().min(1).max(10),
  maxTotalDownloads: z.number().min(1).max(100)
})

function broadcastJobEvent(event: any) {
  const windows = BrowserWindow.getAllWindows()
  for (const w of windows) {
    w.webContents.send('jobs:event', event)
  }
}

async function getJobInputFromManifest(summary: any): Promise<StartJobInput> {
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
    const manifest = JSON.parse(data)
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
        platform: snap.targetPlatform || 'YouTube',
        style: snap.visualStyle || 'cinematic',
        mix: mapAssetMixBack(snap.assetMix),
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
  ipcMain.handle('jobs:start', async (_, rawInput) => {
    const input = StartJobInputSchema.parse(rawInput)
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

  ipcMain.handle('jobs:pause', async (_, jobId: string) => {
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.pause()
    }
  })

  ipcMain.handle('jobs:resume', async (_, jobId: string) => {
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

  ipcMain.handle('jobs:approveAndResume', async (_, jobId: string) => {
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.approveAndResume()
    }
  })

  ipcMain.handle('jobs:cancel', async (_, jobId: string) => {
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

  ipcMain.handle('jobs:rerun', async (_, jobId: string) => {
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

  ipcMain.handle('jobs:get', async (_, jobId: string) => {
    const active = AgentRunner.getActive(jobId)
    if (active) {
      return active.getSnapshot()
    }

    const summary = await ProjectStore.get(jobId)
    if (!summary) throw new Error('Job not found in registry')

    try {
      const manifestPath = join(summary.downloadPath, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data)

      let logs: any[] = []
      try {
        const logsPath = join(summary.downloadPath, 'agent-log.jsonl')
        const logData = await fs.readFile(logsPath, 'utf-8')
        logs = logData
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
      } catch {}

      return {
        jobId: manifest.projectId || jobId,
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        status: summary.status,
        progress: summary.status === 'completed' ? 100 : 0,
        currentStep: summary.status === 'completed' ? 'Finished' : 'Stopped',
        beats: manifest.beats || [],
        logs,
        downloadedCount: manifest.assets?.length || 0,
        failedCount: manifest.failures?.length || 0
      }
    } catch (err) {
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

  ipcMain.handle('jobs:list', async () => {
    return await ProjectStore.list()
  })
}
