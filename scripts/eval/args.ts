import { parseArgs } from 'node:util'
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_MODEL_IDS,
  type LlmProviderId
} from '../../src/shared/llm-defaults.ts'
import type { EvalEngine } from './report.ts'

/** The command line of the evaluation runner, and the environment variables it reads. */

export interface EvalArgs {
  help: boolean
  provider: LlmProviderId
  model: string
  engine: EvalEngine
  /** Script names from `--only`. Empty means every script. */
  only: string[]
  noDownload: boolean
  /** How long one script's job may run. */
  deadlineMs: number
}

export const PEXELS_KEY_VARIABLE = 'EVAL_PEXELS_KEY'

export const LLM_KEY_VARIABLES: Record<LlmProviderId, string> = {
  openai: 'EVAL_OPENAI_KEY',
  openrouter: 'EVAL_OPENROUTER_KEY',
  gemini: 'EVAL_GEMINI_KEY'
}

const DEFAULT_TIMEOUT_MINUTES = 30

export const USAGE = `Usage: npm run eval -- [options]

Runs the scripts in eval/scripts as real jobs against the LLM provider and Pexels,
and writes the results to eval-results/<timestamp>/.

Options:
  --provider <name>    openai, openrouter or gemini (default: ${DEFAULT_LLM_PROVIDER})
  --model <id>         model id (default: the app's default model for the provider)
  --pipeline <engine>  loop or pipeline (default: loop; pipeline needs plan 08)
  --only <script>      run one script: its number (3), id (03-five-facts) or file name;
                       repeat the flag or separate names with commas
  --no-download        do not fetch media files; write small placeholders instead
  --timeout <minutes>  cancel a script's job after this long (default: ${DEFAULT_TIMEOUT_MINUTES})
  --help               show this text

Keys are read from environment variables only:
  ${PEXELS_KEY_VARIABLE}      always needed
  ${LLM_KEY_VARIABLES.openai}      for --provider openai
  ${LLM_KEY_VARIABLES.openrouter}  for --provider openrouter
  ${LLM_KEY_VARIABLES.gemini}      for --provider gemini`

function isProvider(value: string): value is LlmProviderId {
  return Object.hasOwn(DEFAULT_MODEL_IDS, value)
}

/** Parses the arguments after the script name. Throws with a message meant for the user. */
export function parseEvalArgs(argv: string[]): EvalArgs {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      provider: { type: 'string' },
      model: { type: 'string' },
      pipeline: { type: 'string' },
      only: { type: 'string', multiple: true },
      'no-download': { type: 'boolean' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  })

  const provider = values.provider ?? DEFAULT_LLM_PROVIDER
  if (!isProvider(provider)) {
    throw new Error(`--provider must be openai, openrouter or gemini; got "${provider}".`)
  }

  const engine = values.pipeline ?? 'loop'
  if (engine !== 'loop' && engine !== 'pipeline') {
    throw new Error(`--pipeline must be loop or pipeline; got "${engine}".`)
  }

  const minutes = values.timeout === undefined ? DEFAULT_TIMEOUT_MINUTES : Number(values.timeout)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`--timeout must be a number of minutes above zero; got "${values.timeout}".`)
  }

  const model = values.model?.trim()
  if (values.model !== undefined && !model) throw new Error('--model needs a model id.')

  return {
    help: values.help ?? false,
    provider,
    model: model || DEFAULT_MODEL_IDS[provider],
    engine,
    only: (values.only ?? [])
      .flatMap((entry) => entry.split(','))
      .map((name) => name.trim())
      .filter(Boolean),
    noDownload: values['no-download'] ?? false,
    deadlineMs: minutes * 60_000
  }
}

/**
 * The two keys a run needs, from the given environment. Throws with the names of the
 * variables that are missing. The keys are never read from the app's secret store.
 */
export function readEvalKeys(
  provider: LlmProviderId,
  env: Record<string, string | undefined>
): { llm: string; pexels: string } {
  const llmVariable = LLM_KEY_VARIABLES[provider]
  const llm = env[llmVariable]?.trim() ?? ''
  const pexels = env[PEXELS_KEY_VARIABLE]?.trim() ?? ''
  const missing = [...(llm ? [] : [llmVariable]), ...(pexels ? [] : [PEXELS_KEY_VARIABLE])]
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(' and ')}. The evaluation with --provider ${provider} needs ${llmVariable} and ${PEXELS_KEY_VARIABLE} set as environment variables. It does not read the app's saved keys.`
    )
  }
  return { llm, pexels }
}
