import assert from 'node:assert/strict'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import {
  LLM_KEY_VARIABLES,
  parseEvalArgs,
  PEXELS_KEY_VARIABLE,
  readEvalKeys
} from '../../scripts/eval/args.ts'
import {
  loadEvalScripts,
  parseEvalScript,
  selectEvalScripts,
  type EvalScript
} from '../../scripts/eval/eval-scripts.ts'

function file(frontMatter: string[], body = 'One sentence. Another sentence.'): string {
  return ['---', ...frontMatter, '---', body, ''].join('\n')
}

describe('eval scripts: the file format', () => {
  it('reads the job options from the front matter and the narration from the rest', () => {
    const script = parseEvalScript(
      '07-lifestyle.txt',
      file(
        [
          'title: A slow Sunday',
          'about: People everywhere: the footage has to avoid them.',
          'platform: Instagram Reels',
          'style: lifestyle',
          'mix: videos only',
          'maxAssetsPerBeat: 2',
          'maxTotalDownloads: 12',
          'searchMode: broad',
          'avoidPeople: true'
        ],
        'Sunday is for slowing down.\n\nGood people, good food.'
      )
    )

    assert.deepEqual(script, {
      id: '07-lifestyle',
      file: '07-lifestyle.txt',
      about: 'People everywhere: the footage has to avoid them.',
      avoidPeople: true,
      input: {
        title: 'A slow Sunday',
        script: 'Sunday is for slowing down.\n\nGood people, good food.',
        platform: 'Instagram Reels',
        style: 'lifestyle',
        mix: 'videos only',
        maxAssetsPerBeat: 2,
        maxTotalDownloads: 12,
        searchMode: 'broad'
      }
    })
  })

  it('fills in defaults for the options a file leaves out', () => {
    const script = parseEvalScript('01-short.txt', file(['title: Short', 'platform: YouTube']))

    assert.equal(script.avoidPeople, false)
    assert.equal(script.about, '')
    assert.deepEqual(script.input, {
      title: 'Short',
      script: 'One sentence. Another sentence.',
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 15,
      searchMode: 'focused'
    })
  })

  it('starts an idea-mode job without a script, so the runner expands the idea', () => {
    const script = parseEvalScript(
      '10-idea.txt',
      file(
        [
          'title: Cats',
          'platform: TikTok',
          'inputMode: idea',
          'targetDuration: 30s',
          'tone: Playful'
        ],
        'Why do cats land on their feet?'
      )
    )

    assert.equal(script.input.inputMode, 'idea')
    assert.equal(script.input.script, '')
    assert.equal(script.input.idea, 'Why do cats land on their feet?')
    assert.equal(script.input.targetDuration, '30s')
    assert.equal(script.input.tone, 'Playful')
  })

  it('accepts Windows line endings and a byte-order mark', () => {
    const bom = String.fromCharCode(0xfeff)
    const content = `${bom}${file(['title: Short', 'platform: Shorts']).replace(/\n/g, '\r\n')}`
    const script = parseEvalScript('01-short.txt', content)

    assert.equal(script.input.platform, 'Shorts')
    assert.equal(script.input.script, 'One sentence. Another sentence.')
  })

  it('names the file and the problem when the front matter is wrong', () => {
    const cases: Array<[content: string, problem: RegExp]> = [
      [
        'Just a script without options.',
        /01-bad\.txt: the file must start with a front-matter block/
      ],
      [file(['platform: YouTube']), /needs a title/],
      [file(['title: No platform']), /needs a platform/],
      [file(['title: T', 'platform: Vimeo']), /platform must be one of YouTube, Shorts/],
      [file(['title: T', 'platform: YouTube', 'mix: gifs only']), /mix must be one of/],
      [
        file(['title: T', 'platform: YouTube', 'maxAssetsPerBeat: 11']),
        /whole number from 1 to 10/
      ],
      [
        file(['title: T', 'platform: YouTube', 'maxTotalDownloads: many']),
        /whole number from 1 to 100/
      ],
      [
        file(['title: T', 'platform: YouTube', 'avoidPeople: yes']),
        /avoidPeople must be true or false/
      ],
      [file(['title: T', 'platform: YouTube', 'colour: red']), /unknown option "colour"/],
      [file(['title: T', 'platform: YouTube', 'style:']), /option "style" has no value/],
      [file(['title: T', 'platform: YouTube'], '  '), /no text after the front matter/]
    ]
    for (const [content, problem] of cases) {
      assert.throws(() => parseEvalScript('01-bad.txt', content), problem)
    }
  })
})

