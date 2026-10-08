import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { escapeHtml } from '../../scripts/eval/contact-sheet.ts'
import { parseEvalScript, type EvalScript } from '../../scripts/eval/eval-scripts.ts'
import type { ScriptReport } from '../../scripts/eval/report.ts'
import { runEval, type EvalOptions, type EvalResult } from '../../scripts/eval/run-eval.ts'
import { SecureSecrets } from '../../src/main/services/storage/secure-secrets.ts'
import {
  getDefaultSettings,
  SettingsStore,
  type PublicSettings
} from '../../src/main/services/storage/settings-store.ts'
import { installFakeNetwork, type FakeNetwork } from '../support/fake-network.ts'
import { photo, video, videoFileUrl } from '../support/pexels-fixtures.ts'
import {
  download,
  resetNetworkState,
  searchPhotos,
  searchVideos,
  select,
  submitBeats
} from '../support/run-job.ts'

const LLM_KEY = 'sk-eval-test-key'
const PEXELS_KEY = 'pexels-eval-test-key'

const TWO_BEATS = parseEvalScript(
  '01-two-beats.txt',
  ['---', 'title: Two beats', 'platform: YouTube', '---', 'One sentence. Another sentence.'].join(
    '\n'
  )
)

/** Scripts the job of the happy-path test: a video for beat 1 and a photo for beat 2. */
function scriptTwoBeatJob(network: FakeNetwork): void {
  const clip = video(101, 'city-street')
  const still = photo(201, 'A quiet desk')
  network.pexels.videos('city street', [clip]).photos('quiet desk', [still])
  network.llm
    .tools([submitBeats(['One sentence.', 'Another sentence.'])])
    .tools([searchVideos('beat_1', 'city street'), searchPhotos('beat_2', 'quiet desk')])
    .tools([
      select([
        {
          beatId: 'beat_1',
          assetType: 'video',
          pexelsId: 101,
          variantUrl: videoFileUrl(clip, 'hd')
        },
        { beatId: 'beat_2', assetType: 'photo', pexelsId: 201, variantUrl: still.src.original }
      ])
    ])
    .tools([
      download([
        { assetType: 'video', pexelsId: 101 },
        { assetType: 'photo', pexelsId: 201 }
      ])
    ])
}

