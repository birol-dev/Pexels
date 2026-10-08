import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  LlmProviderFactory,
  type AgentMessage,
  type LlmToolTurnResult,
  type NormalizedToolCall,
  LLM_AGENT_REASONING,
  LLM_AGENT_TURN_MAX_OUTPUT_TOKENS,
  LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
  LLM_STRUCTURED_REASONING
} from '../llm/llm-provider.ts'
import { PexelsClient } from '../pexels/pexels-client.ts'
import { PexelsDownloader, type DownloadTask } from '../pexels/pexels-downloader.ts'
import { validateDownloadUrl } from '../pexels/download-url-validation.ts'
import { chooseVariant, type Variant } from '../pexels/choose-variant.ts'
import { variantDimensions } from '../pexels/variant-dimensions.ts'
import {
  candidateKey,
  photoCandidate,
  videoCandidate,
  type PexelsCandidate
} from '../pexels/candidates.ts'
import type {
  PexelsPhoto,
  PexelsPhotoSearchInput,
  PexelsPhotoSearchResult,
  PexelsVideo,
  PexelsVideoSearchInput,
  PexelsVideoSearchResult
} from '../pexels/pexels-types.ts'
import { buildManifestAttribution } from '../pexels/pexels-attribution.ts'
import type { BeatAssetType } from '../llm/beat-parse-tool.ts'
import { expandIdeaToScript } from '../llm/idea-expander.ts'
import type { StructuredRequest } from '../llm/structured-request.ts'
import { planBeats } from '../pipeline/plan-beats.ts'
import {
  initialPipelineState,
  type PipelineBeat,
  type PipelineContext,
  type PipelineState,
  type SelectOutcome
} from '../pipeline/context.ts'
import { hasPicksToMake, runPipeline } from '../pipeline/run-pipeline.ts'
import { summarizePipelineRun } from '../pipeline/summary.ts'
import {
  MIN_LLM_REQUEST_TIMEOUT_SECONDS,
  resolveLlmRequestTimeoutSeconds
} from '../llm/llm-timeout.ts'
import { ApiError } from '../http/api-errors.ts'
import { createTimeoutLinkedSignal } from '../http/abort-signal.ts'
import { ManifestWriter, type ManifestData, parseTokenUsage } from '../files/manifest-writer.ts'
import { ProjectStore, type JobSummary } from '../storage/project-store.ts'
import { SecureSecrets } from '../storage/secure-secrets.ts'
import { SettingsStore } from '../storage/settings-store.ts'
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_MODEL_IDS,
  type LlmProviderId
} from '../../../shared/llm-defaults.ts'
import { extractToolCallsFromText } from './tool-parser.ts'
import { compactForRequest } from './message-compaction.ts'
import { tailLogEntries } from './log-tail.ts'
import { photoResultForModel, shapeForPlatform, videoResultForModel } from './tool-results.ts'
import {
  EXPLICIT_QUERY_BLOCKED_MESSAGE,
  applySafetyFilters,
  isQueryBlocked,
  safetyFilterReport
} from './content-filters.ts'
import {
  loadAgentConversationState,
  persistAgentConversationState,
  readSavedAgentState,
  shouldEmbedConversationInManifest
} from './agent-state.ts'
import {
  AGENT_TOOLS,
  SearchPexelsPhotosArgsSchema,
  SearchPexelsVideosArgsSchema,
  SelectAssetsForDownloadArgsSchema,
  DownloadSelectedAssetsArgsSchema,
  areBeatsSatisfiedForLoop,
  assetsNeededPerBeat,
  beatUsingAsset,
  countPendingAssets,
  countQueuedOrCompleted,
  decideRunFinalize,
  DEFAULT_REJECTION_REASON,
  describeToolFailure,
  isAssetRejectedByUser,
  releaseDuplicateAssetRecords,
  remainingIterations,
  selectionBudgetViolation,
  statusAfterInterruptedSearch,
  statusDuringSearch,
  summarizeToolResultForLog,
  getUnfulfilledBeats,
  hasPendingUnqueuedAssets,
  USER_REJECTION_REASON
} from './tool-schemas.ts'
import { runLoopThenFinalize } from './run-tail.ts'
import {
  missingCurrentKeyMessage,
  missingPinnedKeyMessage,
  pinRuntimeSettings,
  resolveRuntimeSettings,
  type AgentEngine,
  type JobRuntimeSettings
} from './job-settings.ts'
import {
  canTransition,
  savedStatusReason,
  type JobStatus,
  type StatusReason
} from './job-status.ts'
import { createTrailingThrottle } from './progress-throttle.ts'
import { removeStaleDownloadTemps } from '../files/temp-cleanup.ts'
import { isPathInside } from '../files/path-safety.ts'
import { moveFileToTrash } from '../files/trash-file.ts'
import {
  DEFAULT_SEARCH_MODE,
  buildBroadSearchNudgeMessage,
  buildStockScoutSystemPrompt,
  messagesWithCacheStablePrefix,
  shouldInjectPostToolBroadNudge,
  type SearchMode
} from './search-mode.ts'

export interface VisualBeat {
  id: string
  text: string
  visualPrompt: string
  /** Queries the beat split suggested, most specific first. Jobs from before it did so have none. */
  queries?: string[]
  /** The type of footage the beat split asked for. Jobs from before it did so have none. */
  assetType?: BeatAssetType
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
  status: JobStatus
  /** Why the job has this status. The Run screen shows it for a paused job. */
  statusReason?: StatusReason
  /** The model and limits the job runs with. They are fixed when the job is created. */
  runtimeSettings?: JobRuntimeSettings
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
    cachedInputTokens?: number
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
  searchMode?: SearchMode
}

export class AgentRunner extends EventEmitter {
  private static activeRunners = new Map<string, AgentRunner>()

  public static getActive(jobId: string): AgentRunner | undefined {
    return this.activeRunners.get(jobId)
  }

