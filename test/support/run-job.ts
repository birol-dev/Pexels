import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AgentRunner,
  type JobSnapshot,
  type StartJobInput,
  type VisualBeat
} from '../../src/main/services/agent/agent-runner.ts'
import { resetLlmCircuit } from '../../src/main/services/llm/llm-fetch.ts'
import { resetModelRequestQuirks } from '../../src/main/services/llm/llm-provider.ts'
import { PexelsClient } from '../../src/main/services/pexels/pexels-client.ts'
import { PexelsRateLimitTracker } from '../../src/main/services/pexels/pexels-rate-limit.ts'
import { PexelsSearchCache } from '../../src/main/services/pexels/pexels-search-cache.ts'
import { ProjectStore, type JobSummary } from '../../src/main/services/storage/project-store.ts'
import { SecureSecrets } from '../../src/main/services/storage/secure-secrets.ts'
import {
  SettingsStore,
  type PublicSettings
} from '../../src/main/services/storage/settings-store.ts'
import type { ToolCallSpec } from './fake-network.ts'

export interface JobManifest {
  beats: VisualBeat[]
  attribution?: unknown
  [key: string]: unknown
}

export interface JobRun {
  jobId: string
  runner: AgentRunner
  events: unknown[]
  summary: JobSummary
  manifest: JobManifest
  snapshot: JobSnapshot
}

let counter = 0

/** Job ids must match /^job_\d+$/, which is what the IPC schema accepts. */
export function nextJobId(): string {
  return `job_${Date.now()}${String(counter++).padStart(3, '0')}`
}

/** Clears the network state the app keeps at module level. Call it before each test. */
export function resetNetworkState(): void {
  PexelsSearchCache.clear()
  PexelsClient.resetCircuit()
  PexelsRateLimitTracker.clear()
  resetLlmCircuit()
  resetModelRequestQuirks()
}

/** Stores test keys and settings, with a fresh download folder. Returns that folder. */
export async function applyTestSettings(settings: Partial<PublicSettings> = {}): Promise<string> {
  const downloadFolder = await mkdtemp(join(tmpdir(), 'stockfinder-downloads-'))
  await SecureSecrets.setSecret('openaiKey', 'sk-test')
  await SecureSecrets.setSecret('pexelsKey', 'pexels-test')
  await SettingsStore.updateSettings({
    llmProvider: 'openai',
    modelId: 'gpt-4o',
    downloadFolder,
    maxConcurrentDownloads: 2,
    maxAgentIterations: 30,
    requestsPerMinute: 0,
    requireApprovalBeforeDownload: false,
    ...settings
  })
  return downloadFolder
}

/** The registry entry and manifest of a job, as they are on disk. */
export async function readJob(
  jobId: string
): Promise<{ summary: JobSummary; manifest: JobManifest }> {
  const summary = await ProjectStore.get(jobId)
  if (!summary) throw new Error(`Job ${jobId} is not in the registry`)
  const manifest = JSON.parse(
    await readFile(join(summary.downloadPath, 'manifest.json'), 'utf8')
  ) as JobManifest
  return { summary, manifest }
}

/**
 * Awaits a run, and cancels it when it has not ended in time. A fake job needs a few
 * milliseconds, so a run that is still going is waiting on a backoff or quota timer,
 * which would otherwise hold the test process open.
 */
export async function withDeadline(
  runner: AgentRunner,
  run: Promise<void>,
  deadlineMs = 10_000
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = await Promise.race([
    run.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), deadlineMs)
    })
  ])
  clearTimeout(timer)
  if (timedOut) {
    await runner.cancel()
    await run.catch(() => undefined)
    throw new Error(`The job did not end within ${deadlineMs} ms and was cancelled.`)
  }
}

/** Mirrors the jobs:start IPC handler, then waits for the run to end (or pause). */
export async function runJob(
  input: Partial<StartJobInput> = {},
  settings: Partial<PublicSettings> = {},
  options: { deadlineMs?: number } = {}
): Promise<JobRun> {
  await applyTestSettings(settings)
  const jobId = nextJobId()
  const runner = new AgentRunner(jobId, {
    title: 'Test job',
    script: 'One sentence. Another sentence.',
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 1,
    maxTotalDownloads: 10,
    ...input
  })
  const events: unknown[] = []
  runner.on('event', (event) => events.push(event))
  await runner.ensureRegistered()
  await withDeadline(runner, runner.start(), options.deadlineMs)
  const { summary, manifest } = await readJob(jobId)
  return { jobId, runner, events, summary, manifest, snapshot: runner.getSnapshot() }
}

/** The beat-split reply: one beat per text, in order. */
export function submitBeats(texts: string[]): ToolCallSpec {
  return {
    name: 'submit_script_beats',
    args: {
      beats: texts.map((text, index) => ({ text, visualPrompt: `stock footage ${index + 1}` }))
    }
  }
}

export function searchVideos(beatId: string, query: string): ToolCallSpec {
  return { name: 'search_pexels_videos', args: { beatId, query } }
}

export function searchPhotos(beatId: string, query: string): ToolCallSpec {
  return { name: 'search_pexels_photos', args: { beatId, query } }
}

export function select(
  selections: Array<{
    beatId: string
    assetType: 'photo' | 'video'
    pexelsId: number
    variantUrl: string
  }>
): ToolCallSpec {
  return {
    name: 'select_assets_for_download',
    args: { selections: selections.map((s) => ({ ...s, reason: 'Fits the beat.' })) }
  }
}

export function download(
  assetIds: Array<{ assetType: 'photo' | 'video'; pexelsId: number }>
): ToolCallSpec {
  return { name: 'download_selected_assets', args: { assetIds } }
}
