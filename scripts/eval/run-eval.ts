import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import {
  AgentRunner,
  type JobSnapshot,
  type VisualBeat
} from '../../src/main/services/agent/agent-runner.ts'
import { resetLlmCircuit } from '../../src/main/services/llm/llm-fetch.ts'
import { resetModelRequestQuirks } from '../../src/main/services/llm/llm-provider.ts'
import { PexelsClient } from '../../src/main/services/pexels/pexels-client.ts'
import { PexelsSearchCache } from '../../src/main/services/pexels/pexels-search-cache.ts'
import { ProjectStore } from '../../src/main/services/storage/project-store.ts'
import { SecureSecrets } from '../../src/main/services/storage/secure-secrets.ts'
import {
  getDefaultSettings,
  SettingsStore
} from '../../src/main/services/storage/settings-store.ts'
import { DEFAULT_MODEL_IDS, type LlmProviderId } from '../../src/shared/llm-defaults.ts'
import { renderContactSheet } from './contact-sheet.ts'
import { countersSince, installEvalNetwork, type EvalNetwork } from './eval-network.ts'
import type { EvalScript } from './eval-scripts.ts'
import { computeMetrics } from './metrics.ts'
import {
  renderSummary,
  type EngineOutcome,
  type EvalEngine,
  type ReportBeat,
  type RunInfo,
  type ScriptReport
} from './report.ts'

/**
 * Runs evaluation scripts through the app's own job runner and writes the results.
 * The steps mirror the jobs:start IPC handler. Nothing here reads process.env or the
 * real fetch directly: the caller passes the keys, and the network is whatever
 * globalThis.fetch is, so tests run the same code on the fake network.
 */

export const DEFAULT_DEADLINE_MS = 30 * 60_000

export interface EvalOptions {
  scripts: EvalScript[]
  provider: LlmProviderId
  /** Defaults to the app's default model for the provider. */
  model?: string
  engine: EvalEngine
  /** The run folder, for example eval-results/2026-10-08T12-00-00Z. */
  outDir: string
  /** Folder of the Pexels record/replay cache. */
  cacheDir: string
  keys: { llm: string; pexels: string }
  /** How long one script may run before its job is cancelled. */
  deadlineMs?: number
  /** Answer media downloads with a small placeholder instead of fetching the files. */
  noDownload?: boolean
  /** Short hash of the commit under test, for the summary. */
  commit?: string | null
  /** Called when a script has finished and its report is on disk. */
  onReport?: (report: ScriptReport) => void
  /** Called as soon as a warning is known. The warnings also go into summary.md. */
  onWarning?: (warning: string) => void
}

export interface EvalResult {
  run: RunInfo
  reports: ScriptReport[]
  files: { summary: string; contactSheet: string; reports: string[] }
}

interface ScriptContext {
  provider: LlmProviderId
  model: string
  engine: EngineOutcome
  outDir: string
  network: EvalNetwork
  deadlineMs: number
  noDownload: boolean
  /** Key values, removed from any error text that ends up in a report. */
  secrets: string[]
}

interface JobOutcome {
  status: ScriptReport['job']['status']
  timedOut: boolean
  projectDir: string | null
  errors: string[]
  beats: VisualBeat[]
  narration: string
  runnerUsage: JobSnapshot['usage'] | null
  pexelsQuota: unknown
}

let jobCounter = 0