describe('eval scripts: the ten shipped scripts', () => {
  let scripts: EvalScript[]
  const byNumber = (number: string): EvalScript => {
    const script = scripts.find((candidate) => candidate.id.startsWith(`${number}-`))
    assert.ok(script, `script ${number} exists`)
    return script
  }
  const sentences = (text: string): number => text.match(/[.!?](\s|$)/g)?.length ?? 0

  before(async () => {
    // Tests run from the repository root, like the import-specifier test.
    scripts = await loadEvalScripts(join('eval', 'scripts'))
  })

  it('are numbered 01 to 10 and all parse', () => {
    assert.deepEqual(
      scripts.map((script) => script.id.slice(0, 2)),
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']
    )
    for (const script of scripts) {
      assert.match(script.id, /^\d\d-[a-z0-9-]+$/)
      assert.ok(script.about, `${script.id} says what it stresses`)
      assert.ok((script.input.idea || script.input.script).length > 100, `${script.id} has text`)
    }
  })

  it('cover the cases the plan asks for', () => {
    assert.equal(byNumber('01').input.platform, 'Shorts', 'a vertical hook')
    assert.match(byNumber('02').input.script, /compound interest/i)
    assert.match(byNumber('03').input.script, /five/i)
    assert.match(byNumber('06').input.script, /iPhone|Samsung|Tesla/)
    assert.match(byNumber('09').input.script, /Bäcker/, 'a German script')

    assert.deepEqual(
      scripts.filter((script) => script.avoidPeople).map((script) => script.id.slice(0, 2)),
      ['07']
    )
    assert.deepEqual(
      scripts.filter((script) => script.input.inputMode === 'idea').map((s) => s.id.slice(0, 2)),
      ['10']
    )
  })

  it('include a deep dive with more sentences than its download cap allows beats', () => {
    const deepDive = byNumber('08')
    assert.ok(sentences(deepDive.input.script) >= 30)
    assert.ok(deepDive.input.maxTotalDownloads < sentences(deepDive.input.script))
  })
})

describe('eval scripts: --only', () => {
  const scripts = ['01-shorts-hook', '03-five-facts', '10-idea-mode'].map((id) =>
    parseEvalScript(`${id}.txt`, file(['title: T', 'platform: YouTube']))
  )
  const ids = (only: string[]): string[] => selectEvalScripts(scripts, only).map((s) => s.id)

  it('selects by number, id or file name, and keeps the usual order', () => {
    assert.deepEqual(ids([]), ['01-shorts-hook', '03-five-facts', '10-idea-mode'])
    assert.deepEqual(ids(['3']), ['03-five-facts'])
    assert.deepEqual(ids(['03']), ['03-five-facts'])
    assert.deepEqual(ids(['10-idea-mode', '1']), ['01-shorts-hook', '10-idea-mode'])
    assert.deepEqual(ids(['03-five-facts.txt', '3']), ['03-five-facts'])
  })

  it('names the scripts that exist when nothing matches', () => {
    assert.throws(() => ids(['4']), /No evaluation script matches "4"\. Scripts: 01-shorts-hook, /)
  })
})

describe('eval command line', () => {
  it('defaults to the app default provider and model, the loop engine and every script', () => {
    assert.deepEqual(parseEvalArgs([]), {
      help: false,
      provider: 'openai',
      model: 'gpt-4o',
      engine: 'loop',
      only: [],
      noDownload: false,
      deadlineMs: 30 * 60_000
    })
  })

  it('reads every flag', () => {
    const args = parseEvalArgs([
      '--provider',
      'gemini',
      '--model',
      'gemini-test-model',
      '--pipeline',
      'pipeline',
      '--only',
      '3,08-deep-dive',
      '--only=10',
      '--no-download',
      '--timeout',
      '2.5'
    ])
    assert.deepEqual(args, {
      help: false,
      provider: 'gemini',
      model: 'gemini-test-model',
      engine: 'pipeline',
      only: ['3', '08-deep-dive', '10'],
      noDownload: true,
      deadlineMs: 150_000
    })
    assert.equal(parseEvalArgs(['--help']).help, true)
  })

  it('uses the default model of the chosen provider', () => {
    assert.notEqual(parseEvalArgs(['--provider', 'openrouter']).model, parseEvalArgs([]).model)
  })

  it('rejects values it does not know', () => {
    assert.throws(() => parseEvalArgs(['--provider', 'claude']), /--provider must be openai/)
    assert.throws(
      () => parseEvalArgs(['--pipeline', 'fast']),
      /--pipeline must be loop or pipeline/
    )
    assert.throws(() => parseEvalArgs(['--timeout', '0']), /--timeout must be a number of minutes/)
    assert.throws(() => parseEvalArgs(['--model', ' ']), /--model needs a model id/)
    assert.throws(() => parseEvalArgs(['--frobnicate']), /Unknown option/)
    assert.throws(() => parseEvalArgs(['03-five-facts']), /positional/i)
  })

  it('takes the keys from the environment it is given', () => {
    const env = { EVAL_OPENAI_KEY: ' sk-one ', EVAL_GEMINI_KEY: 'gm-two', EVAL_PEXELS_KEY: 'px' }
    assert.deepEqual(readEvalKeys('openai', env), { llm: 'sk-one', pexels: 'px' })
    assert.deepEqual(readEvalKeys('gemini', env), { llm: 'gm-two', pexels: 'px' })
  })

  it('says which variables are missing', () => {
    assert.equal(PEXELS_KEY_VARIABLE, 'EVAL_PEXELS_KEY')
    assert.deepEqual(LLM_KEY_VARIABLES, {
      openai: 'EVAL_OPENAI_KEY',
      openrouter: 'EVAL_OPENROUTER_KEY',
      gemini: 'EVAL_GEMINI_KEY'
    })
    assert.throws(
      () => readEvalKeys('openrouter', { EVAL_OPENAI_KEY: 'sk-one', EVAL_PEXELS_KEY: 'px' }),
      /^Error: Missing EVAL_OPENROUTER_KEY\. /
    )
    assert.throws(() => readEvalKeys('openai', {}), /Missing EVAL_OPENAI_KEY and EVAL_PEXELS_KEY\./)
    assert.throws(() => readEvalKeys('openai', { EVAL_OPENAI_KEY: 'sk', EVAL_PEXELS_KEY: '  ' }), {
      message: /^Missing EVAL_PEXELS_KEY\./
    })
  })
})