  /**
   * Quit path: pause every running job and persist its state so it is resumable
   * next launch instead of being left as a stale `running` job. In-flight
   * downloads are not awaited (a large video could stall quit); their assets are
   * saved as `downloading` and reset to pending on resume. Bounded by `timeoutMs`.
   */
  public static async pauseAll(timeoutMs = 5000): Promise<void> {
    const running = [...this.activeRunners.values()].filter((r) => r.status === 'running')
    await Promise.all(
      running.map(async (runner) => {
        await runner.pause('app_quit')
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        })
        await Promise.race([runner.activePromise?.catch(() => undefined), timeout])
        clearTimeout(timer)
        await runner.persistSnapshot()
      })
    )
  }

  private jobId: string
  private input: StartJobInput
  // Changed only by setStatus (and by restoring a saved job in initializeAndLoadState).
  private status: JobStatus = 'running'
  private statusReason: StatusReason = 'started'
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
    totalTokens: 0,
    cachedInputTokens: 0
  }

  private downloader!: PexelsDownloader
  private abortController: AbortController | null = null
  private activePromise: Promise<void> | null = null
  private runGeneration = 0
  private projectDir = ''
  private createdAt = new Date().toISOString()
  private hitIterationLimit = false
  // Set by a select call under approval mode; the loop pauses once the whole turn is processed.
  private approvalRequested = false
  private iterationsUsed = 0
  // Message index before which large tool results are sent as digests. Only moves when a
  // request would cross the context budget, so the prefix of later requests stays identical.
  private compactedBefore = 0
  // Where a pipeline job stopped. A loop job has none.
  private pipelineState: PipelineState | null = null
  // What the last finished pipeline run did, as written by code. Kept in the manifest.
  private pipelineSummary: string | undefined
  private loopError: string | null = null
  private modelId = DEFAULT_MODEL_IDS[DEFAULT_LLM_PROVIDER]
  private providerId: LlmProviderId = DEFAULT_LLM_PROVIDER
  private maxIterations = 30
  // The job's settings, fixed when it is created and kept in agent-state.json. The fields below
  // come from it (applyPin), so a Settings change cannot alter a job, mid-run or on resume.
  private pin: JobRuntimeSettings | null = null
  private requireApproval = false
  private requestTimeoutSeconds = 60
  private llmRequestTimeoutSeconds = MIN_LLM_REQUEST_TIMEOUT_SECONDS
  private safetySettings = {
    skipExplicit: true,
    avoidPeople: false
  }

  private pexelsCandidates = new Map<string, PexelsCandidate>()
  private agentStateFileTrusted = false
  private persistAgentStateEnabled = true

  private assetLookup = new Map<string, { asset: AssetRecord; beat: VisualBeat }>()

  // Download progress ticks once per percent per file. Coalesce the full-beats
  // broadcast and manifest rebuild they trigger instead of doing both every tick.
  private progressFlush = createTrailingThrottle(() => {
    this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
    this.writeManifest(false).catch((err) =>
      console.error('Failed to write throttled manifest on progress update:', err)
    )
  }, 250)

  private async persistSnapshot(): Promise<void> {
    await this.saveRegistry()
    await this.writeAgentState()
    await this.writeManifest(true)
  }

  private recountAssets(): void {
    let downloaded = 0
    let failed = 0
    for (const b of this.beats) {
      for (const a of b.assets || []) {
        if (a.status === 'completed') downloaded++
        else if (a.status === 'failed') failed++
      }
    }
    this.downloadedCount = downloaded
    this.failedCount = failed
  }

  /**
   * The live record for an asset id. The lookup map is filled lazily, so it can miss records
   * loaded from the manifest; a released duplicate (failed) never shadows the live one.
   */
  private findAssetRecord(assetId: string): AssetRecord | undefined {
    let found: AssetRecord | undefined
    for (const b of this.beats) {
      for (const a of b.assets || []) {
        if (a.id !== assetId) continue
        if (!found || (found.status === 'failed' && a.status !== 'failed')) found = a
      }
    }
    return found
  }

  private rebuildAssetLookup(): void {
    this.assetLookup.clear()
    for (const b of this.beats) {
      if (b.assets) {
        for (const a of b.assets) {
          // A failed copy must never shadow the live record with the same id.
          const existing = this.assetLookup.get(a.id)
          if (existing && existing.asset.status !== 'failed' && a.status === 'failed') continue
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

  private async applyRuntimeSettings(): Promise<
    Awaited<ReturnType<typeof SettingsStore.getSettings>>
  > {
    const settings = await SettingsStore.getSettings()
    // A new job takes today's settings once. A loaded job already has its own (see
    // initializeAndLoadState). Download concurrency and keys are machine settings, read every time.
    this.pin ??= pinRuntimeSettings(settings)
    this.applyPin(this.pin)
    if (!this.downloader) {
      this.downloader = new PexelsDownloader(
        settings.maxConcurrentDownloads,
        (task) => {
          this.handleDownloadProgress(task)
        },
        this.requestTimeoutSeconds,
        (type, assetId, currentUrl) => this.refreshDownloadUrl(type, assetId, currentUrl)
      )
    }
    return settings
  }

  private applyPin(pin: JobRuntimeSettings): void {
    this.modelId = pin.modelId
    this.providerId = pin.providerId
    this.maxIterations = pin.maxIterations
    this.requireApproval = pin.requireApproval
    this.requestTimeoutSeconds = pin.requestTimeoutSeconds
    this.llmRequestTimeoutSeconds = resolveLlmRequestTimeoutSeconds(pin.requestTimeoutSeconds)
    this.safetySettings = { skipExplicit: pin.skipExplicit, avoidPeople: pin.avoidPeople }
  }

  /** The engine the job runs on: fixed when the job was created, like the rest of its settings. */
  private get engine(): AgentEngine {
    return this.pin?.engine ?? 'loop'
  }

  /** A resume the missing key would only fail again is refused, and the job stays paused. */
  private async requireProviderKey(settings: JobRuntimeSettings, message: string): Promise<void> {
    if (!(await SecureSecrets.getSecret(`${settings.providerId}Key`))) throw new Error(message)
  }

  public async ensureRegistered(): Promise<void> {
    AgentRunner.activeRunners.set(this.jobId, this)
    const settings = await this.applyRuntimeSettings()
    if (!this.projectDir) {
      this.projectDir = await this.resolveProjectDirectory(settings.downloadFolder)
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
      // The run broke outside the agent loop (a missing key, a failed beat split). Pause and
      // cancel abort on purpose, and a job that already ended stays as it ended.
      if (this.status === 'running') {
        this.loopError = error instanceof Error ? error.message : String(error)
        this.finalizeRun()
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
      // The snapshot below supersedes any pending progress broadcast.
      this.progressFlush.cancel()
      if (this.projectDir) {
        await ManifestWriter.flushPendingWrites(this.projectDir)
      }
      await this.persistSnapshot()
      this.emitSnapshot()
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
    // A pending progress write would recreate the project folder after delete.
    this.progressFlush.cancel()
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

  /** The key of the job's provider. A run that has none cannot start. */
  private async requireApiKey(): Promise<string> {
    const apiKey = await SecureSecrets.getSecret(`${this.providerId}Key`)
    if (!apiKey) throw new Error(`Missing API Key for LLM provider: ${this.providerId}`)
    return apiKey
  }

  /** Adds the tokens of one request to the job's total. */
  private addUsage(usage: LlmToolTurnResult['usage']): void {
    if (!usage) return
    this.usage.inputTokens += usage.inputTokens || 0
    this.usage.outputTokens += usage.outputTokens || 0
    this.usage.totalTokens += usage.totalTokens || 0
    this.usage.cachedInputTokens += usage.cachedInputTokens || 0
  }

  /**
   * One request that makes the model call one tool: the job's provider and model, the job's
   * timeout, its tokens counted, and a tool call written as text accepted when the model sent
   * none. A request with no tool call at all throws. The provider adds the request quirks it has
   * learned for the model and waits for its rate limit slot.
   */
  private async callStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const apiKey = await this.requireApiKey()
    const provider = LlmProviderFactory.getProvider(this.providerId)

    const response = await this.executeWithTimeout(this.llmRequestTimeoutSeconds, (signal) =>
      provider.createToolTurn(
        {
          model: this.modelId,
          systemPrompt: request.systemPrompt,
          messages: [{ role: 'user', content: request.userContent }],
          tools: [request.tool],
          toolChoice: { name: request.tool.name },
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: LLM_STRUCTURED_MAX_OUTPUT_TOKENS,
          abortSignal: signal,
          sessionId: `stockfinder:${this.jobId}`,
          reasoning: LLM_STRUCTURED_REASONING
        },
        { apiKey }
      )
    )

    this.addUsage(response.usage)
    if (request.label && response.usage) {
      // One line per request, as the agent loop writes one per turn.
      const tokens = {
        request: request.label,
        inputTokens: response.usage.inputTokens || 0,
        cachedInputTokens: response.usage.cachedInputTokens || 0,
        outputTokens: response.usage.outputTokens || 0
      }
      this.log(
        'info',
        `${request.label}: ${tokens.inputTokens.toLocaleString('en-US')} input tokens (${tokens.cachedInputTokens.toLocaleString('en-US')} cached), ${tokens.outputTokens.toLocaleString('en-US')} output.`,
        tokens
      )
    }

    const isThisTool = (call: NormalizedToolCall): boolean => call.name === request.tool.name
    let toolCall = response.toolCalls.find(isThisTool)
    if (!toolCall && response.assistantMessage.content) {
      toolCall = extractToolCallsFromText(response.assistantMessage.content, [
        request.tool.name
      ]).find(isThisTool)
    }
    if (!toolCall) {
      this.log(
        'error',
        `Model did not call ${request.tool.name} (stop=${response.stopReason}, output=${response.usage?.outputTokens ?? '?'}, reasoning=${response.usage?.reasoningTokens ?? '?'}). Raw content: ${response.assistantMessage.content || ''}`
      )
      throw (
        request.missingCallError?.(response) ??
        new Error(`The model did not call ${request.tool.name}.`)
      )
    }
    return request.parse(toolCall.arguments)
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
      statusReason: this.statusReason,
      runtimeSettings: this.pin ?? undefined,
      progress: this.progress,
      currentStep: this.currentStep,
      beats: this.beats,
      logs: this.logs,
      downloadedCount: this.downloadedCount,
      failedCount: this.failedCount,
      usage: this.usage
    }
  }

  /**
   * Snapshot events omit `logs`: every entry already went out as its own 'log'
   * event, and tool results make the array megabytes on long runs. `jobs:get`
   * still returns the full snapshot.
   */
  private emitSnapshot(): void {
    const snapshot: Partial<JobSnapshot> = this.getSnapshot()
    delete snapshot.logs
    this.emit('event', { jobId: this.jobId, type: 'snapshot', data: snapshot })
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
    const current = await SettingsStore.getSettings()
    this.projectDir = await this.resolveProjectDirectory(current.downloadFolder)
    // A fresh runner means the previous process is gone, so no download can be
    // writing these partials. (A paused runner that is still in memory skips this.)
    let removedPartials = 0
    try {
      removedPartials = await removeStaleDownloadTemps(this.projectDir)
    } catch (err) {
      console.warn('Failed to clean stale download partials:', err)
    }
    // Restoring is not a transition: the saved job is paused whatever it was doing when the
    // last session ended. (Plan 01 lets only paused jobs get a runner here.) It keeps the
    // reason it was paused for; a job that was cut off while running reads as restored.
    // This comes before the load, which writes the state file back with this reason.
    const saved = await readSavedAgentState(this.projectDir)
    this.status = 'paused'
    this.statusReason = savedStatusReason('paused', saved.statusReason) ?? 'restored'
    // The job goes on with what it was started with. One from before settings were pinned keeps
    // the provider and model its manifest names, and takes the rest from the current settings.
    this.pin = resolveRuntimeSettings(
      saved.runtimeSettings,
      await this.readManifestSettingsSnapshot(),
      current
    )
    await this.applyRuntimeSettings()
    await this.loadStateFromManifest()
    if (removedPartials > 0) {
      this.log('info', `Removed ${removedPartials} partial download(s) left by an interrupted run.`)
    }
  }

  private async readManifestSettingsSnapshot(): Promise<
    { provider?: unknown; modelId?: unknown } | undefined
  > {
    try {
      const manifest = JSON.parse(
        await fs.readFile(join(this.projectDir, 'manifest.json'), 'utf-8')
      )
      const snapshot = manifest?.settingsSnapshot
      return snapshot && typeof snapshot === 'object' ? snapshot : undefined
    } catch {
      return undefined
    }
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
      // Carry earlier spend forward so a resumed job reports its total, not just this run.
      const savedUsage = parseTokenUsage(manifest.usage)
      if (savedUsage) {
        this.usage = { ...savedUsage, cachedInputTokens: savedUsage.cachedInputTokens ?? 0 }
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
        for (const released of releaseDuplicateAssetRecords(this.beats)) {
          this.log(
            'info',
            `Released ${released.recordId} from ${released.releasedFrom}: it is already used for ${released.keptIn}. The beat will get different footage.`
          )
        }
      }

      await this.loadAgentState(manifest)
      await this.writeAgentState()

      // Load logs
      try {
        const logsPath = join(this.projectDir, 'agent-log.jsonl')
        const logData = await fs.readFile(logsPath, 'utf-8')
        if (logData.trim()) this.logs = tailLogEntries(logData.split('\n'))
      } catch (logErr) {
        console.warn('Failed to load logs from agent-log.jsonl:', logErr)
      }

      // Update metrics
      this.recountAssets()
      this.rebuildAssetLookup()
    } catch {
      // Manifest doesn't exist yet, which is normal for new runs
    }
  }

  /**
   * Conversation state (messages + Pexels candidate index) is persisted to a
   * dedicated file so it is not rewritten with manifest.json on every download
   * progress tick, which would serialize megabytes on a hot path.
   */
  private async loadAgentState(manifest: Record<string, unknown>): Promise<void> {
    if (!this.projectDir) return

    const loaded = await loadAgentConversationState(this.projectDir, manifest)
    this.persistAgentStateEnabled = loaded.persistToAgentStateFile
    this.agentStateFileTrusted = loaded.source === 'agent-state'

    if (Array.isArray(loaded.messages)) {
      this.messages = loaded.messages as AgentMessage[]
    }
    if (Array.isArray(loaded.pexelsCandidates)) {
      this.pexelsCandidates = new Map(loaded.pexelsCandidates as Array<[string, PexelsCandidate]>)
    }
    this.iterationsUsed = loaded.iterationsUsed
    this.compactedBefore = loaded.compactedBefore
    this.pipelineState = loaded.pipelineState ?? null
  }

  private async writeAgentState(): Promise<boolean> {
    if (!this.projectDir || !this.persistAgentStateEnabled) return false
    try {
      await persistAgentConversationState(
        this.projectDir,
        this.messages,
        Array.from(this.pexelsCandidates.entries()),
        this.iterationsUsed,
        this.compactedBefore,
        this.statusReason,
        this.pin ?? undefined,
        this.pipelineState ?? undefined
      )
      this.agentStateFileTrusted = true
      return true
    } catch (err) {
      console.error('Failed to write agent state file:', err)
      return false
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

  /**
   * The only place `this.status` changes, apart from restoring a saved job. Returns false
   * when the change isn't allowed, so a job that ended can never be revived by a late
   * call. Asking for the status the job already has changes nothing, reason included.
   */
  private setStatus(to: JobStatus, reason: StatusReason): boolean {
    if (to === this.status) return true
    if (!canTransition(this.status, to)) {
      console.warn(`[${this.jobId}] Ignored status change ${this.status} -> ${to} (${reason})`)
      return false
    }
    this.status = to
    this.statusReason = reason
    return true
  }

  /** The only place a run is declared finished, whether it succeeded or failed. */
  private finalizeRun(): void {
    const decision = decideRunFinalize({
      beats: this.beats,
      hitIterationLimit: this.hitIterationLimit,
      maxTotalDownloads: this.input.maxTotalDownloads,
      maxIterations: this.maxIterations,
      loopError: this.loopError ?? undefined
    })
    if (!this.setStatus(decision.status, decision.status === 'completed' ? 'finished' : 'error')) {
      return
    }
    this.log(decision.logType, decision.logMessage)
    this.updateProgress(decision.progressLabel, 100)
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
      if (!this.setStatus('running', 'started')) return
      this.requeuePendingDownloads()
      await this.saveRegistry()

      await this.expandIdeaIfNeeded()
      await this.parseScriptIntoBeats()
      await this.runLoopAndFinalize()
    }

    this.activePromise = this.runBackground(task)
    await this.activePromise
  }

  /** Loop + settle downloads + finalize; shared by start() and approveAndResume(). */
  private async runLoopAndFinalize(): Promise<void> {
    this.loopError = null
    await runLoopThenFinalize({
      getStatus: () => this.status,
      runLoop: () => (this.engine === 'pipeline' ? this.runPipelineEngine() : this.runAgentLoop()),
      onLoopError: (message) => {
        this.loopError = message
        this.log(
          'error',
          `${this.engine === 'pipeline' ? 'Pipeline' : 'Agent loop'} encountered an error: ${message}`
        )
      },
      settleDownloads: () => this.waitForDownloadsToSettle(),
      finalize: () => {
        this.finalizeRun()
        if (this.engine === 'pipeline') this.recordPipelineSummary()
      }
    })
  }

  public async pause(reason: 'user_paused' | 'app_quit' = 'user_paused'): Promise<void> {
    if (this.status !== 'running' || !this.setStatus('paused', reason)) return
    this.log(
      'info',
      reason === 'app_quit'
        ? 'Agent run paused because the app is closing'
        : 'Agent run paused by user'
    )
    if (this.abortController) {
      this.abortController.abort()
    }
    if (!this.activePromise) {
      await this.saveRegistry()
      await this.writeAgentState()
      await this.writeManifest()
    }
    this.emitSnapshot()
  }

  /**
   * Resumes with the job's own settings. `useCurrentSettings` pins the job to today's settings
   * instead and starts a new conversation. A resume that cannot work throws, and the job stays
   * paused.
   */
  public async resume(options: { useCurrentSettings?: boolean } = {}): Promise<void> {
    if (this.status !== 'paused') return
    let next: JobRuntimeSettings | null = null
    if (options.useCurrentSettings) {
      next = pinRuntimeSettings(await SettingsStore.getSettings())
      await this.requireProviderKey(next, missingCurrentKeyMessage(next))
    } else if (this.pin) {
      await this.requireProviderKey(this.pin, missingPinnedKeyMessage(this.pin))
    }
    // Wait for the aborted run's finally to finish before starting another.
    if (this.activePromise) {
      try {
        await this.activePromise
      } catch {
        // Ignore abort-driven rejections while shutting down the prior run.
      }
    }
    // The job may have been cancelled while the paused run wound down.
    if (this.status !== 'paused') return
    if (next) this.repin(next)
    // Approval pauses leave pending assets that download_selected_assets will refuse.
    // Route through approveAndResume (default: approve all pending) so downloads start.
    if (this.requireApproval && hasPendingUnqueuedAssets(this.beats)) {
      await this.approveAndResume({})
      return
    }
    // Clicking Resume asks for more work, so a spent budget starts over. (approveAndResume
    // does not: approval rounds share one budget.)
    if (remainingIterations(this.maxIterations, this.iterationsUsed) === 0) {
      this.iterationsUsed = 0
      this.log('info', `Resumed with a fresh budget of ${this.maxIterations} turns.`)
    }
    // The job may have been cancelled while the paused run wound down.
    if (!this.setStatus('running', 'resumed')) return
    this.log('info', 'Agent run resumed by user')
    this.emitSnapshot()
    await this.start()
  }

  private repin(next: JobRuntimeSettings): void {
    const previous = this.pin
    this.pin = next
    this.applyPin(next)
    // A transcript only makes sense to the model that wrote it. The next turn starts a new one,
    // and the status block sent with every request says which beats already have footage.
    this.messages = []
    this.compactedBefore = 0
    // Another engine cannot carry on from where this one stopped; it starts from what the beats
    // hold now.
    const sameEngine = previous?.engine === next.engine
    if (!sameEngine) this.pipelineState = null
    this.log(
      'info',
      sameEngine && next.engine === 'pipeline'
        ? `Resumed with ${next.providerId} / ${next.modelId}. The steps already done are kept.`
        : `Resumed with ${next.providerId} / ${next.modelId}. Earlier conversation dropped because ${
            previous?.providerId !== next.providerId
              ? 'it was written for another provider'
              : 'the settings changed'
          }.`
    )
  }

  public async cancel(): Promise<void> {
    // A job that already ended stays as it ended, and a second cancel has nothing left to do.
    if (this.status === 'cancelled' || !this.setStatus('cancelled', 'user_cancelled')) return
    this.log('info', 'Agent run cancelled by user')
    this.downloader?.cancelAll('Job cancelled by user')
    if (this.abortController) {
      this.abortController.abort()
    }
    if (!this.activePromise) {
      // No run is in flight (paused runner), so runBackground's finally will never
      // release it — drop it here or jobs:get keeps serving this stale instance.
      AgentRunner.activeRunners.delete(this.jobId)
      await this.saveRegistry()
      await this.writeAgentState()
      await this.writeManifest()
    }
    this.emitSnapshot()
  }

  /**
   * Library correction: files that disappeared from disk. The record changes in memory first,
   * so the runner's next write cannot bring the file back.
   */
  public async markFilesMissing(assetIds: string[]): Promise<void> {
    let changed = false
    for (const id of assetIds) {
      const record = this.findAssetRecord(id)
      if (record?.status === 'completed') {
        record.status = 'failed'
        record.error = 'File not found on disk'
        record.filePath = undefined
        changed = true
      }
    }
    if (!changed) return
    this.recountAssets()
    await this.persistSnapshot()
    this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
    this.emitSnapshot()
  }

  /**
   * Library delete. The file goes to the trash first, so a failed trash leaves the record
   * as it was. Refuses while the asset is still downloading.
   */
  public async deleteLocalAsset(assetId: string): Promise<void> {
    const record = this.findAssetRecord(assetId)
    if (!record) return
    if (record.status === 'downloading') {
      throw new Error('Wait for this download to finish before deleting it.')
    }
    if (record.filePath && this.projectDir && isPathInside(this.projectDir, record.filePath)) {
      await moveFileToTrash(record.filePath)
    }
    record.status = 'failed'
    record.error = 'Deleted by user'
    record.filePath = undefined
    this.recountAssets()
    await this.persistSnapshot()
    this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
    this.emitSnapshot()
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
        searchMode: this.input.searchMode || DEFAULT_SEARCH_MODE,
        inputMode: this.input.inputMode,
        targetDuration: this.input.targetDuration,
        tone: this.input.tone
      },
      beats: this.beats,
      // Prefer beat-level records so counts survive resume with a fresh downloader.
      assets: completedAssets,
      failures: failedAssets,
      sourceDocsCheckedAt: new Date().toISOString(),
      summary: this.pipelineSummary,
      usage: parseTokenUsage(this.usage),
      attribution: buildManifestAttribution(allAssetSnapshots),
      pexelsQuotaSnapshot: PexelsClient.getQuotaSnapshot() || undefined
    }

    if (shouldEmbedConversationInManifest(this.agentStateFileTrusted)) {
      manifest.messages = this.messages
      manifest.pexelsCandidates = Array.from(this.pexelsCandidates.entries())
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

    const providerKey = await this.requireApiKey()

    const expanded = await expandIdeaToScript({
      idea: rawIdea.trim(),
      platform: this.input.platform,
      style: this.input.style,
      targetDuration: this.input.targetDuration,
      tone: this.input.tone,
      title: this.input.title,
      avoidPeople: this.safetySettings.avoidPeople,
      timeoutSeconds: this.llmRequestTimeoutSeconds,
      providerId: this.providerId,
      modelId: this.modelId,
      apiKey: providerKey,
      abortSignal: this.abortController?.signal,
      sessionId: `stockfinder:${this.jobId}`,
      onUsage: (usage) => this.addUsage(usage)
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
    this.emitSnapshot()
  }

  private async parseScriptIntoBeats(): Promise<void> {
    if (this.beats.length > 0) return // Already parsed if resuming

    this.updateProgress(
      this.engine === 'pipeline' ? 'Planning beats' : 'Analyzing script into beats',
      15
    )
    this.log(
      'info',
      `Contacting LLM provider (${this.providerId} / model: ${this.modelId}) to segment script into beats...`
    )

    await this.requireApiKey()

    const plannedBeats = await planBeats(
      {
        callStructured: (request) => this.callStructured(request),
        log: (type, message) => this.log(type, message)
      },
      {
        script: this.input.script,
        maxTotalDownloads: this.input.maxTotalDownloads,
        avoidPeople: this.safetySettings.avoidPeople,
        style: this.input.style,
        visualConcept: this.input.visualConcept
      }
    )

    this.beats = plannedBeats.map((beat, index) => ({
      id: `beat_${index + 1}`,
      text: beat.text,
      visualPrompt: beat.visualPrompt,
      queries: beat.queries,
      assetType: beat.assetType,
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

    const providerKey = await this.requireApiKey()
    const provider = LlmProviderFactory.getProvider(this.providerId)

    const searchMode: SearchMode = this.input.searchMode || DEFAULT_SEARCH_MODE
    const systemPrompt = buildStockScoutSystemPrompt({
      searchMode,
      platform: this.input.platform,
      style: this.input.style,
      visualConcept: this.input.visualConcept,
      mix: this.input.mix,
      maxAssetsPerBeat: this.input.maxAssetsPerBeat,
      maxTotalDownloads: this.input.maxTotalDownloads,
      skipExplicit: this.safetySettings.skipExplicit,
      avoidPeople: this.safetySettings.avoidPeople,
      beatCount: this.beats.length,
      suggestedQueries: this.beats.some((b) => b.queries && b.queries.length > 0),
      maxIterations: this.maxIterations
    })

    // A search tool the mix does not allow is not offered at all. The mix is fixed for the job, so
    // the list (and the cached prefix of every request) is the same on every turn and on resume.
    const tools = AGENT_TOOLS.filter(
      (t) =>
        (t.name !== 'search_pexels_videos' || this.canUseAssetType('video')) &&
        (t.name !== 'search_pexels_photos' || this.canUseAssetType('photo'))
    )

    if (this.messages.length === 0) {
      this.messages = [
        {
          role: 'user',
          content: `Search for stock assets for all ${this.beats.length} visual beats now.`
        }
      ]
    }
    this.hitIterationLimit = false
    this.approvalRequested = false
    let emptyToolTurnCount = 0
    const maxEmptyToolNudges = 3

    while (this.iterationsUsed < this.maxIterations && this.status === 'running') {
      const allBeatsFulfilled = areBeatsSatisfiedForLoop(
        this.beats,
        this.input.maxTotalDownloads,
        this.input.maxAssetsPerBeat
      )
      const hasUnqueuedPendingAssets = hasPendingUnqueuedAssets(this.beats)

      if (allBeatsFulfilled && this.beats.length > 0 && !hasUnqueuedPendingAssets) {
        this.log(
          'info',
          'All visual beats have assets selected or queued. Agent workflow complete.'
        )
        break
      }

      const iteration = ++this.iterationsUsed
      this.log(
        'info',
        `Agent turn ${iteration}/${this.maxIterations}: Consulting StockScout AI (${this.providerId} / ${this.modelId})...`
      )
      this.updateProgress(
        `StockScout AI is thinking... (Turn ${iteration}/${this.maxIterations})`,
        this.loopProgress()
      )

      const compacted = compactForRequest(this.messages, this.compactedBefore)
      if (compacted.compactedBefore > this.compactedBefore) {
        this.compactedBefore = compacted.compactedBefore
        this.log('info', 'Compacted older search results to keep requests small.')
      }

      const turnResult = await this.executeWithTimeout(this.llmRequestTimeoutSeconds, (signal) =>
        provider.createToolTurn(
          {
            model: this.modelId,
            systemPrompt,
            messages: messagesWithCacheStablePrefix(
              compacted.view,
              this.beats.map((b) => ({
                id: b.id,
                text: b.text,
                visualPrompt: b.visualPrompt,
                queries: b.queries,
                // A preference between types means nothing when the mix allows only one.
                assetType:
                  this.canUseAssetType('video') && this.canUseAssetType('photo')
                    ? b.assetType
                    : undefined,
                status: b.status,
                assets: b.assets.map((a) => ({ id: a.id, type: a.type, status: a.status }))
              })),
              { used: iteration, max: this.maxIterations }
            ),
            tools,
            toolChoice: 'auto',
            temperature: 0.3,
            maxOutputTokens: LLM_AGENT_TURN_MAX_OUTPUT_TOKENS,
            abortSignal: signal,
            sessionId: `stockfinder:${this.jobId}`,
            reasoning: LLM_AGENT_REASONING
          },
          { apiKey: providerKey }
        )
      )

      if (turnResult.usage) {
        this.addUsage(turnResult.usage)

        // One line per turn, so a long job shows where the tokens went.
        const turnTokens = {
          turn: iteration,
          inputTokens: turnResult.usage.inputTokens || 0,
          cachedInputTokens: turnResult.usage.cachedInputTokens || 0,
          outputTokens: turnResult.usage.outputTokens || 0
        }
        this.log(
          'info',
          `Turn ${iteration}: ${turnTokens.inputTokens.toLocaleString('en-US')} input tokens (${turnTokens.cachedInputTokens.toLocaleString('en-US')} cached), ${turnTokens.outputTokens.toLocaleString('en-US')} output.`,
          turnTokens
        )
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
        const pendingBeats = getUnfulfilledBeats(
          this.beats,
          assetsNeededPerBeat({
            beatCount: this.beats.length,
            optionsPerBeat: this.input.maxAssetsPerBeat,
            maxTotalDownloads: this.input.maxTotalDownloads
          })
        )
        const allBeatsFulfilled = areBeatsSatisfiedForLoop(
          this.beats,
          this.input.maxTotalDownloads,
          this.input.maxAssetsPerBeat
        )

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
          const broadNudge =
            searchMode === 'broad' ? buildBroadSearchNudgeMessage(this.beats) : null
          if (broadNudge) {
            this.messages.push({
              role: 'user',
              content: broadNudge
            })
          } else {
            const pendingSample = pendingBeats
              .slice(0, 4)
              .map((b) => `${b.id} ("${b.visualPrompt.slice(0, 50)}")`)
              .join(', ')
            this.messages.push({
              role: 'user',
              content: `${pendingBeats.length} beats still need footage, for example ${pendingSample}. Search for them now.`
            })
          }
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

      // Under approval mode, every call of the turn runs first; then the user reviews the
      // pending assets together. No request is in flight here, so nothing needs aborting.
      if (this.approvalRequested) {
        this.approvalRequested = false
        await this.holdForApproval()
        break
      }

      // Broad mode light enforcement (no auto query rewrite). Do not nudge after a
      // search turn — that interrupts search→select when other beats are still needy.
      // Empty-tool-turn nudges still cover stalls without assets.
      if (searchMode === 'broad' && this.status === 'running') {
        const turnHadSelectOrDownload = effectiveToolCalls.some(
          (tc) => tc.name === 'select_assets_for_download' || tc.name === 'download_selected_assets'
        )
        const searchedBeatCount = effectiveToolCalls.filter(
          (tc) => tc.name === 'search_pexels_photos' || tc.name === 'search_pexels_videos'
        ).length
        if (
          shouldInjectPostToolBroadNudge({
            turnHadSelectOrDownload,
            searchedBeatCount
          })
        ) {
          const broadNudge = buildBroadSearchNudgeMessage(this.beats)
          if (broadNudge) {
            this.log(
              'info',
              'Broad search mode: nudging agent to try a different broader query for under-searched beats.'
            )
            this.messages.push({
              role: 'user',
              content: broadNudge
            })
          }
        }
      }

      await this.writeAgentState()
    }

    if (remainingIterations(this.maxIterations, this.iterationsUsed) === 0) {
      this.hitIterationLimit = true
      this.log('error', `Agent reached maximum iterations limit (${this.maxIterations})`)
    }
  }

  /**
   * The pipeline engine: the same job, run as fixed steps. The model plans the beats (before this
   * is called) and ranks what Pexels found; code does the rest. A pause, a quota stop or an
   * approval stop leaves the state in `pipelineState`, and the next run carries on from it.
   */
  private async runPipelineEngine(): Promise<void> {
    this.hitIterationLimit = false
    this.approvalRequested = false
    this.logPexelsQuotaIfNeeded()

    const state = this.pipelineState ?? initialPipelineState()
    // A job that stopped after its last step has downloads that may have failed since. One step
    // back, the picks are topped up from the rankings and the model is not asked again.
    if (state.step === 'done') state.step = 'retried'
    // The steps write their progress into this object, so a pause keeps what was done.
    this.pipelineState = state
    const ctx = this.buildPipelineContext(
      this.abortController?.signal ?? new AbortController().signal
    )

    try {
      const outcome = await runPipeline(ctx, { state })
      if (outcome === 'held' || this.status !== 'running') return

      // A download that fails after the last pick leaves its beat short. The loop would carry
      // on; here one more top-up replaces it from the rankings.
      await this.waitForDownloadsToSettle()
      if (this.status === 'running' && hasPicksToMake(ctx, state)) {
        state.step = 'retried'
        await runPipeline(ctx, { state })
      }
    } finally {
      this.settleSearchingBeats()
    }
  }

  /** The pipeline's view of the job, built from the runner's own seams. */
  private buildPipelineContext(signal: AbortSignal): PipelineContext {
    return {
      settings: {
        platform: this.input.platform,
        mix: this.input.mix,
        searchMode: this.input.searchMode || DEFAULT_SEARCH_MODE,
        style: this.input.style,
        visualConcept: this.input.visualConcept,
        optionsPerBeat: this.input.maxAssetsPerBeat,
        maxTotalDownloads: this.input.maxTotalDownloads,
        skipExplicit: this.safetySettings.skipExplicit,
        avoidPeople: this.safetySettings.avoidPeople,
        requireApproval: this.requireApproval
      },
      signal,
      beats: () => this.pipelineBeats(),
      searchPhotos: (params) =>
        this.pipelineSearch(() => this.searchPexels('photo', params, signal)),
      searchVideos: (params) =>
        this.pipelineSearch(() => this.searchPexels('video', params, signal)),
      cacheCandidates: (candidates) => this.storeCandidates(candidates),
      candidate: (key) => this.pexelsCandidates.get(key),
      noteQuery: (beatId, query) => {
        const beat = this.beats.find((b) => b.id === beatId)
        if (!beat) return
        beat.status = statusDuringSearch(beat)
        if (!beat.searchQueries.includes(query)) beat.searchQueries.push(query)
      },
      callStructured: (request) => this.callStructured(request),
      select: (beatId, key) => this.pipelineSelect(beatId, key),
      holdForApproval: () => this.holdForApproval(),
      log: (type, message) => this.log(type, message),
      progress: (step, percent) => this.updateProgress(step, percent),
      saveState: (state) => this.savePipelineState(state)
    }
  }

  /**
   * The beats as the steps see them. A failed asset is not held and is not offered to its beat
   * again: a user's rejection, a download that failed and a file the user deleted all end so.
   */
  private pipelineBeats(): PipelineBeat[] {
    return this.beats.map((beat) => ({
      id: beat.id,
      text: beat.text,
      visualPrompt: beat.visualPrompt,
      queries: beat.queries ?? [],
      assetType: beat.assetType ?? 'either',
      held: beat.assets.filter((a) => a.status !== 'failed').map((a) => a.id),
      excluded: [
        ...new Set([
          ...(beat.rejectedAssets ?? []).map((r) => candidateKey(r.type, r.pexelsId)),
          ...beat.assets.filter((a) => a.status === 'failed').map((a) => a.id)
        ])
      ],
      tried: [...beat.searchQueries]
    }))
  }

  /** A Pexels search for the pipeline. One that runs the quota out pauses the job, as in the loop. */
  private async pipelineSearch<T>(search: () => Promise<T>): Promise<T> {
    try {
      return await search()
    } catch (error) {
      if (this.pexelsQuotaRanOut(error)) {
        this.log(
          'error',
          `Pexels search failed: ${error instanceof Error ? error.message : String(error)}`
        )
        this.pauseIfPexelsQuotaExhausted(error)
      }
      throw error
    }
  }

  /**
   * Records a pick on its beat, and queues the download unless the job waits for approval. The
   * checks are the ones the loop makes when the model selects an asset.
   */
  private pipelineSelect(beatId: string, key: string): SelectOutcome {
    const beat = this.beats.find((b) => b.id === beatId)
    const candidate = this.pexelsCandidates.get(key)
    if (!beat || !candidate || !this.canUseAssetType(candidate.type)) return 'refused'

    const variant = chooseVariant(candidate)
    if (!variant) return 'refused'
    try {
      validateDownloadUrl(variant.url)
    } catch {
      return 'refused'
    }

    if (isAssetRejectedByUser(beat, candidate.type, candidate.pexelsId)) return 'refused'
    if (beatUsingAsset(this.beats, beat.id, key)) return 'refused'
    if (beat.assets.some((a) => a.id === key)) return 'refused'
    const budgetViolation = selectionBudgetViolation({
      beats: this.beats,
      beatId: beat.id,
      maxAssetsPerBeat: this.input.maxAssetsPerBeat,
      maxTotalDownloads: this.input.maxTotalDownloads
    })
    if (budgetViolation) return 'refused'

    const record = this.createAssetRecord(beat, candidate, variant)
    if (!this.requireApproval) this.queueDownload(record, beat)
    return 'selected'
  }

  /** A beat shows "searching" only while a search for it is out. */
  private settleSearchingBeats(): void {
    for (const beat of this.beats) {
      if (beat.status === 'searching') beat.status = statusAfterInterruptedSearch(beat)
    }
  }

  private async savePipelineState(state: PipelineState): Promise<void> {
    this.pipelineState = state
    this.settleSearchingBeats()
    await this.writeAgentState()
    await this.writeManifest()
    this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
  }

  /** Logs what the run did, in words written by code, and keeps it in the manifest. */
  private recordPipelineSummary(): void {
    if (this.status !== 'completed' && this.status !== 'failed') return
    this.pipelineSummary = summarizePipelineRun({
      beats: this.beats.map((beat) => ({
        id: beat.id,
        text: beat.text,
        assets: beat.assets.filter((a) => a.status !== 'failed').length,
        tried: beat.searchQueries
      })),
      // The beat plan was one request; the steps counted the rest.
      modelCalls: 1 + (this.pipelineState?.modelCalls ?? 0),
      totalTokens: this.usage.totalTokens
    })
    this.log('info', this.pipelineSummary)
  }

  // ponytail: O(n) scan; fine until jobs have hundreds of beats
  private loopProgress(): number {
    if (this.beats.length === 0) return Math.max(this.progress, 30)
    const completed = this.beats.filter((b) => b.status === 'completed').length
    return Math.round(30 + (completed / this.beats.length) * 60)
  }

  private canUseAssetType(assetType: 'photo' | 'video'): boolean {
    if (this.input.mix === 'photos only') return assetType === 'photo'
    if (this.input.mix === 'videos only') return assetType === 'video'
    return true
  }

  /**
   * Searches Pexels for the job. A search with no shape asked for gets the shape of the platform.
   * The error of a call that ran out of quota goes to `pauseIfPexelsQuotaExhausted`.
   */
  private searchPexels(
    type: 'photo',
    params: PexelsPhotoSearchInput,
    signal?: AbortSignal
  ): Promise<PexelsPhotoSearchResult>
  private searchPexels(
    type: 'video',
    params: PexelsVideoSearchInput,
    signal?: AbortSignal
  ): Promise<PexelsVideoSearchResult>
  private searchPexels(
    type: 'photo' | 'video',
    params: PexelsPhotoSearchInput | PexelsVideoSearchInput,
    signal: AbortSignal | undefined = this.abortController?.signal
  ): Promise<PexelsPhotoSearchResult | PexelsVideoSearchResult> {
    const withShape = {
      ...params,
      orientation: params.orientation ?? shapeForPlatform(this.input.platform)
    }
    return type === 'photo'
      ? PexelsClient.searchPhotos(withShape, signal)
      : PexelsClient.searchVideos(withShape, signal)
  }

  /** Keeps search results as candidates. A pick is checked against them, so only these can be chosen. */
  private cacheCandidates(results: PexelsPhoto[], type: 'photo', query: string): void
  private cacheCandidates(results: PexelsVideo[], type: 'video', query: string): void
  private cacheCandidates(
    results: PexelsPhoto[] | PexelsVideo[],
    type: 'photo' | 'video',
    query: string
  ): void {
    this.storeCandidates(
      type === 'photo'
        ? (results as PexelsPhoto[]).map((photo) => photoCandidate(photo, query))
        : (results as PexelsVideo[]).map((video) => videoCandidate(video, query))
    )
  }

  private storeCandidates(candidates: PexelsCandidate[]): void {
    for (const candidate of candidates) {
      this.pexelsCandidates.set(candidateKey(candidate.type, candidate.pexelsId), candidate)
    }
  }

  /**
   * Records a chosen candidate on its beat, as a pending asset with the size of the file that
   * will be downloaded. The caller has already checked that the beat may take it.
   */
  private createAssetRecord(
    beat: VisualBeat,
    candidate: PexelsCandidate,
    variant: Variant
  ): AssetRecord {
    const record: AssetRecord = {
      id: candidateKey(candidate.type, candidate.pexelsId),
      pexelsId: candidate.pexelsId,
      type: candidate.type,
      url: variant.url,
      imageUrl: candidate.imageUrl,
      downloadUrl: variant.url,
      // The size of the selected file, which is rarely the size of the original.
      ...variantDimensions(candidate, variant.url),
      duration: candidate.duration,
      photographer: candidate.photographer,
      photographerUrl: candidate.photographerUrl,
      query: candidate.query,
      status: 'pending'
    }
    beat.assets.push(record)
    this.assetLookup.set(record.id, { asset: record, beat })
    beat.status = 'selecting'
    return record
  }

  /**
   * Under approval mode, stops the run with its selections pending, for the user to review. A
   * pause or cancel that came first already decided the status.
   */
  private async holdForApproval(): Promise<void> {
    if (this.status === 'running') {
      this.setStatus('paused', 'awaiting_approval')
      this.log(
        'info',
        `Awaiting user approval for ${countPendingAssets(this.beats)} selected assets.`
      )
    }
    await this.writeAgentState()
  }

  /** The one place a download starts: selection, approval, resume and the download tool all use it. */
  private queueDownload(
    record: AssetRecord,
    beat: VisualBeat
  ): 'queued' | 'already_active' | 'cap_reached' {
    if (record.status === 'completed' || record.status === 'downloading') return 'already_active'
    if (countQueuedOrCompleted(this.beats) >= this.input.maxTotalDownloads) return 'cap_reached'

    record.status = 'downloading'
    beat.status = 'downloading'
    this.downloader.enqueue(
      record.pexelsId,
      record.type,
      record.downloadUrl,
      record.width,
      record.height,
      record.query,
      this.projectDir
    )
    return 'queued'
  }

  /** Downloads selected in an earlier run that never started. Only when approval is off. */
  private requeuePendingDownloads(): void {
    if (this.requireApproval) return

    let queued = 0
    for (const beat of this.beats) {
      for (const record of beat.assets) {
        if (record.status !== 'pending') continue
        if (isAssetRejectedByUser(beat, record.type, record.pexelsId)) continue
        if (this.queueDownload(record, beat) === 'queued') queued++
      }
    }
    if (queued > 0) this.log('info', `Re-queued ${queued} download(s) from the previous run.`)
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
      let rawArgs: unknown
      try {
        rawArgs = JSON.parse(tc.arguments)
      } catch (parseErr) {
        throw new Error(
          `Invalid tool arguments JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        )
      }

      if (tc.name === 'search_pexels_photos') {
        const args = SearchPexelsPhotosArgsSchema.parse(rawArgs)
        this.logPexelsQuotaIfNeeded()
        if (!this.canUseAssetType('photo')) {
          throw new Error(`Photo search is disabled because asset mix is "${this.input.mix}".`)
        }
        if (isQueryBlocked(args.query, this.safetySettings)) {
          throw new Error(EXPLICIT_QUERY_BLOCKED_MESSAGE)
        }

        const beat = this.beats.find((b) => b.id === args.beatId)
        if (beat) {
          beat.status = statusDuringSearch(beat)
          if (!beat.searchQueries.includes(args.query)) {
            beat.searchQueries.push(args.query)
          }
        }
        this.log('info', `[${args.beatId}] Querying Pexels Photos API for "${args.query}"...`)
        this.updateProgress(
          `Searching photos for "${args.query}" (${args.beatId.replace('_', ' ')})`,
          this.loopProgress()
        )

        const searchRes = await this.searchPexels('photo', {
          query: args.query,
          orientation: args.orientation,
          size: args.size,
          color: args.color,
          page: args.page,
          per_page: args.perPage
        })

        // Hidden results are not cached, so the model cannot select them either.
        const photos = applySafetyFilters(
          searchRes.photos,
          (p) => photoResultForModel(p).about,
          this.safetySettings
        )

        // Cache candidates for safety checks
        this.cacheCandidates(photos.shown, 'photo', args.query)

        result = {
          total_results: searchRes.total_results,
          results: photos.shown.map(photoResultForModel),
          ...safetyFilterReport(photos.filtered, photos.shown.length)
        }
      } else if (tc.name === 'search_pexels_videos') {
        const args = SearchPexelsVideosArgsSchema.parse(rawArgs)
        this.logPexelsQuotaIfNeeded()
        if (!this.canUseAssetType('video')) {
          throw new Error(`Video search is disabled because asset mix is "${this.input.mix}".`)
        }
        if (isQueryBlocked(args.query, this.safetySettings)) {
          throw new Error(EXPLICIT_QUERY_BLOCKED_MESSAGE)
        }

        const beat = this.beats.find((b) => b.id === args.beatId)
        if (beat) {
          beat.status = statusDuringSearch(beat)
          if (!beat.searchQueries.includes(args.query)) {
            beat.searchQueries.push(args.query)
          }
        }
        this.log('info', `[${args.beatId}] Querying Pexels Videos API for "${args.query}"...`)
        this.updateProgress(
          `Searching videos for "${args.query}" (${args.beatId.replace('_', ' ')})`,
          this.loopProgress()
        )

        const searchRes = await this.searchPexels('video', {
          query: args.query,
          orientation: args.orientation,
          size: args.size,
          page: args.page,
          per_page: args.perPage
        })

        // Hidden results are not cached, so the model cannot select them either.
        const videos = applySafetyFilters(
          searchRes.videos,
          (v) => videoResultForModel(v).about,
          this.safetySettings
        )

        // Cache candidates for safety checks
        this.cacheCandidates(videos.shown, 'video', args.query)

        result = {
          total_results: searchRes.total_results,
          results: videos.shown.map(videoResultForModel),
          ...safetyFilterReport(videos.filtered, videos.shown.length)
        }
      } else if (tc.name === 'select_assets_for_download') {
        const args = SelectAssetsForDownloadArgsSchema.parse(rawArgs)
        const selections = args.selections
        const rejections = args.rejections

        const selectionResults: unknown[] = []
        const rejectionResults: unknown[] = []

        const firstBeatId = selections[0]?.beatId || rejections[0]?.beatId || ''
        this.log('info', `Selecting/rejecting assets for ${firstBeatId.replace('_', ' ')}...`)
        this.updateProgress(
          `Selecting assets for Beat ${firstBeatId.replace('_', ' ')}`,
          this.loopProgress()
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

          // The model may name a file; without one, code picks the best file for an edit.
          const variant = sel.variantUrl
            ? candidate.variants.find((v) => v.url === sel.variantUrl)
            : chooseVariant(candidate)
          if (!variant) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: sel.variantUrl
                ? `Security Check Failed: URL for asset ${sel.pexelsId} is not a valid Pexels download variant from this job.`
                : `No downloadable file found for asset ${sel.pexelsId}.`
            })
            continue
          }

          try {
            validateDownloadUrl(variant.url)
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

          // The failed record of a user-rejected asset is still on the beat; without
          // this check it would be reported as selected and later re-downloaded.
          if (isAssetRejectedByUser(beat, sel.assetType, sel.pexelsId)) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `The user rejected asset ${sel.pexelsId} for ${beat.id}. Choose a different asset.`
            })
            continue
          }

          const recordId = `${sel.assetType}_${sel.pexelsId}`
          const usedBy = beatUsingAsset(this.beats, beat.id, recordId)
          if (usedBy) {
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: 'rejected',
              reason: `Asset ${sel.pexelsId} is already used for ${usedBy.id}. Pick a different asset so beats don't repeat footage.`
            })
            continue
          }

          const existingRecord = beat.assets.find((a) => a.id === recordId)

          if (!existingRecord) {
            const budgetViolation = selectionBudgetViolation({
              beats: this.beats,
              beatId: beat.id,
              maxAssetsPerBeat: this.input.maxAssetsPerBeat,
              maxTotalDownloads: this.input.maxTotalDownloads
            })
            if (budgetViolation) {
              selectionResults.push({
                pexelsId: sel.pexelsId,
                status: 'rejected',
                reason: budgetViolation
              })
              continue
            }

            const newAsset = this.createAssetRecord(beat, candidate, variant)

            const queued = this.requireApproval ? null : this.queueDownload(newAsset, beat)
            selectionResults.push({
              pexelsId: sel.pexelsId,
              status: queued === 'queued' ? 'queued' : 'selected'
            })
          } else {
            selectionResults.push({ pexelsId: sel.pexelsId, status: 'selected' })
          }
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
                reason: rej.reason?.trim() || DEFAULT_REJECTION_REASON
              })
            }
          }
          rejectionResults.push({ pexelsId: rej.pexelsId, status: 'rejected' })
        }

        await this.writeManifest()
        this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })

        const acceptedSelectionCount = selectionResults.filter(
          (r) =>
            typeof r === 'object' && r !== null && (r as { status?: string }).status === 'selected'
        ).length

        if (this.requireApproval && acceptedSelectionCount > 0) {
          this.approvalRequested = true
          result = {
            status: 'awaiting_user_approval',
            message: 'Selections recorded. The user will review them after this turn.',
            selections: selectionResults,
            rejections: rejectionResults
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
        const args = DownloadSelectedAssetsArgsSchema.parse(rawArgs)
        const assetIds = args.assetIds
        const downloaded: unknown[] = []
        const failed: unknown[] = []

        this.log('info', `Queuing ${assetIds.length} assets for local download...`)
        this.updateProgress(`Queuing assets for download...`, this.progress)

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

          if (isAssetRejectedByUser(parentBeat, assetRef.assetType, assetRef.pexelsId)) {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `The user rejected this asset. Choose a different asset.`,
              retryable: false
            })
            continue
          }

          if (this.requireApproval && assetRecord.status === 'pending') {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Asset requires user approval before downloading.`,
              retryable: false
            })
            continue
          }

          const outcome = this.queueDownload(assetRecord, parentBeat)
          if (outcome === 'cap_reached') {
            failed.push({
              assetType: assetRef.assetType,
              pexelsId: assetRef.pexelsId,
              reason: `Max total downloads cap of ${this.input.maxTotalDownloads} reached.`,
              retryable: false
            })
            continue
          }

          downloaded.push({
            assetType: assetRecord.type,
            pexelsId: assetRecord.pexelsId,
            status: outcome === 'queued' ? 'queued' : assetRecord.status
          })
        }

        result = {
          downloaded,
          failed
        }
      } else {
        throw new Error(`Unknown tool: ${tc.name}`)
      }
    } catch (error) {
      const failure = describeToolFailure(this.status, error)
      if (failure.interrupted) {
        // A search aborted by pause/cancel leaves its beat stuck on "searching".
        for (const beat of this.beats) {
          if (beat.status === 'searching') beat.status = statusAfterInterruptedSearch(beat)
        }
        this.log('info', `${tc.name}: ${failure.message}`)
      } else {
        this.log('error', `Tool execution ${tc.name} failed: ${failure.message}`)
      }
      result = failure.result
      this.pauseIfPexelsQuotaExhausted(error)
    }

    this.log('tool_result', `Result for ${tc.name}`, summarizeToolResultForLog(tc.name, result))
    this.messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name: tc.name,
      content: JSON.stringify(result)
    })
  }

  /**
   * An error from a Pexels call that says the quota is used up pauses the job. True when it did.
   * The caller logs the error first, so the log reads as the failure and then the pause.
   */
  private pauseIfPexelsQuotaExhausted(error: unknown): boolean {
    if (!this.pexelsQuotaRanOut(error)) return false
    this.pauseForPexelsQuota()
    return true
  }

  /** Whether a Pexels call failed because the quota is used up, in a run that is still going. */
  private pexelsQuotaRanOut(error: unknown): boolean {
    return (
      error instanceof ApiError &&
      error.statusCode === 429 &&
      PexelsClient.isQuotaExhausted() &&
      this.status === 'running'
    )
  }

  /** docs/04: on an exhausted quota, stop new Pexels calls for this job and say why. */
  private pauseForPexelsQuota(): void {
    const quota = PexelsClient.getQuotaSnapshot()
    const resetNote = quota ? ` It resets ${new Date(quota.resetAt * 1000).toLocaleString()}.` : ''
    this.setStatus('paused', 'pexels_quota')
    this.log(
      'error',
      `Pexels API quota is exhausted, so the job was paused.${resetNote} Resume after the reset, or add a different Pexels key in Settings.`
    )
    this.updateProgress('Paused — Pexels quota exhausted', this.progress)
    this.abortController?.abort()
  }

  public async approveAndResume(decision: ApprovalDecision = {}): Promise<void> {
    if (this.status !== 'paused') return
    if (this.pin) await this.requireProviderKey(this.pin, missingPinnedKeyMessage(this.pin))

    if (this.activePromise) {
      try {
        await this.activePromise
      } catch {
        // Ignore abort-driven rejections while shutting down the prior run.
      }
      // The job may have been cancelled while the paused run wound down.
      if (this.status !== 'paused') return
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
      asset.error = USER_REJECTION_REASON
      if (!beat.rejectedAssets) {
        beat.rejectedAssets = []
      }
      const priorRejection = beat.rejectedAssets.find(
        (r) => r.type === asset.type && r.pexelsId === asset.pexelsId
      )
      if (priorRejection) {
        // The model may have rejected it earlier; the user's decision takes over.
        priorRejection.reason = USER_REJECTION_REASON
      } else {
        beat.rejectedAssets.push({
          type: asset.type,
          pexelsId: asset.pexelsId,
          reason: USER_REJECTION_REASON
        })
      }
    }

    const approvedPendingAssets = pendingAssets.filter(
      ({ asset }) => approvedSet.has(asset.id) && !rejectedSet.has(asset.id)
    )

    const task = async (): Promise<void> => {
      if (!this.setStatus('running', 'approved')) return
      if (approvedPendingAssets.length === 0) {
        if (rejectedSet.size > 0) {
          this.log(
            'info',
            `User rejected ${rejectedSet.size} pending assets. Resuming ${this.engine === 'pipeline' ? 'the run' : 'agent loop'}.`
          )
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

        for (const { asset, beat } of approvedPendingAssets) {
          this.queueDownload(asset, beat)
        }

        this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })

        // The pipeline has no conversation to tell.
        if (this.engine === 'loop') {
          this.messages.push({
            role: 'user',
            content: `User has approved the selections: ${approvedPendingAssets.map((p) => `${p.asset.type} ${p.asset.pexelsId}`).join(', ')}.${
              rejectedSet.size > 0 ? ` User rejected: ${Array.from(rejectedSet).join(', ')}.` : ''
            } The approved downloads are now in progress.`
          })
        }
      }

      await this.runLoopAndFinalize()
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

      const anyCompleted = parentBeat.assets.some((a) => a.status === 'completed')
      const allTerminal = parentBeat.assets.every(
        (a) => a.status === 'completed' || a.status === 'failed'
      )

      if (allDone && parentBeat.status !== 'completed') {
        parentBeat.status = 'completed'
        this.log(
          'info',
          `[Beat Complete] All selected assets downloaded for ${parentBeat.id.replace('_', ' ')}.`
        )
      } else if (anyDownloading) {
        parentBeat.status = 'downloading'
      } else if (allTerminal && anyCompleted) {
        // At least one asset landed — don't fail the beat because a sibling failed.
        parentBeat.status = 'completed'
      } else if (anyFailed) {
        parentBeat.status = 'failed'
      }

      this.recountAssets()

      // Whether the job is finished is decided when the loop ends (finalizeRun), never here:
      // the model may be in the middle of a turn whose remaining calls still have to run.

      // The immediate write and broadcast below supersede any pending progress flush.
      this.progressFlush.cancel()

      // Write manifest update immediately on state changes
      this.writeManifest(true).catch((err) =>
        console.error('Failed to write manifest on state transition:', err)
      )

      // Broadcast update
      this.emit('event', { jobId: this.jobId, type: 'beats', data: this.beats })
      this.emitSnapshot()
    } else {
      // Progress-only update (e.g. 34% -> 35%): coalesced broadcast + throttled manifest write
      this.progressFlush.schedule()
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