/** Job ids must match /^job_\d+$/, which is what the IPC schema accepts. */
function nextJobId(): string {
  return `job_${Date.now()}${String(jobCounter++).padStart(3, '0')}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Hands the requested engine to the app and reports what will run. The engine counts
 * as honoured only when the settings store kept the value; otherwise the jobs run the
 * app's default, the loop.
 */
export async function resolveEngine(requested: EvalEngine): Promise<EngineOutcome> {
  const stored = await SettingsStore.updateSettings({ agentEngine: requested })
  return { requested, effective: stored.agentEngine === requested ? requested : 'loop' }
}

/** Awaits a run and cancels it when it has not ended in time. Returns whether it was cancelled. */
async function runWithDeadline(runner: AgentRunner, deadlineMs: number): Promise<boolean> {
  const run = runner.start()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timedOut = await Promise.race([
      run.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), deadlineMs)
      })
    ])
    if (timedOut) {
      await runner.cancel()
      await run.catch(() => undefined)
    }
    return timedOut
  } finally {
    clearTimeout(timer)
  }
}

async function readManifest(projectDir: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(projectDir, 'manifest.json'), 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    // A job that failed before its first manifest write has none.
    return null
  }
}

/** A path inside the run folder, with forward slashes, or null when it lies outside. */
function insideRun(outDir: string, path: string): string | null {
  const rel = relative(outDir, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

function toReportBeats(beats: VisualBeat[], outDir: string): ReportBeat[] {
  return beats.map((beat) => ({
    id: beat.id,
    text: beat.text,
    visualPrompt: beat.visualPrompt ?? '',
    searchQueries: beat.searchQueries ?? [],
    status: beat.status,
    assets: beat.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      pexelsId: asset.pexelsId,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      status: asset.status,
      error: asset.error,
      query: asset.query ?? '',
      photographer: asset.photographer ?? '',
      pageUrl: asset.url ?? '',
      thumbnailUrl: asset.imageUrl ?? '',
      file:
        asset.status === 'completed' && asset.filePath ? insideRun(outDir, asset.filePath) : null
    }))
  }))
}

async function runJob(
  script: EvalScript,
  jobId: string,
  scriptDir: string,
  context: ScriptContext
): Promise<JobOutcome> {
  // The app keeps this state at module level. Clearing it makes a script's numbers
  // independent of the scripts that ran before it. The Pexels quota tracker is left
  // alone: the quota really is shared by the whole run.
  PexelsSearchCache.clear()
  PexelsClient.resetCircuit()
  resetLlmCircuit()
  resetModelRequestQuirks()

  // The app's defaults, plus what the evaluation needs to differ.
  await SettingsStore.updateSettings({
    ...getDefaultSettings(),
    agentEngine: context.engine.requested,
    llmProvider: context.provider,
    modelId: context.model,
    downloadFolder: scriptDir,
    requireApprovalBeforeDownload: false,
    avoidPeopleAndFaces: script.avoidPeople
  })

  // The runner writes the expanded script and title into its input, so it gets a copy.
  const runner = new AgentRunner(jobId, { ...script.input })
  await runner.ensureRegistered()
  const timedOut = await runWithDeadline(runner, context.deadlineMs)
  await runner.waitForShutdown()

  const snapshot = runner.getSnapshot()
  const projectDir = (await ProjectStore.get(jobId))?.downloadPath || null
  const manifest = projectDir ? await readManifest(projectDir) : null
  // The manifest on disk is what a user of the app ends up with, so it is the source.
  const manifestBeats: unknown = manifest?.beats
  const manifestScript: unknown = manifest?.script
  const beats = Array.isArray(manifestBeats) ? (manifestBeats as VisualBeat[]) : snapshot.beats

  const errors = snapshot.logs
    .filter((entry) => entry.type === 'error')
    .slice(-5)
    .map((entry) => entry.message)
  if (timedOut) {
    errors.push(
      `The job ran past the deadline of ${Math.round(context.deadlineMs / 1000)} seconds and was cancelled.`
    )
  }

  return {
    status: snapshot.status,
    timedOut,
    projectDir,
    errors,
    beats: beats.map((beat) => ({
      ...beat,
      assets: Array.isArray(beat.assets) ? beat.assets : []
    })),
    narration: typeof manifestScript === 'string' ? manifestScript : snapshot.script,
    runnerUsage: snapshot.usage ?? null,
    pexelsQuota: manifest?.pexelsQuotaSnapshot ?? null
  }
}

/**
 * Runs one script as a job and writes `<outDir>/<script id>/report.json`. The job's
 * project folder goes into the same folder. A job that fails, times out or cannot be
 * started still produces a report, so one bad script does not end the run.
 */
export async function runEvalScript(
  script: EvalScript,
  context: ScriptContext
): Promise<ScriptReport> {
  const scriptDir = join(context.outDir, script.id)
  const jobId = nextJobId()
  const startedAt = Date.now()
  const before = context.network.counters()

  let outcome: JobOutcome = {
    status: 'crashed',
    timedOut: false,
    projectDir: null,
    errors: [],
    beats: [],
    narration: script.input.script,
    runnerUsage: null,
    pexelsQuota: null
  }
  try {
    await mkdir(scriptDir, { recursive: true })
    outcome = await runJob(script, jobId, scriptDir, context)
  } catch (error) {
    outcome.errors.push(`The evaluation could not run this job: ${errorMessage(error)}`)
  }

  const finishedAt = Date.now()
  const used = countersSince(before, context.network.counters())
  const scrub = (text: string): string =>
    context.secrets
      .reduce((clean, secret) => (secret ? clean.split(secret).join('[key removed]') : clean), text)
      .slice(0, 600)

  const report: ScriptReport = {
    schemaVersion: 1,
    script: {
      id: script.id,
      file: script.file,
      title: script.input.title,
      about: script.about,
      platform: script.input.platform,
      style: script.input.style,
      mix: script.input.mix,
      searchMode: script.input.searchMode ?? 'focused',
      inputMode: script.input.inputMode ?? 'script',
      avoidPeople: script.avoidPeople,
      maxAssetsPerBeat: script.input.maxAssetsPerBeat,
      maxTotalDownloads: script.input.maxTotalDownloads
    },
    run: {
      provider: context.provider,
      model: context.model,
      engine: context.engine,
      noDownload: context.noDownload,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString()
    },
    job: {
      jobId,
      status: outcome.status,
      timedOut: outcome.timedOut,
      projectDir: outcome.projectDir ? insideRun(context.outDir, outcome.projectDir) : null,
      errors: outcome.errors.map(scrub)
    },
    metrics: computeMetrics({
      script: outcome.narration,
      platform: script.input.platform,
      beats: outcome.beats,
      cost: {
        llmCalls: used.llmCalls,
        inputTokens: used.inputTokens,
        cachedInputTokens: used.cachedInputTokens,
        outputTokens: used.outputTokens
      },
      seconds: Math.round((finishedAt - startedAt) / 100) / 10
    }),
    network: {
      llmFailedCalls: used.llmFailedCalls,
      pexelsLive: used.pexelsLive,
      pexelsReplayed: used.pexelsReplayed,
      mediaRequests: used.mediaRequests
    },
    runnerUsage: outcome.runnerUsage,
    pexelsQuota: outcome.pexelsQuota,
    narration: outcome.narration,
    beats: toReportBeats(outcome.beats, context.outDir)
  }

  await mkdir(scriptDir, { recursive: true })
  await writeFile(join(scriptDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

/** Removes the keys a run stored. Safe to call at any time, including twice. */
export async function clearEvalKeys(provider: LlmProviderId): Promise<void> {
  await SecureSecrets.setSecret(`${provider}Key`, '')
  await SecureSecrets.setSecret('pexelsKey', '')
}

/**
 * Runs the scripts one after another and writes the run folder: a report.json per
 * script, summary.md and contact-sheet.html. The keys go into the secret store of the
 * current userData folder for the length of the run, so the caller must make sure that
 * folder is not the real app's (the CLI checks that the electron stub is active).
 */
export async function runEval(options: EvalOptions): Promise<EvalResult> {
  const model = options.model || DEFAULT_MODEL_IDS[options.provider]
  const noDownload = options.noDownload ?? false
  const warnings: string[] = []
  const warn = (warning: string): void => {
    warnings.push(warning)
    options.onWarning?.(warning)
  }
  const reports: ScriptReport[] = []
  await mkdir(options.outDir, { recursive: true })

  await SecureSecrets.setSecret(`${options.provider}Key`, options.keys.llm)
  await SecureSecrets.setSecret('pexelsKey', options.keys.pexels)
  const network = installEvalNetwork({ cacheDir: options.cacheDir, noDownload })
  let engine: EngineOutcome = { requested: options.engine, effective: 'loop' }
  try {
    engine = await resolveEngine(options.engine)
    if (engine.requested !== engine.effective) {
      warn(
        `--pipeline ${engine.requested} was requested, but the settings store did not keep it, so the engine is ignored and every job runs the ${engine.effective} engine.`
      )
    }
    if (noDownload) {
      warn(
        'Media downloads are answered with placeholders (--no-download). The files in the project folders are not real media.'
      )
    }

    for (const script of options.scripts) {
      const report = await runEvalScript(script, {
        provider: options.provider,
        model,
        engine,
        outDir: options.outDir,
        network,
        deadlineMs: options.deadlineMs ?? DEFAULT_DEADLINE_MS,
        noDownload,
        secrets: [options.keys.llm, options.keys.pexels]
      })
      reports.push(report)
      options.onReport?.(report)
    }
  } finally {
    network.restore()
    await clearEvalKeys(options.provider)
  }

  const run: RunInfo = {
    id: basename(options.outDir),
    provider: options.provider,
    model,
    engine,
    noDownload,
    commit: options.commit ?? null,
    warnings
  }
  const files = {
    summary: join(options.outDir, 'summary.md'),
    contactSheet: join(options.outDir, 'contact-sheet.html'),
    reports: reports.map((report) => join(options.outDir, report.script.id, 'report.json'))
  }
  await writeFile(files.summary, renderSummary(run, reports), 'utf8')
  await writeFile(files.contactSheet, renderContactSheet(run, reports), 'utf8')
  return { run, reports, files }
}
