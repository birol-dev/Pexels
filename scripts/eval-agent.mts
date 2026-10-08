/**
 * The live evaluation runner. Start it with `npm run eval -- [options]`, which loads
 * test/support/register.mjs so the app's services get the electron stub and a
 * throwaway userData folder. The work is in scripts/eval/; eval/README.md explains it.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEvalArgs, readEvalKeys, USAGE, type EvalArgs } from './eval/args.ts'
import { loadEvalScripts, selectEvalScripts, type EvalScript } from './eval/eval-scripts.ts'
import { formatShare } from './eval/report.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The run stores the keys through the app's secret store, so it must not start with the
 * real electron module: that store would be the installed app's. The stub is recognised
 * by its version string.
 */
async function electronStubIsActive(): Promise<boolean> {
  try {
    const electron = await import('electron')
    return electron.app?.getVersion?.() === '0.0.0-test'
  } catch {
    return false
  }
}

/** The commit under test, for the summary. Null outside a git checkout. */
function currentCommit(): string | null {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    const hash = git(['rev-parse', '--short', 'HEAD']).trim()
    const dirty = git(['status', '--porcelain']).trim() !== ''
    return dirty ? `${hash} with uncommitted changes` : hash
  } catch {
    return null
  }
}

async function main(): Promise<number> {
  let args: EvalArgs
  let scripts: EvalScript[]
  let keys: { llm: string; pexels: string }
  try {
    args = parseEvalArgs(process.argv.slice(2))
    if (args.help) {
      console.log(USAGE)
      return 0
    }
    scripts = selectEvalScripts(await loadEvalScripts(join(root, 'eval', 'scripts')), args.only)
    keys = readEvalKeys(args.provider, process.env)
  } catch (error) {
    console.error(`${errorMessage(error)}\n\nRun "npm run eval -- --help" for the options.`)
    return 1
  }

  if (!(await electronStubIsActive())) {
    console.error(
      'The electron stub is not loaded, so the run would use the real app\'s storage. Start the evaluation with "npm run eval", or pass "--import ./test/support/register.mjs" to node.'
    )
    return 1
  }

  // Imported only now: these modules load the app's services, which need the stub.
  const { clearEvalKeys, runEval } = await import('./eval/run-eval.ts')

  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-')
  const outDir = join(root, 'eval-results', stamp)
  const cacheDir = join(root, 'eval-cache')

  // Ctrl+C must not leave the keys behind in the throwaway userData folder.
  process.once('SIGINT', () => {
    console.error('\nInterrupted. Removing the stored keys.')
    void clearEvalKeys(args.provider).finally(() => process.exit(130))
  })

  console.log(
    `Running ${scripts.length} script(s) with ${args.provider} / ${args.model}. Results go to ${outDir}`
  )
  const result = await runEval({
    scripts,
    provider: args.provider,
    model: args.model,
    engine: args.engine,
    outDir,
    cacheDir,
    keys,
    deadlineMs: args.deadlineMs,
    noDownload: args.noDownload,
    commit: currentCommit(),
    onWarning: (warning) => console.warn(`Warning: ${warning}`),
    onReport: (report) => {
      const { metrics, network } = report
      console.log(
        `${report.script.id}: ${report.job.status}, ${report.beats.length} beats, coverage ${formatShare(metrics.coverage)}, ${metrics.cost.llmCalls} LLM calls, Pexels ${network.pexelsLive} live / ${network.pexelsReplayed} replayed, ${metrics.seconds} s`
      )
    }
  })

  console.log(`\nSummary:       ${result.files.summary}`)
  console.log(`Contact sheet: ${result.files.contactSheet}`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`The evaluation stopped: ${errorMessage(error)}`)
    process.exit(1)
  }
)
