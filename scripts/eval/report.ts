import type { AssetRecord, JobSnapshot } from '../../src/main/services/agent/agent-runner.ts'
import type { EvalMetrics, Platform, Share } from './metrics.ts'

/**
 * The shape of one script's report.json, and the summary.md table built from the
 * reports of a run.
 */

export type EvalEngine = 'loop' | 'pipeline'

export interface EngineOutcome {
  /** What `--pipeline` asked for. */
  requested: EvalEngine
  /** What the app ran: loop or pipeline. */
  effective: EvalEngine
}

export interface ReportAsset {
  id: string
  type: 'photo' | 'video'
  pexelsId: number
  width: number
  height: number
  duration?: number
  status: AssetRecord['status']
  error?: string
  /** The search query that found it. */
  query: string
  photographer: string
  /** The asset's page on pexels.com. */
  pageUrl: string
  thumbnailUrl: string
  /** The downloaded file, relative to the run folder, or null when there is none. */
  file: string | null
}

export interface ReportBeat {
  id: string
  text: string
  visualPrompt: string
  searchQueries: string[]
  status: string
  assets: ReportAsset[]
}

export interface ScriptReport {
  schemaVersion: 1
  script: {
    id: string
    file: string
    title: string
    about: string
    platform: Platform
    style: string
    mix: string
    searchMode: string
    inputMode: 'script' | 'idea'
    avoidPeople: boolean
    maxAssetsPerBeat: number
    maxTotalDownloads: number
  }
  run: {
    provider: string
    model: string
    engine: EngineOutcome
    noDownload: boolean
    startedAt: string
    finishedAt: string
  }
  job: {
    jobId: string
    /** The runner's final status, or `crashed` when the job could not be run at all. */
    status: JobSnapshot['status'] | 'crashed'
    /** The job was cancelled because it ran past the deadline. */
    timedOut: boolean
    /** The job's project folder, relative to the run folder. */
    projectDir: string | null
    /** The last error lines of the job's log. */
    errors: string[]
  }
  metrics: EvalMetrics
  network: {
    /** LLM requests that ended in an HTTP error or got no answer. Part of `cost.llmCalls`. */
    llmFailedCalls: number
    /** Pexels API requests that spent quota. */
    pexelsLive: number
    /** Pexels API requests answered from the cache folder. */
    pexelsReplayed: number
    /** Media files the job asked for. */
    mediaRequests: number
  }
  /** The runner's own token total, as a cross-check. It leaves out the idea expansion. */
  runnerUsage: JobSnapshot['usage'] | null
  /** The Pexels quota the manifest recorded at the end of the job. */
  pexelsQuota: unknown
  /** The narration the beats are compared with. In idea mode, the expanded script. */
  narration: string
  beats: ReportBeat[]
}

export interface RunInfo {
  /** The run folder's name: a timestamp. */
  id: string
  provider: string
  model: string
  engine: EngineOutcome
  noDownload: boolean
  /** Short hash of the commit the run was made from, when known. */
  commit: string | null
  warnings: string[]
}

function addShares(shares: Share[]): Share {
  const count = shares.reduce((sum, share) => sum + share.count, 0)
  const total = shares.reduce((sum, share) => sum + share.total, 0)
  return { count, total, ratio: total > 0 ? count / total : null }
}

