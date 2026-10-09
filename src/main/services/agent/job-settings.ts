import type { LlmProviderId } from '../../../shared/llm-defaults.ts'
import type { PublicSettings } from '../storage/settings-store.ts'

/**
 * What a job runs with, fixed when it is created so that pausing, quitting and resuming
 * never change its model or limits behind the user's back. Download concurrency and API
 * keys are machine settings and stay global: a changed key applies at once.
 */
export interface JobRuntimeSettings {
  providerId: LlmProviderId
  modelId: string
  maxIterations: number
  requestTimeoutSeconds: number
  skipExplicit: boolean
  avoidPeople: boolean
  requireApproval: boolean
  /**
   * The engine this job runs on. A record saved before the pipeline existed has none, and
   * that means the loop.
   */
  engine: AgentEngine
}

export type AgentEngine = 'loop' | 'pipeline'

const PROVIDER_LABELS: Record<LlmProviderId, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  gemini: 'Google Gemini'
}

function isProviderId(value: unknown): value is LlmProviderId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function pinRuntimeSettings(settings: PublicSettings): JobRuntimeSettings {
  return {
    providerId: settings.llmProvider,
    modelId: settings.modelId,
    maxIterations: settings.maxAgentIterations,
    requestTimeoutSeconds: settings.requestTimeoutSeconds,
    skipExplicit: settings.skipExplicitQueries,
    avoidPeople: settings.avoidPeopleAndFaces,
    requireApproval: settings.requireApprovalBeforeDownload,
    engine: settings.agentEngine === 'pipeline' ? 'pipeline' : 'loop'
  }
}

/** The record as saved in agent-state.json, or undefined when it is missing or malformed. */
export function parseRuntimeSettings(value: unknown): JobRuntimeSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (
    !isProviderId(v.providerId) ||
    typeof v.modelId !== 'string' ||
    !v.modelId.trim() ||
    !isPositiveNumber(v.maxIterations) ||
    !isPositiveNumber(v.requestTimeoutSeconds) ||
    typeof v.skipExplicit !== 'boolean' ||
    typeof v.avoidPeople !== 'boolean' ||
    typeof v.requireApproval !== 'boolean'
  ) {
    return undefined
  }
  return {
    providerId: v.providerId,
    modelId: v.modelId,
    maxIterations: v.maxIterations,
    requestTimeoutSeconds: v.requestTimeoutSeconds,
    skipExplicit: v.skipExplicit,
    avoidPeople: v.avoidPeople,
    requireApproval: v.requireApproval,
    engine: v.engine === 'pipeline' ? 'pipeline' : 'loop'
  }
}

/**
 * The settings of a job that is loaded from disk: the saved record when there is one. A job
 * from before settings were pinned runs with today's settings, except that it keeps the
 * provider and model its manifest says it was started with. Provider and model go together:
 * a model id means nothing under another provider. It also stays on the loop, the only engine
 * there was when it started.
 */
export function resolveRuntimeSettings(
  saved: JobRuntimeSettings | undefined,
  manifestSnapshot: { provider?: unknown; modelId?: unknown } | undefined,
  current: PublicSettings
): JobRuntimeSettings {
  if (saved) return saved
  const pinned: JobRuntimeSettings = { ...pinRuntimeSettings(current), engine: 'loop' }
  const provider = manifestSnapshot?.provider
  const modelId = manifestSnapshot?.modelId
  if (isProviderId(provider) && typeof modelId === 'string' && modelId.trim()) {
    return { ...pinned, providerId: provider, modelId }
  }
  return pinned
}

/** "OpenRouter (deepseek/deepseek-v4.1-flash)". */
export function describeProviderAndModel(settings: JobRuntimeSettings): string {
  return `${PROVIDER_LABELS[settings.providerId]} (${settings.modelId})`
}

export function providerLabel(providerId: LlmProviderId): string {
  return PROVIDER_LABELS[providerId]
}

function withArticle(label: string): string {
  return `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`
}

/**
 * Resume cannot start: the provider the job was started with has no key any more. Approving
 * leaves out the second way out: that button is hidden while assets wait for approval, and
 * resuming with current settings would approve them unreviewed.
 */
export function missingPinnedKeyMessage(
  pinned: JobRuntimeSettings,
  options: { offerCurrentSettings?: boolean } = {}
): string {
  const addKey = `Add ${withArticle(providerLabel(pinned.providerId))} key in Settings`
  const message = `This job was started with ${describeProviderAndModel(pinned)}. ${addKey}`
  return options.offerCurrentSettings === false
    ? `${message}.`
    : `${message}, or choose Resume with current settings.`
}

/** Resume with current settings cannot start: the current provider has no key. */
export function missingCurrentKeyMessage(current: JobRuntimeSettings): string {
  return `Add ${withArticle(providerLabel(current.providerId))} key in Settings before resuming with the current settings.`
}
