import type {
  AgentLogEvent,
  AssetRecord,
  JobSnapshot,
  PublicSettings,
  VisualBeat
} from '@renderer/lib/store'

export type ApprovalSelection = Record<string, boolean>

export function formatLogData(data: unknown): string {
  try {
    const value = typeof data === 'string' ? JSON.parse(data) : data
    return JSON.stringify(value, null, 2)
  } catch {
    return String(data)
  }
}

export function getLogColor(type: AgentLogEvent['type']): string {
  switch (type) {
    case 'thought':
      return 'text-on-surface-variant italic'
    case 'tool_call':
      return 'text-primary font-bold'
    case 'tool_result':
      return 'text-secondary font-semibold'
    case 'error':
      return 'text-error font-bold'
    default:
      return 'text-on-surface'
  }
}

export function getBeatIconBg(status: VisualBeat['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-cyber-lime text-ink-black'
    case 'searching':
    case 'selecting':
    case 'downloading':
      return 'bg-primary-container text-on-primary-container'
    case 'failed':
      return 'bg-error text-white'
    default:
      return 'bg-surface-container-high text-outline'
  }
}

export function getStatusBadgeClass(status: JobSnapshot['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-cyber-lime text-on-lime'
    case 'running':
      return 'bg-primary-container text-on-primary-container animate-pulse'
    case 'paused':
      return 'bg-tertiary-container text-on-tertiary-container'
    case 'failed':
      return 'bg-error-container text-on-error-container'
    default:
      return 'bg-surface-container-high text-outline'
  }
}

export function formatTokens(count: number): string {
  return count.toLocaleString()
}

/** "12,400 tokens in (9,000 cached) · 1,200 out". Null for a job that reports no usage. */
export function getTokenUsageText(job: JobSnapshot): string | null {
  const usage = job.usage
  if (!usage) return null
  const cached = usage.cachedInputTokens ? ` (${formatTokens(usage.cachedInputTokens)} cached)` : ''
  return `${formatTokens(usage.inputTokens)} tokens in${cached} · ${formatTokens(usage.outputTokens)} out`
}

/** What a paused job is waiting for. Jobs that are not paused have nothing to explain. */
export function getPauseReasonText(job: JobSnapshot): string | null {
  if (job.status !== 'paused') return null
  switch (job.statusReason) {
    case 'awaiting_approval':
      return 'Waiting for you to review the selected assets'
    case 'pexels_quota':
      return 'Pexels quota used up. Resume after it resets.'
    case 'app_quit':
      return 'Paused when the app closed'
    case 'restored':
      return 'Paused. Resume to continue.'
    case 'user_paused':
      return 'Paused'
    default:
      return null
  }
}

/**
 * Whether Settings now say something different from what the job runs with. That is when
 * "Resume with current settings" has a point. Without either side there is nothing to compare.
 */
export function pinnedSettingsDiffer(job: JobSnapshot, current: PublicSettings | null): boolean {
  const pinned = job.runtimeSettings
  if (!pinned || !current) return false
  return (
    pinned.providerId !== current.llmProvider ||
    pinned.modelId !== current.modelId ||
    pinned.maxIterations !== current.maxAgentIterations ||
    pinned.requestTimeoutSeconds !== current.requestTimeoutSeconds ||
    pinned.skipExplicit !== current.skipExplicitQueries ||
    pinned.avoidPeople !== current.avoidPeopleAndFaces ||
    pinned.requireApproval !== current.requireApprovalBeforeDownload ||
    (pinned.engine ?? 'loop') !== (current.agentEngine ?? 'loop') ||
    // Thumbnails only matter to the pipeline: the loop never sends them.
    ((pinned.engine ?? 'loop') === 'pipeline' &&
      (pinned.rankWithThumbnails ?? false) !== (current.rankWithThumbnails ?? false))
  )
}

export function getPendingAssets(job: JobSnapshot): AssetRecord[] {
  return job.beats.flatMap((b) => (b.assets || []).filter((a) => a.status === 'pending'))
}

export function splitApprovalIds(
  pendingAssets: AssetRecord[],
  selection: ApprovalSelection
): { approvedIds: string[]; rejectedIds: string[] } {
  return {
    approvedIds: pendingAssets.filter((a) => selection[a.id] !== false).map((a) => a.id),
    rejectedIds: pendingAssets.filter((a) => selection[a.id] === false).map((a) => a.id)
  }
}
