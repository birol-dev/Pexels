import { ipcMain, BrowserWindow } from 'electron'
import { randomInt } from 'crypto'
import { AgentRunner, StartJobInput, JobSnapshot } from '../services/agent/agent-runner'
import { ProjectStore, JobSummary } from '../services/storage/project-store'
import { SettingsStore } from '../services/storage/settings-store'
import { SecureSecrets } from '../services/storage/secure-secrets'
import { expandIdeaToScript, ExpandedScriptResult } from '../services/llm/idea-expander'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'

function createJobId(): string {
  // Millisecond timestamps alone can collide under rapid start/rerun clicks.
  return `job_${Date.now()}${randomInt(100000, 999999)}`
}

const StartJobInputSchema = z
  .object({
    title: z.string().min(1),
    script: z.string(),
    inputMode: z.enum(['script', 'idea']).optional(),
    idea: z.string().optional(),
    targetDuration: z.string().optional(),
    tone: z.string().optional(),
    visualConcept: z.string().optional(),
    platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']),
    style: z.string().min(1),
    mix: z.enum(['videos only', 'photos only', 'videos + photos']),
    maxAssetsPerBeat: z.number().min(1).max(10),
    maxTotalDownloads: z.number().min(1).max(100)
  })
  .refine(
    (data) => {
      if (data.inputMode === 'idea') {
        return Boolean((data.idea && data.idea.trim()) || (data.script && data.script.trim()))
      }
      return Boolean(data.script && data.script.trim())
    },
    {
      message: 'Please provide either a video script or an idea to begin.'
    }
  )

const ExpandIdeaInputSchema = z.object({
  idea: z.string().min(1, 'Please provide an idea or topic to expand.'),
  platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']).optional(),
  style: z.string().optional(),
  targetDuration: z.string().optional(),
  tone: z.string().optional(),
  title: z.string().optional()
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

const ManifestSettingsSnapshotSchema = z.object({
  targetPlatform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']).optional(),
  visualStyle: z.string().optional(),
  assetMix: z.string().optional(),
  maxAssetsPerBeat: z.number().int().min(1).max(10).optional(),
  maxTotalDownloads: z.number().int().min(1).max(100).optional(),
  inputMode: z.enum(['script', 'idea']).optional(),
  targetDuration: z.string().optional(),
  tone: z.string().optional()
})

const ManifestSchema = z.object({
  title: z.string().optional(),
  script: z.string().optional(),
  inputMode: z.enum(['script', 'idea']).optional(),
  originalIdea: z.string().optional(),
  visualConcept: z.string().optional(),
  settingsSnapshot: ManifestSettingsSnapshotSchema.optional()
})

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
    const parsed = JSON.parse(data)
    const result = ManifestSchema.safeParse(parsed)

    if (!result.success) {
      console.warn(`Manifest validation failed for ${summary.jobId}:`, result.error)
      return defaultInput
    }

    const manifest = result.data
    if (manifest.settingsSnapshot) {
      const snap = manifest.settingsSnapshot

      const mapAssetMixBack = (mix?: string): StartJobInput['mix'] => {
        if (mix === 'videos_only' || mix === 'videos only') return 'videos only'
        if (mix === 'photos_only' || mix === 'photos only') return 'photos only'
        return 'videos + photos'
      }

      return {
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        inputMode: manifest.inputMode || snap.inputMode,
        idea: manifest.originalIdea,
        visualConcept: manifest.visualConcept,
        targetDuration: snap.targetDuration,
        tone: snap.tone,
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

  ipcMain.handle('jobs:expandIdea', async (_, rawInput: unknown): Promise<ExpandedScriptResult> => {
    const input = ExpandIdeaInputSchema.parse(rawInput)
    const settings = await SettingsStore.getSettings()
    const providerId = settings.llmProvider || 'openai'
    const modelId = settings.modelId || 'gpt-4o'
    const providerKey = await SecureSecrets.getSecret(`${providerId}Key`)

    if (!providerKey) {
      throw new Error(
        `Missing API Key for LLM provider (${providerId.toUpperCase()}). Please configure your API key in Settings before expanding ideas.`
      )
    }

    return await expandIdeaToScript({
      idea: input.idea,
      platform: input.platform,
      style: input.style,
      targetDuration: input.targetDuration,
      tone: input.tone,
      title: input.title,
      timeoutSeconds: settings.requestTimeoutSeconds || 60,
      providerId,
      modelId,
      apiKey: providerKey
    })
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
        inputMode?: 'script' | 'idea'
        originalIdea?: string
        visualConcept?: string
        settingsSnapshot?: {
          inputMode?: 'script' | 'idea'
        }
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

      const beats = (manifest.beats || []) as JobSnapshot['beats']
      const allBeatsCompleted =
        beats.length > 0 &&
        beats.every(
          (b) =>
            b.status === 'completed' &&
            (b.assets || []).length > 0 &&
            b.assets.every((a) => a.status === 'completed')
        )
      let effectiveStatus = summary.status
      if (allBeatsCompleted && summary.status !== 'completed' && summary.status !== 'cancelled') {
        effectiveStatus = 'completed'
        summary.status = 'completed'
        summary.assetCount = downloadedCount
        await ProjectStore.save(summary)
      }

      return {
        jobId: manifest.projectId || jobId,
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        inputMode: manifest.inputMode || manifest.settingsSnapshot?.inputMode,
        idea: manifest.originalIdea,
        visualConcept: manifest.visualConcept,
        status: effectiveStatus,
        progress: effectiveStatus === 'completed' ? 100 : 0,
        currentStep: effectiveStatus === 'completed' ? 'Finished' : 'Stopped',
        beats: beats,
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
    const list = await ProjectStore.list()
    for (const job of list) {
      if (job.status !== 'completed' && job.status !== 'cancelled' && job.downloadPath) {
        try {
          const manifestPath = join(job.downloadPath, 'manifest.json')
          const data = await fs.readFile(manifestPath, 'utf-8')
          const manifest = JSON.parse(data)
          const beats = (manifest.beats || []) as JobSnapshot['beats']
          const allBeatsDone =
            beats.length > 0 &&
            beats.every(
              (b) =>
                b.status === 'completed' &&
                (b.assets || []).length > 0 &&
                b.assets.every((a) => a.status === 'completed')
            )
          if (allBeatsDone) {
            const beatAssets = beats.flatMap((b) => b.assets || [])
            job.status = 'completed'
            job.assetCount = beatAssets.filter((a) => a.status === 'completed').length
            await ProjectStore.save(job)
          }
        } catch {
          // ignore manifest read errors
        }
      }
    }
    return list
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
