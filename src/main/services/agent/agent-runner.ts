import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  LlmProviderFactory,
  AgentMessage,
  NormalizedToolDefinition,
  NormalizedToolCall
} from '../llm/llm-provider.ts'
import { PexelsClient } from '../pexels/pexels-client.ts'
import { PexelsDownloader, DownloadTask } from '../pexels/pexels-downloader.ts'
import { validateDownloadUrl } from '../pexels/download-url-validation.ts'
import { buildManifestAttribution } from '../pexels/pexels-attribution.ts'
import { SUBMIT_SCRIPT_BEATS_TOOL, parseBeatsFromToolCall } from '../llm/beat-parse-tool.ts'
import { expandIdeaToScript } from '../llm/idea-expander.ts'
import { ApiError } from '../http/api-errors.ts'
import { createTimeoutLinkedSignal } from '../http/abort-signal.ts'
import { ManifestWriter, ManifestData } from '../files/manifest-writer.ts'
import { ProjectStore, JobSummary } from '../storage/project-store.ts'
import { SecureSecrets } from '../storage/secure-secrets.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import { extractToolCallsFromText } from './tool-parser.ts'

export interface VisualBeat {
  id: string
  text: string
  visualPrompt: string
  searchQueries: string[]
  assets: AssetRecord[]
  rejectedAssets?: Array<{ type: 'photo' | 'video'; pexelsId: number; reason: string }>
  status: 'pending' | 'searching' | 'selecting' | 'downloading' | 'completed' | 'failed'
}

export interface AssetRecord {
  id: string // type_pexelsId
  pexelsId: number
  type: 'photo' | 'video'
  url: string
  imageUrl: string
  downloadUrl: string
  width: number
  height: number
  duration?: number
  photographer: string
  photographerUrl?: string
  query: string
  filePath?: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  error?: string
  progress?: number
}

export interface ApprovalDecision {
  approvedAssetIds?: string[]
  rejectedAssetIds?: string[]
}

export interface AgentLogEvent {
  timestamp: string
  type: 'thought' | 'tool_call' | 'tool_result' | 'progress' | 'error' | 'info'
  message: string
  data?: unknown
}

export interface JobSnapshot {
  jobId: string
  title: string
  script: string
  inputMode?: 'script' | 'idea'
  idea?: string
  visualConcept?: string
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  progress: number
  currentStep: string
  beats: VisualBeat[]
  logs: AgentLogEvent[]
  downloadedCount: number
  failedCount: number
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface StartJobInput {
  title: string
  script: string
  inputMode?: 'script' | 'idea'
  idea?: string
  targetDuration?: string
  tone?: string
  visualConcept?: string
  platform: 'YouTube' | 'Shorts' | 'TikTok' | 'Instagram Reels'
  style: string
  mix: 'videos only' | 'photos only' | 'videos + photos'
  maxAssetsPerBeat: number
  maxTotalDownloads: number
}

export class AgentRunner extends EventEmitter {
  private static activeRunners = new Map<string, AgentRunner>()

  public static getActive(jobId: string): AgentRunner | undefined {
    return this.activeRunners.get(jobId)
  }

  private jobId: string
  private input: StartJobInput
  private status: JobSnapshot['status'] = 'running'
  private progress = 0
  private currentStep = 'Initializing job'
  private beats: VisualBeat[] = []
  private logs: AgentLogEvent[] = []
  private downloadedCount = 0
  private failedCount = 0
  private messages: AgentMessage[] = []
  private usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  }

  private downloader!: PexelsDownloader
  private abortController: AbortController | null = null
  private activePromise: Promise<void> | null = null
  private runGeneration = 0
  private projectDir = ''
  private createdAt = new Date().toISOString()
  private hitIterationLimit = false
  private modelId = 'gpt-4o'
  private providerId: 'openai' | 'gemini' | 'openrouter' = 'openai'
  private maxIterations = 30
  private requestTimeoutSeconds = 60
  private safetySettings = {
    skipExplicit: true,
    avoidPeople: false
  }

  private pexelsCandidates = new Map<
    string,
    {
      pexelsId: number
      type: 'photo' | 'video'
      photographer: string
      photographerUrl?: string
      width: number
      height: number
      imageUrl: string
      duration?: number
      query: string
      variants: Array<{
        label?: string
        quality?: string
        fileType?: string
        url: string
        width?: number
        height?: number
      }>
    }
  >()

  private assetLookup = new Map<string, { asset: AssetRecord; beat: VisualBeat }>()

  private rebuildAssetLookup(): void {
    this.assetLookup.clear()
    for (const b of this.beats) {
      if (b.assets) {
        for (const a of b.assets) {
          this.assetLookup.set(a.id, { asset: a, beat: b })
        }
      }
    }
  }

  constructor(jobId: string, input: StartJobInput) {
    super()
    this.jobId = jobId
    this.input = input
  }

  public async ensureRegistered(): Promise<void> {
    AgentRunner.activeRunners.set(this.jobId, this)

    const settings = await SettingsStore.getSettings()
    this.modelId = settings.modelId
    this.providerId = settings.llmProvider
    this.maxIterations = settings.maxAgentIterations
    this.requestTimeoutSeconds = settings.requestTimeoutSeconds
    this.safetySettings = {
      skipExplicit: settings.skipExplicitQueries,
      avoidPeople: settings.avoidPeopleAndFaces
    }

    if (!this.projectDir) {
      this.projectDir = await this.resolveProjectDirectory(settings.downloadFolder)
    }

    if (!this.downloader) {
      this.downloader = new PexelsDownloader(
        settings.maxConcurrentDownloads,
        (task) => {
          this.handleDownloadProgress(task)
        },
        settings.requestTimeoutSeconds,
        (type, assetId, currentUrl) => this.refreshDownloadUrl(type, assetId, currentUrl)
      )
    }

    await this.saveRegistry()
  }

  private async runBackground(fn: () => Promise<void>): Promise<void> {
    AgentRunner.activeRunners.set(this.jobId, this)
    this.abortController = new AbortController()
    const generation = ++this.runGeneration

    try {
      await fn()
    } catch (error) {
      if (this.status !== 'cancelled' && this.status !== 'paused') {
        const allBeatsDone =
          this.beats.length > 0 &&
          this.beats.every(
            (b) =>
              b.status === 'completed' &&
              (b.assets || []).length > 0 &&
              b.assets.every((a) => a.status === 'completed')
          )
        if (allBeatsDone) {
          this.status = 'completed'
          this.currentStep = 'Finished'
          this.progress = 100
        } else {
          this.status = 'failed'
          const errMsg = error instanceof Error ? error.message : String(error)
          this.log('error', `Agent execution failed: ${errMsg}`)
          this.updateProgress('Error', 100)
        }
      }
    } finally {
      // Only the active generation may clear promise/registry ownership —
      // a rapid resume can start a newer run before this finally executes.
      if (generation === this.runGeneration) {
        this.activePromise = null
        // Keep paused runners registered so resume uses the same instance
        // (and does not re-queue in-flight downloads from a reconstructed runner).
        if (this.status !== 'paused') {
          AgentRunner.activeRunners.delete(this.jobId)
        }
      }
      if (this.projectDir) {
        await ManifestWriter.flushPendingWrites(this.projectDir)
      }
      await this.saveRegistry()
      await this.writeManifest(true)
      this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
    }
  }

  public async waitForShutdown(): Promise<void> {
    if (this.activePromise) {
      try {
        await this.activePromise
      } catch {
        // Ignore errors during shutdown await
      }
    }
    if (this.downloader) {
      await this.downloader.waitForIdle()
    }
    if (this.projectDir) {
      await ManifestWriter.flushPendingWrites(this.projectDir)
    }
  }

