import { ipcMain, BrowserWindow, shell } from 'electron'
import { randomInt } from 'crypto'
import {
  AgentRunner,
  type StartJobInput,
  type JobSnapshot
} from '../services/agent/agent-runner.ts'
import { readSavedAgentState } from '../services/agent/agent-state.ts'
import { savedStatusReason } from '../services/agent/job-status.ts'
import { tailLogEntries } from '../services/agent/log-tail.ts'
import { resolveSearchModeFromSnapshot } from '../services/agent/search-mode.ts'
import { ProjectStore, type JobSummary } from '../services/storage/project-store.ts'
import { SettingsStore } from '../services/storage/settings-store.ts'
import { SecureSecrets } from '../services/storage/secure-secrets.ts'
import { parseTokenUsage } from '../services/files/manifest-writer.ts'
import { expandIdeaToScript, type ExpandedScriptResult } from '../services/llm/idea-expander.ts'
import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { DEFAULT_LLM_PROVIDER, DEFAULT_MODEL_IDS } from '../../shared/llm-defaults.ts'

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
    maxTotalDownloads: z.number().min(1).max(100),
    searchMode: z.enum(['focused', 'broad']).optional().default('focused')
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
  searchMode: z.enum(['focused', 'broad']).optional(),
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
    maxTotalDownloads: 15,
    searchMode: 'focused'
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
        maxTotalDownloads: snap.maxTotalDownloads || 15,
        searchMode: resolveSearchModeFromSnapshot(snap.searchMode)
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
        // initializeAndLoadState() forces the runner to 'paused', so without this
        // check a completed or cancelled job would be restarted.
        if (summary && summary.status === 'paused') {
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
      // No runner exists, so the registry is all there is to change. A finished job stays as
      // it ended; only a paused one is waiting for something that may never come.
      const summary = await ProjectStore.get(jobId)
      if (summary?.status === 'paused') {
        await ProjectStore.save({
          ...summary,
          status: 'cancelled',
          updatedAt: new Date().toISOString()
        })
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
    const providerId = settings.llmProvider || DEFAULT_LLM_PROVIDER
    const modelId = settings.modelId || DEFAULT_MODEL_IDS[providerId]
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
      timeoutSeconds: settings.requestTimeoutSeconds,
      providerId,
      modelId,
      apiKey: providerKey,
      sessionId: 'stockfinder:expand'
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
        usage?: unknown
      }

      let logs: unknown[] = []
      try {
        const logsPath = join(summary.downloadPath, 'agent-log.jsonl')
        // Only the newest entries are parsed, so a log of many megabytes loads quickly.
        logs = tailLogEntries((await fs.readFile(logsPath, 'utf-8')).split('\n'))
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

      // Reads never change a job: the registry's status is returned as it is.
      const beats = (manifest.beats || []) as JobSnapshot['beats']
      const status = summary.status
      const saved = await readSavedAgentState(summary.downloadPath)

      return {
        jobId: manifest.projectId || jobId,
        title: manifest.title || summary.title,
        script: manifest.script || summary.script,
        inputMode: manifest.inputMode || manifest.settingsSnapshot?.inputMode,
        idea: manifest.originalIdea,
        visualConcept: manifest.visualConcept,
        status,
        statusReason: savedStatusReason(status, saved.statusReason),
        progress: status === 'completed' ? 100 : 0,
        currentStep: status === 'completed' ? 'Finished' : 'Stopped',
        beats: beats,
        logs: logs as JobSnapshot['logs'],
        downloadedCount,
        failedCount,
        usage: parseTokenUsage(manifest.usage)
      }
    } catch {
      return {
        jobId: summary.jobId,
        title: summary.title,
        script: summary.script,
        status: summary.status,
        statusReason: savedStatusReason(summary.status, undefined),
        progress: summary.status === 'completed' ? 100 : 0,
        currentStep: summary.status === 'completed' ? 'Finished' : 'Stopped',
        beats: [],
        logs: [],
        downloadedCount: summary.assetCount,
        failedCount: 0
      }
    }
  })

  ipcMain.handle('jobs:list', async (): Promise<JobSummary[]> => ProjectStore.list())

  ipcMain.handle('jobs:delete', async (_, rawJobId: unknown): Promise<void> => {
    const jobId = JobIdSchema.parse(rawJobId)
    const runner = AgentRunner.getActive(jobId)
    if (runner) {
      await runner.cancel()
      await runner.waitForShutdown()
    }
    const summary = await ProjectStore.get(jobId)
    if (summary && summary.downloadPath) {
      const folderExists = await fs.access(summary.downloadPath).then(
        () => true,
        () => false
      )
      if (folderExists) {
        try {
          // Trash, not rm -rf: the folder may hold edits the user made by hand,
          // and a mis-click should be recoverable.
          await shell.trashItem(summary.downloadPath)
        } catch (err) {
          // Keep the registry entry so the user can retry — otherwise files
          // remain on disk while the project becomes unreachable in-app.
          const message = err instanceof Error ? err.message : String(err)
          throw new Error(
            `Could not move the project folder to the trash (${summary.downloadPath}): ${message}`
          )
        }
      }
    }
    await ProjectStore.delete(jobId)
  })
}
