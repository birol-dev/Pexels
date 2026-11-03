import { AgentRunner, type JobSnapshot, type StartJobInput } from '../agent/agent-runner.ts'
import {
  getJobInputFromManifest,
  getJobRunner,
  getJobSnapshot,
  StartJobInputSchema,
  startJob
} from '../../ipc/jobs.ipc.ts'
import { ProjectStore } from '../storage/project-store.ts'
import { splitScriptSentences } from '../llm/beat-parse-tool.ts'

export async function getMcpJobContext(jobId: string): Promise<Record<string, unknown>> {
  const job = await getJobSnapshot(jobId)
  const summary = await ProjectStore.get(jobId)
  if (!summary) throw new Error('Job not found.')
  return {
    job,
    input: await getJobInputFromManifest(summary),
    sentences: splitScriptSentences(job.script).map((text, index) => ({ number: index + 1, text })),
    waitingOn:
      job.status === 'paused'
        ? job.statusReason === 'awaiting_approval'
          ? 'desktop_approval'
          : 'resume'
        : job.status !== 'running'
          ? null
          : !job.script.trim()
            ? 'script'
            : job.beats.length === 0
              ? 'beat_plan'
              : job.beats.some((beat) =>
                    beat.assets.some(
                      (asset) => asset.status === 'pending' || asset.status === 'downloading'
                    )
                  )
                ? 'downloads'
                : 'client'
  }
}

export async function createMcpJob(input: StartJobInput): Promise<Record<string, unknown>> {
  const parsed = StartJobInputSchema.parse({
    ...input,
    inputMode: input.idea?.trim() ? 'idea' : 'script'
  }) as StartJobInput
  return getMcpJobContext(await startJob(parsed, 'mcp'))
}

const terminalActions = new Map<string, Promise<JobSnapshot>>()

/** Lost responses and concurrent retries must converge on the same durable result. */
export async function finishOrCancelMcpJob(
  jobId: string,
  action: 'finish' | 'cancel',
  summary?: string
): Promise<JobSnapshot> {
  const key = `${jobId}:${action}`
  const existing = terminalActions.get(key)
  if (existing) return existing
  const pending = (async (): Promise<JobSnapshot> => {
    const job = await getJobSnapshot(jobId)
    if (job.runtimeSettings?.engine !== 'mcp') {
      throw new Error('This job is controlled by the built-in AI. Create an MCP job to control it.')
    }
    if (
      job.status === 'completed' ||
      (action === 'cancel' && job.status !== 'running' && job.status !== 'paused')
    ) {
      const active = AgentRunner.getActive(jobId)
      return active ? active.retryMcpTerminalPersistence() : job
    }
    const runner = await requireMcpRunner(jobId)
    if (action === 'finish') return runner.finishMcpJob(summary)
    await runner.cancel()
    await runner.waitForShutdown()
    return runner.getSnapshot()
  })()
  terminalActions.set(key, pending)
  try {
    return await pending
  } finally {
    terminalActions.delete(key)
  }
}

/** The MCP connection cannot take over an API-controlled or terminal job. */
export async function requireMcpRunner(jobId: string): Promise<AgentRunner> {
  const job = await getJobSnapshot(jobId)
  if (job.runtimeSettings?.engine !== 'mcp') {
    throw new Error('This job is controlled by the built-in AI. Create an MCP job to control it.')
  }
  if (job.status !== 'running' && job.status !== 'paused') {
    throw new Error(`This job is ${job.status}. Create a new MCP job to continue.`)
  }
  const runner = await getJobRunner(jobId)
  if (!runner) throw new Error('Job cannot be restored. Reopen StockFinder and try again.')
  return runner
}
