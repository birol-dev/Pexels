export type JobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

export type StatusReason =
  | 'started'
  | 'resumed'
  | 'approved'
  | 'user_paused'
  | 'awaiting_approval'
  | 'pexels_quota'
  | 'app_quit'
  | 'restored'
  | 'finished'
  | 'error'
  | 'user_cancelled'

/** `completed`, `failed` and `cancelled` are final: running a job again makes a new job. */
const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: []
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || NEXT[from].includes(to)
}

/** The reasons a job can be paused for. The others describe a job that is running or has ended. */
const PAUSE_REASONS: readonly StatusReason[] = [
  'user_paused',
  'awaiting_approval',
  'pexels_quota',
  'app_quit',
  'restored'
]

/**
 * Why a job that has no runner is in `status`, from the reason saved with it. Only paused
 * jobs show one. A paused job whose saved reason is not a pause reason was running when
 * the app stopped, and reads as restored.
 */
export function savedStatusReason(status: JobStatus, saved: unknown): StatusReason | undefined {
  if (status !== 'paused') return undefined
  return PAUSE_REASONS.includes(saved as StatusReason) ? (saved as StatusReason) : 'restored'
}
