import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StartJobInput } from '../../src/main/services/agent/agent-runner.ts'

/**
 * An evaluation script is a text file: job options in a front-matter block between two
 * `---` lines, then the narration (or, with `inputMode: idea`, the idea to expand).
 * eval/README.md lists the keys.
 */

export interface EvalScript {
  /** The file name without its extension, for example `03-five-facts`. */
  id: string
  file: string
  /** What the script is meant to stress. */
  about: string
  /** Runs the job with the "Avoid people & faces" setting on. */
  avoidPeople: boolean
  /** What the job is started with, as the jobs:start handler would get it. */
  input: StartJobInput
}

const PLATFORMS = ['YouTube', 'Shorts', 'TikTok', 'Instagram Reels'] as const
const MIXES = ['videos only', 'photos only', 'videos + photos'] as const
const SEARCH_MODES = ['focused', 'broad'] as const
const INPUT_MODES = ['script', 'idea'] as const

const KEYS = [
  'title',
  'about',
  'platform',
  'style',
  'mix',
  'maxAssetsPerBeat',
  'maxTotalDownloads',
  'searchMode',
  'avoidPeople',
  'inputMode',
  'targetDuration',
  'tone'
] as const

type Key = (typeof KEYS)[number]

function oneOf<T extends string>(
  file: string,
  key: Key,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(`${file}: ${key} must be one of ${allowed.join(', ')}; got "${value}".`)
}

function wholeNumber(
  file: string,
  key: Key,
  value: string | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${file}: ${key} must be a whole number from ${min} to ${max}; got "${value}".`)
  }
  return number
}

function yesNo(file: string, key: Key, value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${file}: ${key} must be true or false; got "${value}".`)
}

/** Parses one script file. Throws with the file name when the front matter is wrong. */
export function parseEvalScript(file: string, content: string): EvalScript {
  const lines = content.split(/\r?\n/)
  // An editor may have saved the file with a byte-order mark.
  if (lines[0].charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1)
  const end = lines.indexOf('---', 1)
  if (lines[0] !== '---' || end === -1) {
    throw new Error(`${file}: the file must start with a front-matter block between two --- lines.`)
  }

  const options = new Map<Key, string>()
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    const key = (colon === -1 ? line : line.slice(0, colon)).trim()
    const value = colon === -1 ? '' : line.slice(colon + 1).trim()
    if (!(KEYS as readonly string[]).includes(key)) {
      throw new Error(`${file}: unknown option "${key}". Known options: ${KEYS.join(', ')}.`)
    }
    if (!value) throw new Error(`${file}: option "${key}" has no value.`)
    options.set(key as Key, value)
  }

  const body = lines
    .slice(end + 1)
    .join('\n')
    .trim()
  if (!body) throw new Error(`${file}: there is no text after the front matter.`)
  const title = options.get('title')
  if (!title) throw new Error(`${file}: the front matter needs a title.`)
  if (!options.has('platform')) throw new Error(`${file}: the front matter needs a platform.`)

  const inputMode = oneOf(file, 'inputMode', options.get('inputMode'), INPUT_MODES, 'script')
  const input: StartJobInput = {
    title,
    // In idea mode the job starts without a script and the runner expands the idea.
    script: inputMode === 'idea' ? '' : body,
    platform: oneOf(file, 'platform', options.get('platform'), PLATFORMS, 'YouTube'),
    style: options.get('style') ?? 'cinematic',
    mix: oneOf(file, 'mix', options.get('mix'), MIXES, 'videos + photos'),
    // The same limits as the jobs:start input schema.
    maxAssetsPerBeat: wholeNumber(
      file,
      'maxAssetsPerBeat',
      options.get('maxAssetsPerBeat'),
      1,
      10,
      1
    ),
    maxTotalDownloads: wholeNumber(
      file,
      'maxTotalDownloads',
      options.get('maxTotalDownloads'),
      1,
      100,
      15
    ),
    searchMode: oneOf(file, 'searchMode', options.get('searchMode'), SEARCH_MODES, 'focused')
  }
  if (inputMode === 'idea') {
    input.inputMode = 'idea'
    input.idea = body
  }
  if (options.has('targetDuration')) input.targetDuration = options.get('targetDuration')
  if (options.has('tone')) input.tone = options.get('tone')

  return {
    id: file.replace(/\.[^.]+$/, ''),
    file,
    about: options.get('about') ?? '',
    avoidPeople: yesNo(file, 'avoidPeople', options.get('avoidPeople')),
    input
  }
}

/** Every `.txt` file of the folder, in file-name order. */
export async function loadEvalScripts(dir: string): Promise<EvalScript[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.txt')).sort()
  return Promise.all(
    files.map(async (file) => parseEvalScript(file, await readFile(join(dir, file), 'utf8')))
  )
}

/**
 * The scripts `--only` names, in their usual order. A name is a script's number
 * (`3` or `03`), its id (`03-five-facts`), or its file name.
 */
export function selectEvalScripts(scripts: EvalScript[], only: string[]): EvalScript[] {
  if (only.length === 0) return scripts
  const wanted = new Set<EvalScript>()
  for (const name of only) {
    const number = /^\d+$/.test(name) ? name.padStart(2, '0') : null
    const match = scripts.find(
      (script) => script.id === name || script.file === name || script.id.split('-')[0] === number
    )
    if (!match) {
      throw new Error(
        `No evaluation script matches "${name}". Scripts: ${scripts.map((s) => s.id).join(', ')}.`
      )
    }
    wanted.add(match)
  }
  return scripts.filter((script) => wanted.has(script))
}