describe('eval: a dry run on the fake network', () => {
  let network: FakeNetwork
  let root: string
  let runs = 0

  /** Runs the evaluation's job function with test keys, into a fresh run folder. */
  const dryRun = (scripts: EvalScript[], options: Partial<EvalOptions> = {}): Promise<EvalResult> =>
    runEval({
      scripts,
      provider: 'openai',
      model: 'gpt-4o',
      engine: 'loop',
      outDir: join(root, 'results', `2026-01-02T03-04-0${runs++}Z`),
      cacheDir: join(root, 'cache'),
      keys: { llm: LLM_KEY, pexels: PEXELS_KEY },
      deadlineMs: 10_000,
      commit: 'abc1234',
      ...options
    })

  beforeEach(async () => {
    resetNetworkState()
    network = installFakeNetwork()
    root = await mkdtemp(join(tmpdir(), 'stockfinder-eval-run-'))
    runs = 0
  })

  afterEach(async () => {
    network.restore()
    await rm(root, { recursive: true, force: true })
  })

  it('writes report.json, summary.md and contact-sheet.html with sane numbers', async () => {
    scriptTwoBeatJob(network)
    const fakeFetch = globalThis.fetch

    const result = await dryRun([TWO_BEATS])

    assert.deepEqual(network.problems, [])
    assert.equal(network.llm.remaining(), 0, 'every scripted reply was used')
    assert.equal(globalThis.fetch, fakeFetch, 'the evaluation layer was taken off again')

    const outDir = join(root, 'results', '2026-01-02T03-04-00Z')
    assert.deepEqual(result.files, {
      summary: join(outDir, 'summary.md'),
      contactSheet: join(outDir, 'contact-sheet.html'),
      reports: [join(outDir, '01-two-beats', 'report.json')]
    })

    // report.json
    const [report] = result.reports
    const onDisk = JSON.parse(await readFile(result.files.reports[0], 'utf8')) as ScriptReport
    assert.deepEqual(onDisk, JSON.parse(JSON.stringify(report)))
    assert.equal(report.job.status, 'completed')
    assert.equal(report.job.timedOut, false)
    assert.deepEqual(report.job.errors, [])
    assert.equal(report.narration, 'One sentence. Another sentence.')
    assert.deepEqual(
      report.beats.map((beat) => beat.text),
      ['One sentence.', 'Another sentence.']
    )
    assert.deepEqual(report.run.engine, { requested: 'loop', effective: 'loop' })

    const { seconds, ...metrics } = report.metrics
    assert.deepEqual(metrics, {
      scriptFidelity: true,
      coverage: { count: 2, total: 2, ratio: 1 },
      duplicates: { count: 0, assetIds: [] },
      orientationMatch: { count: 2, total: 2, ratio: 1 },
      resolution: { count: 2, total: 2, ratio: 1 },
      clipLength: { count: 1, total: 1, ratio: 1 },
      // Four LLM requests, each answered with 100 input and 20 output tokens.
      cost: { llmCalls: 4, inputTokens: 400, cachedInputTokens: 0, outputTokens: 80 }
    })
    assert.ok(seconds >= 0 && seconds < 10, `the job took ${seconds} s`)
    assert.deepEqual(report.network, {
      llmFailedCalls: 0,
      pexelsLive: 2,
      pexelsReplayed: 0,
      mediaRequests: 2
    })
    assert.equal(report.runnerUsage?.totalTokens, 4 * 120, 'the wire count agrees with the runner')

    // The job's project folder is inside the run folder, with the downloads in it.
    const assets = report.beats.flatMap((beat) => beat.assets)
    assert.deepEqual(
      assets.map((asset) => asset.id),
      ['video_101', 'photo_201']
    )
    assert.match(report.job.projectDir ?? '', /^01-two-beats\/[^/]+$/)
    for (const asset of assets) {
      const file = asset.file ?? ''
      assert.ok(file.startsWith(`${report.job.projectDir}/`), `${asset.id} has a file`)
      assert.ok(existsSync(join(outDir, ...file.split('/'))), `${asset.id} is on disk`)
    }

    // summary.md
    const summary = await readFile(result.files.summary, 'utf8')
    assert.match(summary, /^- Provider and model: openai \/ gpt-4o$/m)
    assert.match(summary, /^- Pexels API requests: 2 live, 0 replayed from the cache$/m)
    assert.match(
      summary,
      /^\| 01-two-beats \| completed \| 2 \| yes \| 2\/2 \(100%\) \| 0 \| 2\/2 \(100%\) \| 2\/2 \(100%\) \| 1\/1 \(100%\) \| 4 \| 400 \| 0 \| 80 \| \d+ \|$/m
    )

    // contact-sheet.html
    const sheet = await readFile(result.files.contactSheet, 'utf8')
    assert.equal(sheet.match(/<article class="beat"/g)?.length, 2)
    assert.match(sheet, /<p class="text">One sentence\.<\/p>/)
    for (const asset of assets) {
      assert.match(asset.thumbnailUrl, /^https:\/\/images\.pexels\.com\//)
      assert.ok(sheet.includes(`<img src="${escapeHtml(asset.thumbnailUrl)}"`), asset.id)
    }
    assert.doesNotMatch(sheet, /<script[^>]*\ssrc=/)

    // The keys are in no output file, and are gone from the throwaway secret store.
    const cacheFiles = await readdir(join(root, 'cache'))
    assert.equal(cacheFiles.length, 2, 'both Pexels searches were recorded')
    const written = [
      summary,
      sheet,
      JSON.stringify(onDisk),
      ...(await Promise.all(cacheFiles.map((file) => readFile(join(root, 'cache', file), 'utf8'))))
    ].join('\n')
    assert.ok(!written.includes(LLM_KEY) && !written.includes(PEXELS_KEY))
    assert.equal(await SecureSecrets.hasSecret('openaiKey'), false)
    assert.equal(await SecureSecrets.hasSecret('pexelsKey'), false)
  })

  it('replays Pexels from the cache on a second run, with the quota still tracked', async () => {
    scriptTwoBeatJob(network)
    await dryRun([TWO_BEATS])
    const pexelsRequests = network.pexelsRequests().length
    assert.equal(pexelsRequests, 2)

    // A later run is a new process: the app remembers no search and no quota.
    resetNetworkState()
    scriptTwoBeatJob(network)
    const second = await dryRun([TWO_BEATS])

    assert.deepEqual(network.problems, [])
    assert.equal(network.pexelsRequests().length, pexelsRequests, 'no new Pexels request was made')
    const [report] = second.reports
    assert.equal(report.job.status, 'completed')
    assert.deepEqual(report.metrics.coverage, { count: 2, total: 2, ratio: 1 })
    assert.deepEqual(report.network, {
      llmFailedCalls: 0,
      pexelsLive: 0,
      pexelsReplayed: 2,
      mediaRequests: 2
    })
    // The quota in the manifest can only have come from the replayed headers.
    const quota = report.pexelsQuota as { limit: number; remaining: number; resetAt: number }
    assert.equal(quota.limit, network.pexels.quota.limit)
    assert.equal(quota.remaining, network.pexels.quota.remaining)
    assert.equal(quota.resetAt, network.pexels.quota.resetAt)
  })

  it('skips the media downloads when asked to', async () => {
    scriptTwoBeatJob(network)

    const result = await dryRun([TWO_BEATS], { noDownload: true })

    assert.deepEqual(network.problems, [])
    assert.equal(network.mediaRequests().length, 0, 'no media request reached the network')
    const [report] = result.reports
    assert.equal(report.job.status, 'completed')
    assert.equal(report.network.mediaRequests, 2)
    assert.deepEqual(report.metrics.coverage, { count: 2, total: 2, ratio: 1 })
    assert.equal(report.run.noDownload, true)
    assert.match(result.run.warnings.join('\n'), /--no-download/)
    assert.match(await readFile(result.files.summary, 'utf8'), /## Warnings/)
  })

  it('counts the idea expansion and compares the beats with the expanded script', async () => {
    const idea = parseEvalScript(
      '10-idea.txt',
      [
        '---',
        'title: How cats land',
        'platform: TikTok',
        'mix: videos only',
        'inputMode: idea',
        'targetDuration: 30s',
        '---',
        'Why do cats land on their feet?'
      ].join('\n')
    )
    const expanded = 'A falling cat twists in the air and lands on its feet.'
    const clip = video(301, 'cat-jump', [['hd', 1080, 1920]], 8)
    network.pexels.videos('cat jumping', [clip])
    network.llm
      .tools([
        {
          name: 'submit_expanded_script',
          args: { title: 'Cats', script: expanded, visualConcept: 'Slow motion cats.' }
        }
      ])
      .tools([submitBeats([expanded])])
      .tools([searchVideos('beat_1', 'cat jumping')])
      .tools([
        select([
          {
            beatId: 'beat_1',
            assetType: 'video',
            pexelsId: 301,
            variantUrl: videoFileUrl(clip, 'hd')
          }
        ])
      ])
      .tools([download([{ assetType: 'video', pexelsId: 301 }])])

    const result = await dryRun([idea])

    assert.deepEqual(network.problems, [])
    const [report] = result.reports
    assert.equal(report.job.status, 'completed')
    assert.equal(report.script.inputMode, 'idea')
    assert.equal(report.narration, expanded)
    assert.equal(report.metrics.scriptFidelity, true)
    assert.deepEqual(report.metrics.orientationMatch, { count: 1, total: 1, ratio: 1 })
    assert.deepEqual(report.metrics.clipLength, { count: 1, total: 1, ratio: 1 })
    // Five requests on the wire: the expansion, the beat split and three agent turns.
    assert.deepEqual(report.metrics.cost, {
      llmCalls: 5,
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 100
    })
    assert.equal(idea.input.script, '', 'the script object of the run is left as it was')
  })

  it('still writes a report when the job fails, and carries on with the next script', async () => {
    const failing = { ...TWO_BEATS, id: '01-fails', file: '01-fails.txt' }
    const working = { ...TWO_BEATS, id: '02-works', file: '02-works.txt' }
    network.llm.error(400, 'This model is not available.')
    scriptTwoBeatJob(network)

    const result = await dryRun([failing, working])

    assert.deepEqual(network.problems, [])
    const [failed, completed] = result.reports
    assert.equal(failed.job.status, 'failed')
    assert.match(failed.job.errors.join('\n'), /This model is not available/)
    assert.deepEqual(failed.beats, [])
    assert.equal(failed.metrics.scriptFidelity, false)
    assert.deepEqual(failed.metrics.coverage, { count: 0, total: 0, ratio: null })
    assert.equal(failed.metrics.cost.llmCalls, 1)
    assert.equal(failed.network.llmFailedCalls, 1)
    assert.ok(existsSync(result.files.reports[0]))

    assert.equal(completed.job.status, 'completed')
    assert.equal(completed.metrics.cost.llmCalls, 4, 'each script is counted on its own')

    const summary = await readFile(result.files.summary, 'utf8')
    assert.match(summary, /^\| 01-fails \| failed \| 0 \| no \| n\/a \|/m)
    assert.match(summary, /^\| \*\*Total\*\* \| 1\/2 completed \| 2 \| 1\/2 \|/m)
    assert.match(summary, /^- 01-fails: .*This model is not available/m)
  })

  it('cancels a job that runs past the deadline and reports it as timed out', async () => {
    // An LLM that never answers, but lets go when the request is aborted.
    const fakeFetch = globalThis.fetch
    globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        )
      })) as typeof globalThis.fetch

    try {
      const result = await dryRun([TWO_BEATS], { deadlineMs: 150 })

      const [report] = result.reports
      assert.equal(report.job.status, 'cancelled')
      assert.equal(report.job.timedOut, true)
      assert.match(report.job.errors.at(-1) ?? '', /ran past the deadline/)
      assert.equal(report.metrics.cost.llmCalls, 1)
      assert.equal(report.network.llmFailedCalls, 1)
      assert.match(
        await readFile(result.files.summary, 'utf8'),
        /^\| 01-two-beats \| cancelled \(timed out\) \| 0 \| no \|/m
      )
    } finally {
      globalThis.fetch = fakeFetch
    }
  })

  it('passes --pipeline through to the agentEngine setting', async () => {
    const result = await dryRun([], { engine: 'pipeline' })

    const settings = (await SettingsStore.getSettings()) as PublicSettings & {
      agentEngine?: unknown
    }
    assert.equal(settings.agentEngine, 'pipeline', 'the settings store was handed the engine')
    assert.equal(result.run.engine.requested, 'pipeline')

    const summary = await readFile(result.files.summary, 'utf8')
    if ('agentEngine' in getDefaultSettings()) {
      // Plan 08 has landed: the app knows the setting, so the request is honoured.
      assert.equal(result.run.engine.effective, 'pipeline')
      assert.deepEqual(result.run.warnings, [])
    } else {
      // Until then the store keeps the key, nothing reads it, and the run says so.
      assert.equal(result.run.engine.effective, 'loop')
      assert.equal(result.run.warnings.length, 1)
      assert.match(result.run.warnings[0], /ignored .* plan 08/)
      assert.match(summary, /^- Engine: loop \(pipeline was requested and ignored\)$/m)
      assert.match(summary, /## Warnings/)
    }
  })

  it('does not warn about the engine when the loop is asked for', async () => {
    const warnings: string[] = []
    const result = await dryRun([], { onWarning: (warning) => warnings.push(warning) })

    assert.deepEqual(result.run.engine, { requested: 'loop', effective: 'loop' })
    assert.deepEqual(warnings, [])
    assert.deepEqual(result.reports, [])
  })
})