  private getCombinedSignal(timeoutSeconds: number): { signal: AbortSignal; cleanup: () => void } {
    return createTimeoutLinkedSignal(timeoutSeconds * 1000, this.abortController?.signal, () =>
      this.log('error', `Request timed out after ${timeoutSeconds} seconds.`)
    )
  }

  private async executeWithTimeout<T>(
    timeoutSeconds: number,
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const { signal, cleanup } = this.getCombinedSignal(timeoutSeconds)
    try {
      return await fn(signal)
    } finally {
      cleanup()
    }
  }

  public getSnapshot(): JobSnapshot {
    return {
      jobId: this.jobId,
      title: this.input.title,
      script: this.input.script,
      inputMode: this.input.inputMode,
      idea: this.input.idea,
      visualConcept: this.input.visualConcept,
      status: this.status,
      progress: this.progress,
      currentStep: this.currentStep,
      beats: this.beats,
      logs: this.logs,
      downloadedCount: this.downloadedCount,
      failedCount: this.failedCount,
      usage: this.usage
    }
  }

  private log(type: AgentLogEvent['type'], message: string, data?: unknown): void {
    const event: AgentLogEvent = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    }
    this.logs.push(event)
    this.emit('event', { jobId: this.jobId, type: 'log', data: event })

    if (this.projectDir) {
      ManifestWriter.appendLog(this.projectDir, event as unknown as Record<string, unknown>).catch(
        (err) => console.error('Failed to write agent log event:', err)
      )
    }
  }

  private updateProgress(step: string, progress: number): void {
    this.currentStep = step
    this.progress = progress
    this.emit('event', { jobId: this.jobId, type: 'progress', data: { step, progress } })
  }

  public async initializeAndLoadState(): Promise<void> {
    AgentRunner.activeRunners.set(this.jobId, this)
    this.abortController = new AbortController()

    const settings = await SettingsStore.getSettings()
    this.modelId = settings.modelId
    this.providerId = settings.llmProvider
    this.maxIterations = settings.maxAgentIterations
    this.requestTimeoutSeconds = settings.requestTimeoutSeconds
    this.safetySettings = {
      skipExplicit: settings.skipExplicitQueries,
      avoidPeople: settings.avoidPeopleAndFaces
    }

    this.projectDir = await this.resolveProjectDirectory(settings.downloadFolder)

    if (!this.downloader) {
      this.downloader = new PexelsDownloader(
        settings.maxConcurrentDownloads,
        (task) => {
          this.handleDownloadProgress(task)
        },
        settings.requestTimeoutSeconds,
        (type, assetId, currentUrl) => this.refreshDownloadUrl(type, assetId, currentUrl)
      )
    }

    await this.loadStateFromManifest()
    this.status = 'paused'
  }

  private async loadStateFromManifest(): Promise<void> {
    if (!this.projectDir) return
    try {
      const manifestPath = join(this.projectDir, 'manifest.json')
      const data = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(data)
      if (typeof manifest.createdAt === 'string' && manifest.createdAt) {
        this.createdAt = manifest.createdAt
      }
      if (manifest.inputMode) {
        this.input.inputMode = manifest.inputMode
      }
      if (manifest.originalIdea) {
        this.input.idea = manifest.originalIdea
      }
      if (manifest.visualConcept) {
        this.input.visualConcept = manifest.visualConcept
      }
      if (manifest.pexelsCandidates) {
        this.pexelsCandidates = new Map(manifest.pexelsCandidates)
      }
      if (manifest.beats && manifest.beats.length > 0) {
        this.beats = (manifest.beats as VisualBeat[]).map((beat: VisualBeat) => {
          // Reset any beat stuck in downloading/searching/selecting back to a clean state
          if (
            beat.status === 'downloading' ||
            beat.status === 'searching' ||
            beat.status === 'selecting'
          ) {
            beat.status = 'pending'
          }
          beat.assets = beat.assets || []
          beat.searchQueries = beat.searchQueries || []
          beat.assets = beat.assets.map((asset: AssetRecord) => {
            if (asset.status === 'downloading') {
              asset.status = 'pending'
              asset.progress = 0
            }
            return asset
          })
          return beat
        })
        this.log('info', `Loaded ${this.beats.length} beats from existing manifest.`)
      }

      if (manifest.messages) {
        this.messages = manifest.messages as AgentMessage[]
      }

      // Load logs
      try {
        const logsPath = join(this.projectDir, 'agent-log.jsonl')
        const logData = await fs.readFile(logsPath, 'utf-8')
        if (logData.trim()) {
          this.logs = logData
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => {
              try {
                return JSON.parse(line) as AgentLogEvent
              } catch {
                return null
              }
            })
            .filter((log): log is AgentLogEvent => log !== null)
        }
      } catch (logErr) {
        console.warn('Failed to load logs from agent-log.jsonl:', logErr)
      }

      // Update metrics
      let downloaded = 0
      let failed = 0
      for (const b of this.beats) {
        if (b.assets) {
          for (const a of b.assets) {
            if (a.status === 'completed') downloaded++
            else if (a.status === 'failed') failed++
          }
        }
      }
      this.downloadedCount = downloaded
      this.failedCount = failed
      this.rebuildAssetLookup()
    } catch {
      // Manifest doesn't exist yet, which is normal for new runs
    }
  }

  private async resolveProjectDirectory(downloadRoot: string): Promise<string> {
    const existingSummary = await ProjectStore.get(this.jobId)
    if (existingSummary?.downloadPath) {
      await ManifestWriter.ensureProjectStructure(existingSummary.downloadPath)
      return existingSummary.downloadPath
    }

    return await ManifestWriter.initializeProjectFolder(downloadRoot, this.input.title, this.jobId)
  }

  private finalizeSuccessfulRun(): void {
    const unfinishedAssets = this.beats
      .flatMap((b) => b.assets || [])
      .filter((a) => a.status === 'pending' || a.status === 'downloading')
    if (unfinishedAssets.length > 0) {
      this.status = 'failed'
      this.log(
        'error',
        `Agent finished with ${unfinishedAssets.length} unfinished download(s); marking job failed.`
      )
      this.updateProgress('Failed — unfinished downloads', 100)
      return
    }

    const completedOrQueued = this.beats
      .flatMap((b) => b.assets || [])
      .filter((a) => a.status === 'completed' || a.status === 'downloading')
    if (completedOrQueued.length === 0 && this.beats.length > 0) {
      this.status = 'failed'
      this.log(
        'error',
        `Agent finished without downloading any assets for ${this.beats.length} visual beats. Try using a model with robust tool calling support (such as gpt-4o, claude-3.7-sonnet, or gemini-2.5-flash).`
      )
      this.updateProgress('Failed — 0 assets downloaded', 100)
      return
    }

    const hasIncompleteBeats =
      this.beats.length > 0 &&
      this.beats.some((b) => !b.assets || !b.assets.some((a) => a.status === 'completed'))

    if (this.hitIterationLimit && hasIncompleteBeats) {
      this.status = 'failed'
      this.log(
        'error',
        `Agent stopped after reaching the maximum iteration limit (${this.maxIterations}) with incomplete beats.`
      )
      this.updateProgress('Failed — iteration limit', 100)
      return
    }

    this.status = 'completed'
    if (this.hitIterationLimit) {
      this.log(
        'info',
        `Agent reached iteration limit (${this.maxIterations}) but all beats have completed downloads.`
      )
    } else {
      this.log('info', 'Agent execution completed successfully!')
    }
    this.updateProgress('Finished', 100)
  }

  public async start(): Promise<void> {
    if (this.activePromise) {
      await this.activePromise
      return
    }

    const task = async (): Promise<void> => {
      // Resume / in-memory restart already has beats. Reloading the manifest
      // would reset in-flight downloads to pending and enqueue duplicates.
      const restoreFromDisk = this.beats.length === 0

      this.log('info', `Starting project: ${this.input.title}`)
      this.updateProgress('Resolving credentials and settings', 5)

      await this.ensureRegistered()
      this.log('info', `Created project workspace directory at: ${this.projectDir}`)

      if (restoreFromDisk) {
        await this.loadStateFromManifest()
      }
      this.status = 'running'
      await this.saveRegistry()

      await this.expandIdeaIfNeeded()
      await this.parseScriptIntoBeats()
      try {
        await this.runAgentLoop()
      } catch (loopErr) {
        const errMsg = loopErr instanceof Error ? loopErr.message : String(loopErr)
        this.log('error', `Agent loop encountered an error: ${errMsg}`)
      }

      if (this.status === 'running') {
        await this.waitForDownloadsToSettle()
      }

      if (this.status === 'running') {
        this.finalizeSuccessfulRun()
      }
    }

    this.activePromise = this.runBackground(task)
    await this.activePromise
  }

  public async pause(): Promise<void> {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.log('info', 'Agent run paused by user')
    if (this.abortController) {
      this.abortController.abort()
    }
    if (!this.activePromise) {
      await this.saveRegistry()
      await this.writeManifest()
    }
    this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
  }

  public async resume(): Promise<void> {
    if (this.status !== 'paused') return
    // Wait for the aborted run's finally to finish before starting another.
    if (this.activePromise) {
      try {
        await this.activePromise
      } catch {
        // Ignore abort-driven rejections while shutting down the prior run.
      }
    }
    this.status = 'running'
    this.log('info', 'Agent run resumed by user')
    this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
    await this.start()
  }

  public async cancel(): Promise<void> {
    this.status = 'cancelled'
    this.log('info', 'Agent run cancelled by user')
    this.downloader?.cancelAll('Job cancelled by user')
    if (this.abortController) {
      this.abortController.abort()
    }
    if (!this.activePromise) {
      await this.saveRegistry()
      await this.writeManifest()
    }
    this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
  }

  private async saveRegistry(): Promise<void> {
    const existingSummary = await ProjectStore.get(this.jobId)
    const now = new Date().toISOString()
    if (existingSummary?.createdAt) {
      this.createdAt = existingSummary.createdAt
    }
    const summary: JobSummary = {
      jobId: this.jobId,
      projectName: ManifestWriter.cleanFolderName(this.input.title),
      title: this.input.title,
      script: this.input.script,
      status: this.status,
      createdAt: existingSummary?.createdAt || this.createdAt,
      updatedAt: now,
      downloadPath: this.projectDir,
      assetCount: this.downloadedCount
    }
    await ProjectStore.save(summary)
  }

  private async writeManifest(immediate = true): Promise<void> {
    if (!this.projectDir) return

    const mapAssetMix = (
      mix: StartJobInput['mix']
    ): 'videos_only' | 'photos_only' | 'videos_and_photos' => {
      if (mix === 'videos only') return 'videos_only'
      if (mix === 'photos only') return 'photos_only'
      return 'videos_and_photos'
    }

    const completedAssets: AssetRecord[] = []
    const failedAssets: AssetRecord[] = []
    const allAssetSnapshots: Array<{
      id: string
      type: 'photo' | 'video'
      pexelsId: number
      url: string
      photographer: string
      photographerUrl?: string
    }> = []

    for (const b of this.beats) {
      if (b.assets) {
        for (const a of b.assets) {
          if (a.status === 'completed') {
            completedAssets.push(a)
          } else if (a.status === 'failed') {
            failedAssets.push(a)
          }
          allAssetSnapshots.push({
            id: a.id,
            type: a.type,
            pexelsId: a.pexelsId,
            url: a.url,
            photographer: a.photographer,
            photographerUrl: a.photographerUrl
          })
        }
      }
    }

    const manifest: ManifestData = {
      schemaVersion: 1,
      projectId: this.jobId,
      title: this.input.title,
      createdAt: this.createdAt,
      finishedAt: this.status === 'completed' ? new Date().toISOString() : undefined,
      script: this.input.script,
      inputMode: this.input.inputMode,
      originalIdea: this.input.idea,
      visualConcept: this.input.visualConcept,
      settingsSnapshot: {
        provider: this.providerId,
        modelId: this.modelId,
        targetPlatform: this.input.platform,
        visualStyle: this.input.style,
        assetMix: mapAssetMix(this.input.mix),
        maxAssetsPerBeat: this.input.maxAssetsPerBeat,
        maxTotalDownloads: this.input.maxTotalDownloads,
        inputMode: this.input.inputMode,
        targetDuration: this.input.targetDuration,
        tone: this.input.tone
      },
      beats: this.beats,
      // Prefer beat-level records so counts survive resume with a fresh downloader.
      assets: completedAssets,
      failures: failedAssets,
      messages: this.messages,
      pexelsCandidates: Array.from(this.pexelsCandidates.entries()),
      sourceDocsCheckedAt: new Date().toISOString(),
      attribution: buildManifestAttribution(allAssetSnapshots),
      pexelsQuotaSnapshot: PexelsClient.getQuotaSnapshot() || undefined
    }

    if (immediate) {
      await ManifestWriter.writeManifest(this.projectDir, manifest)
    } else {
      ManifestWriter.writeManifestThrottled(this.projectDir, manifest, 800)
    }
  }

  private async expandIdeaIfNeeded(): Promise<void> {
    const rawIdea = this.input.idea || (this.input.inputMode === 'idea' ? this.input.script : '')
    const shouldExpand =
      this.input.inputMode === 'idea' &&
      (!this.input.script || this.input.script === this.input.idea)

    if (!shouldExpand || !rawIdea.trim()) return

    this.updateProgress('Expanding video idea with AI', 10)
    this.log(
      'thought',
      `💡 Expanding video concept "${rawIdea.trim().slice(0, 60)}${rawIdea.length > 60 ? '…' : ''}" into a full narration script and visual strategy...`
    )

    const providerKey = await SecureSecrets.getSecret(`${this.providerId}Key`)
    if (!providerKey) {
      throw new Error(`Missing API Key for LLM provider: ${this.providerId}`)
    }

    const expanded = await expandIdeaToScript({
      idea: rawIdea.trim(),
      platform: this.input.platform,
      style: this.input.style,
      targetDuration: this.input.targetDuration,
      tone: this.input.tone,
      title: this.input.title,
      timeoutSeconds: this.requestTimeoutSeconds,
      providerId: this.providerId,
      modelId: this.modelId,
      apiKey: providerKey,
      abortSignal: this.abortController?.signal
    })

    this.input.script = expanded.script
    this.input.visualConcept = expanded.visualConcept
    if (
      expanded.title &&
      (!this.input.title ||
        this.input.title.toLowerCase().startsWith('untitled') ||
        this.input.title.toLowerCase().startsWith('new pack'))
    ) {
      this.input.title = expanded.title
    }

    const wordCount = expanded.script.split(/\s+/).filter(Boolean).length
    this.log(
      'info',
      `Generated full script (${wordCount} words). Visual direction: "${expanded.visualConcept}"`
    )

    await this.saveRegistry()
    await this.writeManifest()
    this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
  }

  private async parseScriptIntoBeats(): Promise<void> {
    if (this.beats.length > 0) return // Already parsed if resuming

    this.updateProgress('Analyzing script into beats', 15)
    this.log(
      'info',
      `Contacting LLM provider (${this.providerId} / model: ${this.modelId}) to segment script into beats...`
    )

    const providerKey = await SecureSecrets.getSecret(`${this.providerId}Key`)
    if (!providerKey) {
      throw new Error(`Missing API Key for LLM provider: ${this.providerId}`)
    }

    const provider = LlmProviderFactory.getProvider(this.providerId)
    const systemPrompt = `You are a professional video editor and script analyzer.
Break the provided script into logical visual beats (scenes or moments of visual focus).
For each beat:
1. Preserve the script text exactly — do not omit or rewrite words.
2. Write a concrete Pexels-friendly visualPrompt for stock photo/video search.

Call the submit_script_beats tool once with the complete ordered beats array.`

    const response = await this.executeWithTimeout(this.requestTimeoutSeconds, (signal) =>
      provider.createToolTurn(
        {
          model: this.modelId,
          systemPrompt,
          messages: [{ role: 'user', content: this.input.script }],
          tools: [SUBMIT_SCRIPT_BEATS_TOOL],
          toolChoice: { name: 'submit_script_beats' },
          temperature: 0.2,
          maxOutputTokens: 4000,
          abortSignal: signal
        },
        { apiKey: providerKey }
      )
    )

    if (response.usage) {
      this.usage.inputTokens += response.usage.inputTokens || 0
      this.usage.outputTokens += response.usage.outputTokens || 0
      this.usage.totalTokens += response.usage.totalTokens || 0
    }

    const beatToolCall = response.toolCalls.find((tc) => tc.name === 'submit_script_beats')
    if (!beatToolCall) {
      const fallbackContent = response.assistantMessage.content || ''
      this.log('error', `Model did not call submit_script_beats. Raw content: ${fallbackContent}`)
      throw new Error('Script parsing failed: model did not return structured beats.')
    }

    const parsedBeats = parseBeatsFromToolCall(beatToolCall.arguments)

    this.beats = parsedBeats.map((beat, index) => ({
      id: `beat_${index + 1}`,
      text: beat.text,
      visualPrompt: beat.visualPrompt,
      searchQueries: [],
      assets: [],
      status: 'pending'
    }))
    this.rebuildAssetLookup()

    this.log('info', `Successfully parsed script into ${this.beats.length} visual beats.`)
    this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
  }

  private async runAgentLoop(): Promise<void> {
    this.updateProgress('Executing agent search and downloads', 30)

    const providerKey = await SecureSecrets.getSecret(`${this.providerId}Key`)
    if (!providerKey) {
      throw new Error(`Missing API Key for LLM provider: ${this.providerId}`)
    }
    const provider = LlmProviderFactory.getProvider(this.providerId)

    const systemPrompt = `You are StockScout, a careful stock-media research agent for YouTube creators.
Your job is to transform a user's video script into practical Pexels stock photo and stock video searches, select useful assets for each visual beat, and download them.

You must follow these rules:
1. Work only on the provided script and user settings.
2. Prefer concrete visual searches over abstract concepts.
3. Search for visible subjects, actions, locations, moods, and objects.
4. Do not search for copyrighted characters, logos, living public figures, or exact private people unless the user script explicitly requires a generic editorial-like concept.
5. Avoid explicit sexual, hateful, or graphic queries.
6. Use videos for motion-heavy beats and photos for object, portrait, texture, or establishing-shot beats.
7. Keep queries short, natural, and Pexels-friendly.
8. Use multiple query angles when the first query is too narrow.
9. Never claim an asset was downloaded unless the tool result confirms it.
10. If results are weak, explain why and try a broader query.
11. Respect the user's max assets and preferred asset mix.
12. Return final answers as structured summaries. Do not invent local file paths.

When selecting assets, prioritize:
- relevance to the script beat
- clear subject visibility
- high resolution
- landscape orientation for YouTube unless the target platform is vertical (Shorts/TikTok/Instagram Reels require vertical)
- realistic, non-stocky feel when possible
- variety across beats

When rejecting assets, give a short reason:
- off topic
- poor composition
- wrong orientation
- duplicate idea
- low resolution
- too literal
- too abstract

Script configuration:
- Platform: ${this.input.platform}
- Visual Style: ${this.input.style}
- Asset Mix: ${this.input.mix} (Only call search tools matching this mix. If 'videos only', only search/select videos. If 'photos only', only photos. If 'videos + photos', both are fine.)
- Max assets per beat: ${this.input.maxAssetsPerBeat}
- Max total downloads allowed: ${this.input.maxTotalDownloads}
- Safety controls: ${this.safetySettings.skipExplicit ? 'Skip explicit/adult keywords.' : 'No strict content filtering.'} ${this.safetySettings.avoidPeople ? 'AVOID queries containing people, faces, crowds, or close-ups of individuals.' : ''}
Here is the parsed list of visual beats:
${JSON.stringify(
  this.beats.map((b) => ({
    id: b.id,
    visualPrompt: b.visualPrompt,
    status: b.status,
    assets: b.assets.map((a) => ({ id: a.id, type: a.type, status: a.status }))
  })),
  null,
  2
)}

Your workflow:
1. For each beat, call Pexels search tools ('search_pexels_photos' or 'search_pexels_videos') to look for matching items. Use simple keyword queries matching the beat's visualPrompt.
2. Review search results and call 'select_assets_for_download' to select the best assets (up to ${this.input.maxAssetsPerBeat} per beat, total cap ${this.input.maxTotalDownloads}) and reject others.
3. Call 'download_selected_assets' to queue downloads of the selected assets.
4. When all beats have sufficient assets downloaded or queued, stop calling tools and provide a final summary.

Available tools: search_pexels_photos, search_pexels_videos, select_assets_for_download, download_selected_assets.
`

    const tools: NormalizedToolDefinition[] = [
      {
        name: 'search_pexels_photos',
        description: 'Search for photos on Pexels matching a query for a script beat.',
        parameters: {
          type: 'object',
          properties: {
            beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
            query: { type: 'string', description: 'The search query keyword.' },
            orientation: {
              type: 'string',
              enum: ['landscape', 'portrait', 'square'],
              description: 'Desired orientation.'
            },
            size: {
              type: 'string',
              enum: ['large', 'medium', 'small'],
              description: 'Desired size.'
            },
            color: { type: 'string', description: 'Desired dominant color.' },
            page: { type: 'number', description: 'Page number (default 1).' },
            perPage: { type: 'number', description: 'Results per page (default 15).' }
          },
          required: ['beatId', 'query']
        }
      },
      {
        name: 'search_pexels_videos',
        description: 'Search for videos on Pexels matching a query for a script beat.',
        parameters: {
          type: 'object',
          properties: {
            beatId: { type: 'string', description: 'The ID of the beat (e.g. beat_1).' },
            query: { type: 'string', description: 'The search query keyword.' },
            orientation: {
              type: 'string',
              enum: ['landscape', 'portrait', 'square'],
              description: 'Desired orientation.'
            },
            size: {
              type: 'string',
              enum: ['large', 'medium', 'small'],
              description: 'Desired size.'
            },
            page: { type: 'number', description: 'Page number (default 1).' },
            perPage: { type: 'number', description: 'Results per page (default 10).' }
          },
          required: ['beatId', 'query']
        }
      },
      {
        name: 'select_assets_for_download',
        description:
          'Select candidates to be downloaded or reject candidates with a reason after search results are visible.',
        parameters: {
          type: 'object',
          properties: {
            selections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  beatId: { type: 'string', description: 'The ID of the beat.' },
                  assetType: { type: 'string', enum: ['photo', 'video'] },
                  pexelsId: { type: 'number', description: 'Pexels asset ID.' },
                  variantUrl: {
                    type: 'string',
                    description: 'The direct download URL from the search result variants.'
                  },
                  reason: {
                    type: 'string',
                    description: 'Brief explanation of why this asset is selected.'
                  }
                },
                required: ['beatId', 'assetType', 'pexelsId', 'variantUrl', 'reason']
              }
            },
            rejections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  beatId: { type: 'string', description: 'The ID of the beat.' },
                  assetType: { type: 'string', enum: ['photo', 'video'] },
                  pexelsId: { type: 'number' },
                  reason: {
                    type: 'string',
                    description: 'Brief explanation of why this asset was rejected.'
                  }
                },
                required: ['beatId', 'assetType', 'pexelsId', 'reason']
              }
            }
          },
          required: ['selections']
        }
      },
      {
        name: 'download_selected_assets',
        description: 'Queue previously selected assets to be downloaded.',
        parameters: {
          type: 'object',
          properties: {
            assetIds: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  assetType: { type: 'string', enum: ['photo', 'video'] },
                  pexelsId: { type: 'number' }
                },
                required: ['assetType', 'pexelsId']
              }
            }
          },
          required: ['assetIds']
        }
      }
    ]

    if (this.messages.length === 0) {
      this.messages = [
        {
          role: 'user',
          content: `Begin searching for stock assets for all ${this.beats.length} visual beats. Call search_pexels_photos or search_pexels_videos for the first beats now.`
        }
      ]
    }
    let iteration = 0
    let emptyToolTurnCount = 0
    const maxEmptyToolNudges = 3

    while (iteration < this.maxIterations && this.status === 'running') {
      const pendingBeats = this.beats.filter(
        (b) => !b.assets || b.assets.length === 0 || b.assets.every((a) => a.status === 'failed')
      )
      const totalSelected = this.getSelectedAssetCount()
      const allBeatsFulfilled =
        pendingBeats.length === 0 || totalSelected >= this.input.maxTotalDownloads
      const hasUnqueuedPendingAssets = this.beats.some((b) =>
        (b.assets || []).some((a) => a.status === 'pending')
      )

      if (allBeatsFulfilled && this.beats.length > 0 && !hasUnqueuedPendingAssets) {
        this.log(
          'info',
          'All visual beats have assets selected or queued. Agent workflow complete.'
        )
        break
      }

      iteration++
      this.log(
        'info',
        `Agent turn ${iteration}/${this.maxIterations}: Consulting StockScout AI (${this.providerId} / ${this.modelId})...`
      )
      const completedBeatsCount = this.beats.filter((b) => b.status === 'completed').length
      const loopProgressVal = Math.round(30 + (completedBeatsCount / this.beats.length) * 60)
      this.updateProgress(
        `StockScout AI is thinking... (Turn ${iteration}/${this.maxIterations})`,
        loopProgressVal
      )

      const turnResult = await this.executeWithTimeout(this.requestTimeoutSeconds, (signal) =>
        provider.createToolTurn(
          {
            model: this.modelId,
            systemPrompt,
            messages: this.messages,
            tools,
            toolChoice: 'auto',
            temperature: 0.3,
            maxOutputTokens: 2000,
            abortSignal: signal
          },
          { apiKey: providerKey }
        )
      )

      if (turnResult.usage) {
        this.usage.inputTokens += turnResult.usage.inputTokens || 0
        this.usage.outputTokens += turnResult.usage.outputTokens || 0
        this.usage.totalTokens += turnResult.usage.totalTokens || 0
      }

      const assistantMsg = turnResult.assistantMessage

      // If the model returned no structured tool_calls, check if tool calls were output in text format
      let effectiveToolCalls = [...turnResult.toolCalls]
      if (effectiveToolCalls.length === 0 && assistantMsg.content) {
        const extracted = extractToolCallsFromText(
          assistantMsg.content,
          tools.map((t) => t.name)
        )
        if (extracted.length > 0) {
          effectiveToolCalls = extracted
          assistantMsg.tool_calls = extracted
          this.log('info', `Extracted ${extracted.length} tool call(s) from model text response.`)
        }
      }

      this.messages.push(assistantMsg)

      if (assistantMsg.content) {
        this.log('thought', assistantMsg.content)
      }

      if (effectiveToolCalls.length === 0) {
        const pendingBeats = this.beats.filter(
          (b) => !b.assets || b.assets.length === 0 || b.assets.every((a) => a.status === 'failed')
        )
        const totalSelected = this.getSelectedAssetCount()
        const allBeatsFulfilled =
          pendingBeats.length === 0 || totalSelected >= this.input.maxTotalDownloads

        if (allBeatsFulfilled) {
          this.log(
            'info',
            'All visual beats have assets selected or queued. Agent workflow complete.'
          )
          break
        }

        if (emptyToolTurnCount < maxEmptyToolNudges) {
          emptyToolTurnCount++
          this.log(
            'info',
            `Model responded with text without calling search tools (${emptyToolTurnCount}/${maxEmptyToolNudges}). Nudging agent to search for pending beats...`
          )
          const pendingSample = pendingBeats
            .slice(0, 4)
            .map((b) => `${b.id} ("${b.visualPrompt.slice(0, 50)}")`)
            .join(', ')
          this.messages.push({
            role: 'user',
            content: `You replied with text, but you did not execute any search tools. You must call search_pexels_photos or search_pexels_videos now to find stock assets for the script beats. There are still ${pendingBeats.length} beats waiting for assets (such as: ${pendingSample}). Call the search tools now.`
          })
          continue
        } else {
          this.log(
            'error',
            `Model "${this.modelId}" did not invoke any tool calls after ${emptyToolTurnCount} nudges. Please ensure your selected model supports tool calling.`
          )
          break
        }
      }

      // Reset nudge counter once tools are executed
      emptyToolTurnCount = 0

      // Handle all tool calls in parallel or sequentially
      for (const tc of effectiveToolCalls) {
        if (this.status !== 'running') {
          this.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify({
              error: `Tool call skipped because agent execution was ${this.status}.`
            })
          })
          continue
        }
        await this.executeToolCall(tc)
      }
    }

    if (iteration >= this.maxIterations) {
      this.hitIterationLimit = true
      this.log('error', `Agent reached maximum iterations limit (${this.maxIterations})`)
    }
  }

  private getSelectedAssetCount(): number {
    return this.beats.flatMap((b) => b.assets || []).filter((a) => a.status !== 'failed').length
  }

  private canUseAssetType(assetType: 'photo' | 'video'): boolean {
    if (this.input.mix === 'photos only') return assetType === 'photo'
    if (this.input.mix === 'videos only') return assetType === 'video'
    return true
  }

  private async waitForDownloadsToSettle(): Promise<void> {
    if (!this.downloader) return

    const openDownloads = this.downloader
      .getTasks()
      .filter((task) => task.status === 'pending' || task.status === 'downloading')

    if (openDownloads.length === 0) return

    this.log('info', `Waiting for ${openDownloads.length} queued downloads to finish...`)
    this.updateProgress('Finishing downloads', Math.max(this.progress, 90))
    await this.downloader.waitForIdle()
  }

  private logPexelsQuotaIfNeeded(): void {
    const quota = PexelsClient.getQuotaSnapshot()
    if (!quota) return

    if (PexelsClient.isQuotaLow()) {
      const resetDate = new Date(quota.resetAt * 1000).toLocaleString()
      this.log(
        'info',
        `Pexels API quota low: ${quota.remaining}/${quota.limit} requests remaining (resets ${resetDate}).`
      )
    }
  }

  private async executeToolCall(tc: NormalizedToolCall): Promise<void> {
    this.log('tool_call', `Executing tool call: ${tc.name}`, tc.arguments)
    let result: unknown = {}

    try {
      const args = JSON.parse(tc.arguments)

      if (tc.name === 'search_pexels_photos') {
        this.logPexelsQuotaIfNeeded()
        if (!this.canUseAssetType('photo')) {
          throw new Error(`Photo search is disabled because asset mix is "${this.input.mix}".`)
        }

        const beat = this.beats.find((b) => b.id === args.beatId)
        if (beat) {
          beat.status = 'searching'
          if (!beat.searchQueries.includes(args.query)) {
            beat.searchQueries.push(args.query)
          }
        }
        this.log('info', `[${args.beatId}] Querying Pexels Photos API for "${args.query}"...`)
        const completedBeatsCount = this.beats.filter((b) => b.status === 'completed').length
        const loopProgressVal = Math.round(30 + (completedBeatsCount / this.beats.length) * 60)
        this.updateProgress(
          `Searching photos for "${args.query}" (${args.beatId.replace('_', ' ')})`,
          loopProgressVal
        )

        const searchRes = await PexelsClient.searchPhotos({
          query: args.query,
          orientation: args.orientation,
          size: args.size,
          color: args.color,
          page: args.page,
          per_page: args.perPage || 15
        })

        // Cache candidates for safety checks
        for (const p of searchRes.photos) {
          const key = `photo_${p.id}`
          this.pexelsCandidates.set(key, {
            pexelsId: p.id,
            type: 'photo',
            photographer: p.photographer || 'Unknown Photographer',
            photographerUrl: p.photographer_url || undefined,
            width: p.width,
            height: p.height,
            imageUrl: p.src.medium || p.src.original,
            query: args.query,
            variants: Object.entries(p.src)
              .map(([label, url]) => ({ label, url: url || '' }))
              .filter(
                (v): v is { label: string; url: string } =>
                  typeof v.url === 'string' && v.url.length > 0
              )
          })
        }

        result = {
          total_results: searchRes.total_results,
          results: searchRes.photos.map((p) => ({
            pexelsId: p.id,
            url: p.url,
            photographer: p.photographer || 'Unknown Photographer',
            photographerUrl: p.photographer_url || undefined,
            width: p.width,
            height: p.height,
            avgColor: p.avg_color || undefined,
            alt: p.alt || undefined,
            previewUrl: p.src.medium || p.src.original,
            downloadableVariants: Object.entries(p.src)
              .map(([label, url]) => ({ label, url: url || '' }))
              .filter(
                (v): v is { label: string; url: string } =>
                  typeof v.url === 'string' && v.url.length > 0
              )
          }))
        }
      } else if (tc.name === 'search_pexels_videos') {
        this.logPexelsQuotaIfNeeded()
        if (!this.canUseAssetType('video')) {
          throw new Error(`Video search is disabled because asset mix is "${this.input.mix}".`)
        }

        const beat = this.beats.find((b) => b.id === args.beatId)
        if (beat) {
          beat.status = 'searching'
          if (!beat.searchQueries.includes(args.query)) {
            beat.searchQueries.push(args.query)
          }
        }
        this.log('info', `[${args.beatId}] Querying Pexels Videos API for "${args.query}"...`)
        const completedBeatsCount = this.beats.filter((b) => b.status === 'completed').length
        const loopProgressVal = Math.round(30 + (completedBeatsCount / this.beats.length) * 60)
        this.updateProgress(
          `Searching videos for "${args.query}" (${args.beatId.replace('_', ' ')})`,
          loopProgressVal
        )

        const searchRes = await PexelsClient.searchVideos({
          query: args.query,
          orientation: args.orientation,
          size: args.size,
          page: args.page,
          per_page: args.perPage || 10
        })

        // Cache candidates for safety checks
        for (const v of searchRes.videos) {
          const key = `video_${v.id}`
          this.pexelsCandidates.set(key, {
            pexelsId: v.id,
            type: 'video',
            photographer: v.user?.name || 'Unknown Creator',
            photographerUrl: v.user?.url || undefined,
            width: v.width,
            height: v.height,
            imageUrl: v.image || '',
            duration: v.duration || 0,
            query: args.query,
            variants: v.video_files.map((vf) => ({
              quality: vf.quality || undefined,
              fileType: vf.file_type || undefined,
              url: vf.link,
              width: vf.width ?? undefined,
              height: vf.height ?? undefined
            }))
          })
        }

        result = {
          total_results: searchRes.total_results,
          results: searchRes.videos.map((v) => ({
            pexelsId: v.id,
            url: v.url,
            userName: v.user?.name || 'Unknown Creator',
            userUrl: v.user?.url || undefined,
            width: v.width,
            height: v.height,
            durationSeconds: v.duration || 0,
            previewImageUrl: v.image || '',
            downloadableVariants: v.video_files.map((vf) => ({
              quality: vf.quality || undefined,
              fileType: vf.file_type || undefined,
              url: vf.link,
              width: vf.width ?? undefined,
              height: vf.height ?? undefined
            }))
          }))
        }
      } else if (tc.name === 'select_assets_for_download') {
        const selections = args.selections || []
        const rejections = args.rejections || []

        const selectionResults: unknown[] = []
        const rejectionResults: unknown[] = []

        const firstBeatId = selections[0]?.beatId || rejections[0]?.beatId || ''
        this.log('info', `Selecting/rejecting assets for ${firstBeatId.replace('_', ' ')}...`)
        const completedBeatsCount = this.beats.filter((b) => b.status === 'completed').length
        const loopProgressVal = Math.round(30 + (completedBeatsCount / this.beats.length) * 60)
        this.updateProgress(
          `Selecting assets for Beat ${firstBeatId.replace('_', ' ')}`,
          loopProgressVal
        )

        // Handle selections
        for (const sel of selections) {
          if (!this.canUseAssetType(sel.assetType)) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Asset type ${sel.assetType} is disabled by asset mix "${this.input.mix}".`
            })
            continue
          }

          const key = `${sel.assetType}_${sel.pexelsId}`
          const candidate = this.pexelsCandidates.get(key)

          if (!candidate) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Security Check Failed: Asset ${sel.pexelsId} (${sel.assetType}) was not found in Pexels search results of this job.`
            })
            continue
          }

          const variantExists = candidate.variants.some((v) => v.url === sel.variantUrl)
          if (!variantExists) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Security Check Failed: URL for asset ${sel.pexelsId} is not a valid Pexels download variant from this job.`
            })
            continue
          }

          try {
            validateDownloadUrl(sel.variantUrl)
          } catch (err) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Security Check Failed: Invalid download URL for asset ${sel.pexelsId}: ${err instanceof Error ? err.message : String(err)}`
            })
            continue
          }

          const beat = this.beats.find((b) => b.id === sel.beatId)
          if (!beat) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Beat ID ${sel.beatId} not found in project beats.`
            })
            continue
          }

          const recordId = `${sel.assetType}_${sel.pexelsId}`
          const existingRecord = beat.assets.find((a) => a.id === recordId)

          if (!existingRecord) {
            const activeBeatAssets = beat.assets.filter((a) => a.status !== 'failed').length
            if (activeBeatAssets >= this.input.maxAssetsPerBeat) {
              selectionResults.push({
                pexelsId: sel.pexelsId,
                status: 'rejected',
                reason: `Beat cap of ${this.input.maxAssetsPerBeat} assets reached.`
              })
              continue
            }

            if (this.getSelectedAssetCount() >= this.input.maxTotalDownloads) {
              selectionResults.push({
                pexelsId: sel.pexelsId,
                status: 'rejected',
                reason: `Total download cap of ${this.input.maxTotalDownloads} assets reached.`
              })
              continue
            }

            const newAsset: AssetRecord = {
              id: recordId,
              pexelsId: sel.pexelsId,
              type: sel.assetType,
              url: sel.variantUrl,
              imageUrl: candidate.imageUrl,
              downloadUrl: sel.variantUrl,
              width: candidate.width,
              height: candidate.height,
              duration: candidate.duration,
              photographer: candidate.photographer,
              photographerUrl: candidate.photographerUrl,
              query: candidate.query,
              status: 'pending'
            }
            beat.assets.push(newAsset)
            this.assetLookup.set(recordId, { asset: newAsset, beat })
            beat.status = 'selecting'
          }

          selectionResults.push({ pexelsId: sel.pexelsId, status: 'selected' })
        }

        // Handle rejections
        for (const rej of rejections) {
          const beat = this.beats.find((b) => b.id === rej.beatId)
          if (beat) {
            if (!beat.rejectedAssets) {
              beat.rejectedAssets = []
            }
            if (
              !beat.rejectedAssets.some(
                (r) => r.pexelsId === rej.pexelsId && r.type === rej.assetType
              )
            ) {
              beat.rejectedAssets.push({
                type: rej.assetType,
                pexelsId: rej.pexelsId,
                reason: rej.reason
              })
            }
          }
          rejectionResults.push({ pexelsId: rej.pexelsId, status: 'rejected' })
        }

        await this.writeManifest()
        this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })

        const settings = await SettingsStore.getSettings()

        if (settings.requireApprovalBeforeDownload && selections.length > 0) {
          this.status = 'paused'
          this.log('info', `Awaiting user approval for ${selections.length} selected assets.`)

          result = {
            status: 'awaiting_user_approval',
            message:
              'Assets selected. Pausing execution for user approval. Please approve from UI.',
            selections: selectionResults,
            rejections: rejectionResults
          }

          if (this.abortController) {
            this.abortController.abort()
          }
        } else {
          result = {
            status: 'selected',
            message: 'Assets processed successfully.',
            selections: selectionResults,
            rejections: rejectionResults
          }
        }
      } else if (tc.name === 'download_selected_assets') {
        const assetIds = args.assetIds || []
        const downloaded: unknown[] = []
        const failed: unknown[] = []

        this.log('info', `Queuing ${assetIds.length} assets for local download...`)
        this.updateProgress(`Queuing assets for download...`, this.progress)

        const settings = await SettingsStore.getSettings()

        for (const assetRef of assetIds) {
          if (!this.canUseAssetType(assetRef.assetType)) {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Asset type ${assetRef.assetType} is disabled by asset mix "${this.input.mix}".`,
              retryable: false
            })
            continue
          }

          let assetRecord: AssetRecord | undefined
          let parentBeat: VisualBeat | undefined

          for (const b of this.beats) {
            const record = b.assets.find(
              (a) => a.pexelsId === assetRef.pexelsId && a.type === assetRef.assetType
            )
            if (record) {
              assetRecord = record
              parentBeat = b
              break
            }
          }

          if (!assetRecord || !parentBeat) {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Asset was not selected first. Call select_assets_for_download.`,
              retryable: false
            })
            continue
          }

          if (settings.requireApprovalBeforeDownload && assetRecord.status === 'pending') {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Asset requires user approval before downloading.`,
              retryable: false
            })
            continue
          }

          if (assetRecord.status === 'completed' || assetRecord.status === 'downloading') {
            downloaded.push({
              assetType: assetRecord.type,
              pexelsId: assetRecord.pexelsId,
              status: assetRecord.status
            })
            continue
          }

          const queuedOrCompletedCount = this.beats
            .flatMap((b) => b.assets || [])
            .filter((a) => a.status === 'completed' || a.status === 'downloading').length
          if (queuedOrCompletedCount >= this.input.maxTotalDownloads) {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Max total downloads cap of ${this.input.maxTotalDownloads} reached.`,
              retryable: false
            })
            continue
          }

          assetRecord.status = 'downloading'
          parentBeat.status = 'downloading'

          this.downloader.enqueue(
            assetRecord.pexelsId,
            assetRecord.type,
            assetRecord.downloadUrl,
            assetRecord.width,
            assetRecord.height,
            assetRecord.query,
            this.projectDir
          )

          downloaded.push({
            assetType: assetRecord.type,
            pexelsId: assetRecord.pexelsId,
            status: 'queued'
          })
        }

        result = {
          downloaded,
          failed
        }
      }
    } catch (error) {
      const errMsg =
        error instanceof ApiError
          ? `${error.message}${error.isRetryable ? ' (retryable)' : ''}`
          : error instanceof Error
            ? error.message
            : String(error)
      this.log('error', `Tool execution ${tc.name} failed: ${errMsg}`)
      result = {
        error: errMsg,
        retryable: error instanceof ApiError ? error.isRetryable : false
      }
    }

    this.log('tool_result', `Result for ${tc.name}`, result)
    this.messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name: tc.name,
      content: JSON.stringify(result)
    })
  }

  public async approveAndResume(decision: ApprovalDecision = {}): Promise<void> {
    if (this.status !== 'paused') return

    if (this.activePromise) {
      try {
        await this.activePromise
      } catch {
        // Ignore abort-driven rejections while shutting down the prior run.
      }
    }

    // Find all pending assets in beats
    const pendingAssets: { asset: AssetRecord; beat: VisualBeat }[] = []
    for (const beat of this.beats) {
      for (const asset of beat.assets) {
        if (asset.status === 'pending') {
          pendingAssets.push({ asset, beat })
        }
      }
    }

    const approvedSet = decision.approvedAssetIds
      ? new Set(decision.approvedAssetIds)
      : new Set(pendingAssets.map(({ asset }) => asset.id))
    const rejectedSet = new Set(decision.rejectedAssetIds || [])

    for (const { asset, beat } of pendingAssets) {
      if (!rejectedSet.has(asset.id)) continue

      asset.status = 'failed'
      asset.error = 'Rejected by user'
      if (!beat.rejectedAssets) {
        beat.rejectedAssets = []
      }
      if (
        !beat.rejectedAssets.some((r) => r.type === asset.type && r.pexelsId === asset.pexelsId)
      ) {
        beat.rejectedAssets.push({
          type: asset.type,
          pexelsId: asset.pexelsId,
          reason: 'Rejected by user'
        })
      }
    }

    const approvedPendingAssets = pendingAssets.filter(
      ({ asset }) => approvedSet.has(asset.id) && !rejectedSet.has(asset.id)
    )

    const task = async (): Promise<void> => {
      if (approvedPendingAssets.length === 0) {
        this.status = 'running'
        if (rejectedSet.size > 0) {
          this.log('info', `User rejected ${rejectedSet.size} pending assets. Resuming agent loop.`)
          this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
          await this.writeManifest()
        }
      } else {
        this.log(
          'info',
          `User approved ${approvedPendingAssets.length} assets${
            rejectedSet.size > 0 ? ` and rejected ${rejectedSet.size}` : ''
          }. Starting downloads.`
        )

        // Start downloads and mark them as downloading
        for (const { asset, beat } of approvedPendingAssets) {
          asset.status = 'downloading'
          beat.status = 'downloading'

          this.downloader.enqueue(
            asset.pexelsId,
            asset.type,
            asset.downloadUrl,
            asset.width,
            asset.height,
            asset.query,
            this.projectDir
          )
        }

        this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })

        this.messages.push({
          role: 'user',
          content: `User has approved the selections: ${approvedPendingAssets.map((p) => `${p.asset.type} ${p.asset.pexelsId}`).join(', ')}.${
            rejectedSet.size > 0 ? ` User rejected: ${Array.from(rejectedSet).join(', ')}.` : ''
          } The approved downloads are now in progress.`
        })

        this.status = 'running'
      }

      try {
        await this.runAgentLoop()
      } catch (loopErr) {
        const errMsg = loopErr instanceof Error ? loopErr.message : String(loopErr)
        this.log('error', `Agent loop encountered an error: ${errMsg}`)
      }

      if (this.status === 'running') {
        await this.waitForDownloadsToSettle()
      }

      if (this.status === 'running') {
        this.finalizeSuccessfulRun()
      }
    }

    this.activePromise = this.runBackground(task)
    await this.activePromise
  }

  private handleDownloadProgress(task: DownloadTask): void {
    const lookupKey = `${task.type}_${task.assetId}`
    let lookup = this.assetLookup.get(lookupKey)

    if (!lookup) {
      for (const b of this.beats) {
        const record = b.assets.find((a) => a.pexelsId === task.assetId && a.type === task.type)
        if (record) {
          lookup = { asset: record, beat: b }
          this.assetLookup.set(lookupKey, lookup)
          break
        }
      }
    }

    if (!lookup) return
    const { asset: assetRecord, beat: parentBeat } = lookup
    const prevStatus = assetRecord.status

    // Backoff leaves the queue task as pending; the download is still in flight.
    // Keep the asset "downloading" so the agent will not enqueue a duplicate.
    if (task.backingOff && (task.status === 'pending' || task.status === 'downloading')) {
      assetRecord.status = 'downloading'
    } else {
      assetRecord.status = task.status
    }
    assetRecord.progress = task.progress

    const statusChanged = assetRecord.status !== prevStatus

    // Log download transitions
    if (prevStatus === 'pending' && task.status === 'downloading') {
      this.log(
        'info',
        `[Download] Started downloading ${task.type} ${task.assetId} for ${parentBeat.id.replace('_', ' ')}...`
      )
    }

    if (task.url) {
      assetRecord.downloadUrl = task.url
      assetRecord.url = task.url
    }

    if (task.error && prevStatus !== 'failed') {
      assetRecord.error = task.error
      this.log('error', `[Download] Failed to download ${task.type} ${task.assetId}: ${task.error}`)
    }

    if (task.filePath && prevStatus !== 'completed') {
      assetRecord.filePath = task.filePath
      this.log(
        'info',
        `[Download] Successfully downloaded ${task.type} ${task.assetId} for ${parentBeat.id.replace('_', ' ')}.`
      )
    }

    // Reevaluate beat status on state change or task finish
    if (statusChanged) {
      const allDone = parentBeat.assets.every((a) => a.status === 'completed')
      const anyFailed = parentBeat.assets.some((a) => a.status === 'failed')
      const anyDownloading = parentBeat.assets.some(
        (a) => a.status === 'downloading' || a.status === 'pending'
      )

      if (allDone && parentBeat.status !== 'completed') {
        parentBeat.status = 'completed'
        this.log(
          'info',
          `[Beat Complete] All selected assets downloaded for ${parentBeat.id.replace('_', ' ')}.`
        )
      } else if (anyDownloading) {
        parentBeat.status = 'downloading'
      } else if (anyFailed) {
        parentBeat.status = 'failed'
      }

      // Fast count recalculation
      let downloaded = 0
      let failed = 0
      for (const b of this.beats) {
        if (b.assets) {
          for (const a of b.assets) {
            if (a.status === 'completed') downloaded++
            else if (a.status === 'failed') failed++
          }
        }
      }
      this.downloadedCount = downloaded
      this.failedCount = failed

      // Check if the entire job has finished all downloads!
      const allBeatsDone =
        this.beats.length > 0 &&
        this.beats.every(
          (b) =>
            b.status === 'completed' &&
            (b.assets || []).length > 0 &&
            b.assets.every((a) => a.status === 'completed')
        )
      const hasInFlightDownloads = this.downloader
        ?.getTasks()
        .some((t) => t.status === 'pending' || t.status === 'downloading')

      if (
        allBeatsDone &&
        !hasInFlightDownloads &&
        this.status !== 'cancelled' &&
        this.status !== 'paused'
      ) {
        if (this.status !== 'completed') {
          this.status = 'completed'
          this.currentStep = 'Finished'
          this.progress = 100
          this.saveRegistry().catch((err) =>
            console.error('Failed to save registry on job complete:', err)
          )
        }
      }

      // Write manifest update immediately on state changes
      this.writeManifest(true).catch((err) =>
        console.error('Failed to write manifest on state transition:', err)
      )

      // Broadcast update
      this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
      this.emit('event', { jobId: this.jobId, type: 'snapshot', data: this.getSnapshot() })
    } else {
      // Progress-only update (e.g. 34% -> 35%): throttled manifest update
      this.writeManifest(false).catch((err) =>
        console.error('Failed to write throttled manifest on progress update:', err)
      )
      this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
    }
  }

  private async refreshDownloadUrl(
    type: 'photo' | 'video',
    assetId: number,
    currentUrl: string
  ): Promise<string> {
    this.log('info', `Refreshing expired download URL for ${type} ${assetId}...`)
    try {
      if (type === 'photo') {
        const photo = await PexelsClient.getPhoto(assetId)
        const oldUrlObj = new URL(currentUrl)
        const params = oldUrlObj.search
        const newBaseUrl = photo.src.original
        const newUrlObj = new URL(newBaseUrl)
        newUrlObj.search = params
        const freshUrl = newUrlObj.toString()
        validateDownloadUrl(freshUrl)
        this.log('info', `Successfully refreshed photo URL: ${freshUrl}`)
        return freshUrl
      } else {
        const video = await PexelsClient.getVideo(assetId)
        const oldUrlObj = new URL(currentUrl)
        const oldWidth = oldUrlObj.searchParams.get('w') || ''
        const oldHeight = oldUrlObj.searchParams.get('h') || ''

        let matchedFile = video.video_files.find(
          (f) =>
            f.link.includes(currentUrl.split('?')[0]) ||
            (f.width && String(f.width) === oldWidth && f.height && String(f.height) === oldHeight)
        )

        if (!matchedFile) {
          matchedFile =
            video.video_files.find((f) => f.quality === 'hd') ||
            video.video_files.find((f) => f.quality === 'sd') ||
            video.video_files[0]
        }

        const freshUrl = matchedFile?.link || ''
        if (freshUrl) {
          validateDownloadUrl(freshUrl)
          this.log('info', `Successfully refreshed video URL: ${freshUrl}`)
          return freshUrl
        }
        throw new Error('No matching video files found in Pexels details')
      }
    } catch (err) {
      this.log(
        'error',
        `Failed to refresh download URL for ${type} ${assetId}: ${err instanceof Error ? err.message : String(err)}`
      )
      throw err
    }
  }
}
