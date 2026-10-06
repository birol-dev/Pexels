import type { AgentLogEvent, AssetRecord, JobSnapshot, VisualBeat } from '@renderer/lib/store'

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