/** `7/8 (88%)`, or `n/a` when there was nothing to look at. */
export function formatShare(share: Share): string {
  if (share.ratio === null) return 'n/a'
  return `${share.count}/${share.total} (${Math.round(share.ratio * 100)}%)`
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Markdown table cells cannot hold a pipe or a line break. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

const COLUMNS = [
  'Script',
  'Status',
  'Beats',
  'Fidelity',
  'Coverage',
  'Duplicates',
  'Orientation',
  'Resolution',
  'Clip length',
  'LLM calls',
  'Input tokens',
  'Cached',
  'Output tokens',
  'Time (s)'
]

function reportRow(report: ScriptReport): string {
  const { metrics } = report
  return row([
    cell(report.script.id),
    report.job.timedOut ? `${report.job.status} (timed out)` : report.job.status,
    String(report.beats.length),
    metrics.scriptFidelity ? 'yes' : 'no',
    formatShare(metrics.coverage),
    String(metrics.duplicates.count),
    formatShare(metrics.orientationMatch),
    formatShare(metrics.resolution),
    formatShare(metrics.clipLength),
    formatCount(metrics.cost.llmCalls),
    formatCount(metrics.cost.inputTokens),
    formatCount(metrics.cost.cachedInputTokens),
    formatCount(metrics.cost.outputTokens),
    formatCount(metrics.seconds)
  ])
}

function totalRow(reports: ScriptReport[]): string {
  const sum = (pick: (report: ScriptReport) => number): number =>
    reports.reduce((total, report) => total + pick(report), 0)
  const completed = reports.filter((report) => report.job.status === 'completed').length
  const faithful = reports.filter((report) => report.metrics.scriptFidelity).length
  return row([
    '**Total**',
    `${completed}/${reports.length} completed`,
    String(sum((r) => r.beats.length)),
    `${faithful}/${reports.length}`,
    formatShare(addShares(reports.map((r) => r.metrics.coverage))),
    String(sum((r) => r.metrics.duplicates.count)),
    formatShare(addShares(reports.map((r) => r.metrics.orientationMatch))),
    formatShare(addShares(reports.map((r) => r.metrics.resolution))),
    formatShare(addShares(reports.map((r) => r.metrics.clipLength))),
    formatCount(sum((r) => r.metrics.cost.llmCalls)),
    formatCount(sum((r) => r.metrics.cost.inputTokens)),
    formatCount(sum((r) => r.metrics.cost.cachedInputTokens)),
    formatCount(sum((r) => r.metrics.cost.outputTokens)),
    formatCount(sum((r) => r.metrics.seconds))
  ])
}

function engineLine(engine: EngineOutcome): string {
  return engine.requested === engine.effective
    ? engine.effective
    : `${engine.effective} (${engine.requested} was requested and ignored)`
}

/** The summary.md of a run: what was run, one table row per script, and a legend. */
export function renderSummary(run: RunInfo, reports: ScriptReport[]): string {
  const sum = (pick: (report: ScriptReport) => number): number =>
    reports.reduce((total, report) => total + pick(report), 0)
  const failedCalls = sum((r) => r.network.llmFailedCalls)
  const problems = reports.filter((report) => report.job.errors.length > 0)

  const lines = [
    `# Evaluation run ${run.id}`,
    '',
    `- Provider and model: ${run.provider} / ${run.model}`,
    `- Engine: ${engineLine(run.engine)}`,
    `- Commit: ${run.commit ?? 'unknown'}`,
    `- Pexels API requests: ${formatCount(sum((r) => r.network.pexelsLive))} live, ${formatCount(sum((r) => r.network.pexelsReplayed))} replayed from the cache`,
    `- Media requests: ${formatCount(sum((r) => r.network.mediaRequests))}${run.noDownload ? ' (answered with placeholders: --no-download)' : ''}`,
    `- LLM requests that failed: ${formatCount(failedCalls)}`,
    '',
    row(COLUMNS),
    row(COLUMNS.map((_, index) => (index < 2 ? '---' : '---:'))),
    ...reports.map(reportRow),
    totalRow(reports),
    ''
  ]

  if (run.warnings.length > 0) {
    lines.push('## Warnings', '', ...run.warnings.map((warning) => `- ${warning}`), '')
  }

  if (problems.length > 0) {
    lines.push('## Errors', '')
    for (const report of problems) {
      lines.push(`- ${report.script.id}: ${report.job.errors.at(-1)}`)
    }
    lines.push('')
  }

  lines.push(
    '## How to read the table',
    '',
    '- Fidelity: the beat texts, joined, equal the script once whitespace is ignored.',
    '- Coverage: beats with at least one completed asset, out of all beats.',
    '- Duplicates: assets picked for more than one beat.',
    '- Orientation: completed assets shaped like the platform (landscape for YouTube, portrait for Shorts, TikTok and Reels).',
    '- Resolution: completed videos with a long edge of at least 1,920 pixels, photos at least 1,880.',
    '- Clip length: completed videos that run 3 to 30 seconds.',
    '- LLM calls: HTTP requests sent to the provider, failed and retried ones included.',
    '- Input tokens include the cached ones; Cached is the part the provider served from its prompt cache.',
    '- Time: wall-clock seconds from the start of the job to its end.',
    '',
    'Relevance is not in the table. Open contact-sheet.html to score it.',
    ''
  )

  return lines.join('\n')
}
