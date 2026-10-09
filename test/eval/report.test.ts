import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runInNewContext } from 'node:vm'
import { escapeHtml, renderContactSheet } from '../../scripts/eval/contact-sheet.ts'
import type { EvalMetrics } from '../../scripts/eval/metrics.ts'
import {
  formatShare,
  renderSummary,
  type ReportAsset,
  type ReportBeat,
  type RunInfo,
  type ScriptReport
} from '../../scripts/eval/report.ts'

const RUN: RunInfo = {
  id: '2026-01-02T03-04-05Z',
  provider: 'openai',
  model: 'gpt-4o',
  engine: { requested: 'loop', effective: 'loop' },
  noDownload: false,
  commit: 'abc1234',
  warnings: []
}

const NO_METRICS: EvalMetrics = {
  scriptFidelity: false,
  coverage: { count: 0, total: 0, ratio: null },
  duplicates: { count: 0, assetIds: [] },
  orientationMatch: { count: 0, total: 0, ratio: null },
  resolution: { count: 0, total: 0, ratio: null },
  clipLength: { count: 0, total: 0, ratio: null },
  cost: { llmCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  seconds: 0
}

function asset(overrides: Partial<ReportAsset> = {}): ReportAsset {
  return {
    id: 'video_101',
    type: 'video',
    pexelsId: 101,
    width: 3840,
    height: 2160,
    duration: 12,
    status: 'completed',
    query: 'city street',
    photographer: 'Test Creator',
    pageUrl: 'https://www.pexels.com/video/city-street-101/',
    thumbnailUrl: 'https://images.pexels.com/videos/101/pictures/preview-0.jpeg',
    file: '01-first/First-job_1/videos/city street 101.mp4',
    ...overrides
  }
}

function beat(id: string, text: string, assets: ReportAsset[] = [asset()]): ReportBeat {
  return {
    id,
    text,
    visualPrompt: 'a busy street at dusk',
    searchQueries: ['city street'],
    status: 'completed',
    assets
  }
}

function scriptReport(
  id: string,
  beats: ReportBeat[],
  overrides: {
    status?: ScriptReport['job']['status']
    errors?: string[]
    metrics?: Partial<EvalMetrics>
  } = {}
): ScriptReport {
  return {
    schemaVersion: 1,
    script: {
      id,
      file: `${id}.txt`,
      title: `Title of ${id}`,
      about: 'What this script stresses.',
      platform: 'YouTube',
      style: 'cinematic',
      mix: 'videos + photos',
      searchMode: 'focused',
      inputMode: 'script',
      avoidPeople: false,
      maxAssetsPerBeat: 1,
      maxTotalDownloads: 10
    },
    run: {
      provider: RUN.provider,
      model: RUN.model,
      engine: RUN.engine,
      noDownload: false,
      startedAt: '2026-01-02T03:04:05.000Z',
      finishedAt: '2026-01-02T03:05:19.000Z'
    },
    job: {
      jobId: 'job_1',
      status: overrides.status ?? 'completed',
      timedOut: false,
      projectDir: `${id}/First-job_1`,
      errors: overrides.errors ?? []
    },
    metrics: { ...NO_METRICS, ...overrides.metrics },
    network: { llmFailedCalls: 0, pexelsLive: 3, pexelsReplayed: 1, mediaRequests: beats.length },
    runnerUsage: null,
    pexelsQuota: null,
    narration: beats.map((item) => item.text).join(' '),
    beats
  }
}

describe('eval summary', () => {
  const first = scriptReport('01-first', [beat('beat_1', 'One.'), beat('beat_2', 'Two.')], {
    metrics: {
      scriptFidelity: true,
      coverage: { count: 2, total: 2, ratio: 1 },
      duplicates: { count: 1, assetIds: ['video_101'] },
      orientationMatch: { count: 1, total: 2, ratio: 0.5 },
      resolution: { count: 2, total: 2, ratio: 1 },
      cost: { llmCalls: 9, inputTokens: 41200, cachedInputTokens: 30100, outputTokens: 2345 },
      seconds: 74
    }
  })
  const second = scriptReport('02-second', [], {
    status: 'failed',
    errors: ['Request timed out.', 'Agent execution failed: HTTP 400'],
    metrics: { cost: { ...NO_METRICS.cost, llmCalls: 1 }, seconds: 2 }
  })
  const lines = renderSummary(RUN, [first, second]).split('\n')

  it('formats a share as a count and a percentage', () => {
    assert.equal(formatShare({ count: 7, total: 8, ratio: 7 / 8 }), '7/8 (88%)')
    assert.equal(formatShare({ count: 0, total: 3, ratio: 0 }), '0/3 (0%)')
    assert.equal(formatShare({ count: 0, total: 0, ratio: null }), 'n/a')
  })

  it('says what was run', () => {
    assert.equal(lines[0], '# Evaluation run 2026-01-02T03-04-05Z')
    assert.ok(lines.includes('- Provider and model: openai / gpt-4o'))
    assert.ok(lines.includes('- Engine: loop'))
    assert.ok(lines.includes('- Commit: abc1234'))
    assert.ok(lines.includes('- Pexels API requests: 6 live, 2 replayed from the cache'))
    assert.ok(lines.includes('- Media requests: 2'))
  })

  it('has a column for every metric of the plan', () => {
    assert.ok(
      lines.includes(
        '| Script | Status | Beats | Fidelity | Coverage | Duplicates | Orientation | Resolution | Clip length | LLM calls | Input tokens | Cached | Output tokens | Time (s) |'
      )
    )
  })

  it('has one row per script and a total', () => {
    assert.ok(
      lines.includes(
        '| 01-first | completed | 2 | yes | 2/2 (100%) | 1 | 1/2 (50%) | 2/2 (100%) | n/a | 9 | 41,200 | 30,100 | 2,345 | 74 |'
      )
    )
    assert.ok(
      lines.includes(
        '| 02-second | failed | 0 | no | n/a | 0 | n/a | n/a | n/a | 1 | 0 | 0 | 0 | 2 |'
      )
    )
    assert.ok(
      lines.includes(
        '| **Total** | 1/2 completed | 2 | 1/2 | 2/2 (100%) | 1 | 1/2 (50%) | 2/2 (100%) | n/a | 10 | 41,200 | 30,100 | 2,345 | 76 |'
      )
    )
  })

  it('lists the last error of each script that had one', () => {
    assert.ok(lines.includes('## Errors'))
    assert.ok(lines.includes('- 02-second: Agent execution failed: HTTP 400'))
    assert.ok(!lines.some((line) => line.startsWith('- 01-first:')))
  })

  it('shows warnings and an ignored engine request', () => {
    const run: RunInfo = {
      ...RUN,
      engine: { requested: 'pipeline', effective: 'loop' },
      noDownload: true,
      commit: null,
      warnings: ['The settings store did not keep the engine.']
    }
    const text = renderSummary(run, [first])

    assert.match(text, /^- Engine: loop \(pipeline was requested and ignored\)$/m)
    assert.match(text, /^- Commit: unknown$/m)
    assert.match(text, /^- Media requests: 2 \(answered with placeholders: --no-download\)$/m)
    assert.match(text, /^## Warnings\n\n- The settings store did not keep the engine.$/m)
    assert.doesNotMatch(text, /## Errors/)
  })

  it('renders a run without scripts', () => {
    const text = renderSummary(RUN, [])
    assert.match(text, /\| \*\*Total\*\* \| 0\/0 completed \| 0 \| 0\/0 \| n\/a \|/)
  })
})

describe('eval contact sheet: the page', () => {
  const hostile = '<script>alert("beat")</script> & more'
  const reports = [
    scriptReport('01-first', [
      beat('beat_1', 'A street at dusk.'),
      beat('beat_2', hostile, [
        asset({
          id: 'photo_201',
          type: 'photo',
          pexelsId: 201,
          duration: undefined,
          photographer: '"><img src=x onerror=alert(1)>',
          query: 'desk "quiet"',
          thumbnailUrl:
            'https://images.pexels.com/photos/201/pexels-photo-201.jpeg?auto=compress&h=350',
          file: null
        }),
        asset({
          id: 'video_9',
          pexelsId: 9,
          thumbnailUrl: 'javascript:alert(1)',
          pageUrl: 'data:text/html,x'
        })
      ])
    ]),
    scriptReport('02-second', [beat('beat_1', 'Nothing was found.', [])], {
      status: 'failed',
      errors: ['Agent execution failed: <b>HTTP 400</b>']
    })
  ]
  const html = renderContactSheet({ ...RUN, model: 'gpt-4o</script><script>alert(2)' }, reports)

  it('is one self-contained file: no external script, stylesheet or frame', () => {
    assert.match(html, /^<!doctype html>/)
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    assert.deepEqual(scripts, ['<script type="application/json" id="run-meta">', '<script>'])
    assert.doesNotMatch(html, /<link\b|<iframe\b|<object\b|<embed\b|@import|url\(/i)
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src https:;/)
  })

  it('shows each beat with its text, its thumbnails and three score buttons', () => {
    assert.equal(html.match(/<article class="beat"/g)?.length, 3)
    assert.match(
      html,
      /<article class="beat" data-script="01-first" data-beat="beat_1" data-rated="">/
    )
    assert.match(html, /<p class="text">A street at dusk\.<\/p>/)
    assert.match(html, /<p class="muted">Visual prompt: a busy street at dusk<\/p>/)
    assert.equal(html.match(/<button type="button" data-score="(good|ok|bad)"/g)?.length, 9)
    assert.match(html, /<button type="button" id="copy-scores">Copy scores<\/button>/)
    assert.match(
      html,
      /<img src="https:\/\/images\.pexels\.com\/videos\/101\/pictures\/preview-0\.jpeg" alt="video 101 by Test Creator"/
    )
    assert.match(html, /No asset was chosen for this beat\./)
  })

  it('links a thumbnail to the downloaded file, or to the Pexels page when there is none', () => {
    assert.ok(
      html.includes('<a href="01-first/First-job_1/videos/city%20street%20101.mp4" target="_blank"')
    )
    assert.ok(
      html.includes(
        '<img src="https://images.pexels.com/photos/201/pexels-photo-201.jpeg?auto=compress&amp;h=350"'
      )
    )
  })

  it('escapes everything that came from the job', () => {
    assert.ok(html.includes(escapeHtml(hostile)))
    assert.ok(html.includes('Agent execution failed: &lt;b&gt;HTTP 400&lt;/b&gt;'))
    assert.ok(html.includes('found with "desk &quot;quiet&quot;"'))
    assert.ok(html.includes('alt="photo 201 by &quot;&gt;&lt;img src=x onerror=alert(1)&gt;"'))
    assert.doesNotMatch(html, /<script>alert|<img src=x|<b>HTTP/)
    assert.equal(html.match(/<\/script>/g)?.length, 2, 'the model id cannot close a script element')
  })

  it('leaves out asset URLs that are not https', () => {
    assert.doesNotMatch(html, /javascript:|data:text/)
    assert.match(html, /<span class="no-thumb muted">no thumbnail<\/span>/)
  })
})

/** The few DOM features the page script uses, enough to run it outside a browser. */
interface FakeElement {
  dataset: Record<string, string>
  attributes: Record<string, string>
  textContent: string
  value: string
  open: boolean
  /** Set by select(), which the page calls before the copy command of old browsers. */
  selected: boolean
  parent: FakeElement | null
  children: FakeElement[]
  listeners: Array<(event: { target: FakeElement }) => void>
  setAttribute(name: string, value: string): void
  querySelectorAll(selector: string): FakeElement[]
  closest(selector: string): FakeElement | null
  addEventListener(type: string, listener: (event: { target: FakeElement }) => void): void
  focus(): void
  select(): void
}

function element(
  dataset: Record<string, string> = {},
  parent: FakeElement | null = null
): FakeElement {
  const self: FakeElement = {
    dataset,
    attributes: {},
    textContent: '',
    value: '',
    open: false,
    selected: false,
    parent,
    children: [],
    listeners: [],
    setAttribute(name, value) {
      self.attributes[name] = value
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'button[data-score]')
      return self.children
    },
    closest(selector) {
      if (selector === 'button[data-score]') return self.dataset.score ? self : null
      assert.equal(selector, '[data-beat]')
      return self.dataset.beat ? self : (self.parent?.closest(selector) ?? null)
    },
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      self.listeners.push(listener)
    },
    focus() {
      self.selected = false
    },
    select() {
      self.selected = true
    }
  }
  parent?.children.push(self)
  return self
}

interface FakePage {
  beats: FakeElement[]
  progress: FakeElement
  output: FakeElement
  copyStatus: FakeElement
  details: FakeElement
  /** What the page put on the clipboard through the clipboard API. */
  copied: string[]
  /** Clicks the score button of a beat, as the document-level listener would see it. */
  score(beatIndex: number, score: 'good' | 'ok' | 'bad'): void
  clickCopy(): Promise<void>
}

/**
 * Runs the contact sheet's own script against a fake page built from its markup.
 * `clipboard` says whether the browser has the clipboard API; without it the page
 * falls back to the copy command, which answers `copyCommandWorks`.
 */
function openPage(
  html: string,
  storage: Map<string, string>,
  browser: { clipboard: boolean; copyCommandWorks?: boolean } = { clipboard: true }
): FakePage {
  const meta = html.match(/<script type="application\/json" id="run-meta">([\s\S]*?)<\/script>/)
  const code = html.match(/<script>([\s\S]*?)<\/script>/)
  assert.ok(meta && code, 'the page has a data block and a script')

  const beats = [
    ...html.matchAll(/<article class="beat" data-script="([^"]+)" data-beat="([^"]+)"/g)
  ].map(([, script, beatId]) => {
    const article = element({ script, beat: beatId })
    for (const score of ['good', 'ok', 'bad']) element({ score }, article)
    return article
  })
  const byId: Record<string, FakeElement> = {
    'run-meta': element(),
    'scores-json': element(),
    'scores-details': element(),
    'copy-scores': element(),
    'copy-status': element(),
    progress: element()
  }
  byId['run-meta'].textContent = meta[1]
  const documentListeners: Array<(event: { target: FakeElement }) => void> = []
  const copied: string[] = []

  runInNewContext(code[1], {
    document: {
      getElementById: (id: string) => byId[id],
      querySelectorAll: (selector: string) => {
        assert.equal(selector, '[data-beat]')
        return beats
      },
      addEventListener: (type: string, listener: (event: { target: FakeElement }) => void) => {
        assert.equal(type, 'click')
        documentListeners.push(listener)
      },
      execCommand: (command: string) => {
        assert.equal(command, 'copy')
        return browser.copyCommandWorks ?? false
      }
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    navigator: browser.clipboard
      ? {
          clipboard: {
            writeText: async (text: string) => {
              copied.push(text)
            }
          }
        }
      : {}
  })

  return {
    beats,
    progress: byId.progress,
    output: byId['scores-json'],
    copyStatus: byId['copy-status'],
    details: byId['scores-details'],
    copied,
    score(beatIndex, score) {
      const button = beats[beatIndex].children.find((child) => child.dataset.score === score)
      assert.ok(button)
      for (const listener of documentListeners) listener({ target: button })
    },
    async clickCopy() {
      for (const listener of byId['copy-scores'].listeners)
        listener({ target: byId['copy-scores'] })
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
}

describe('eval contact sheet: scoring', () => {
  const html = renderContactSheet(RUN, [
    scriptReport('01-first', [beat('beat_1', 'One.'), beat('beat_2', 'Two.')]),
    scriptReport('02-second', [beat('beat_1', 'Three.')])
  ])

  it('starts with every beat unrated', () => {
    const page = openPage(html, new Map())

    assert.equal(page.progress.textContent, '0 of 3 beats scored: 0 good, 0 ok, 0 bad')
    assert.deepEqual(JSON.parse(page.output.value).scores, {
      '01-first': { beat_1: null, beat_2: null },
      '02-second': { beat_1: null }
    })
  })

  it('records a score, shows it on the buttons, and clears it on a second click', () => {
    const page = openPage(html, new Map())

    page.score(0, 'good')
    page.score(2, 'bad')
    page.score(2, 'ok')

    assert.equal(page.progress.textContent, '2 of 3 beats scored: 1 good, 1 ok, 0 bad')
    assert.equal(page.beats[0].dataset.rated, 'good')
    assert.deepEqual(
      page.beats[2].children.map((button) => button.attributes['aria-pressed']),
      ['false', 'true', 'false']
    )

    page.score(0, 'good')
    assert.equal(page.beats[0].dataset.rated, '')
    assert.equal(page.progress.textContent, '1 of 3 beats scored: 0 good, 1 ok, 0 bad')
  })

  it('copies the scores as JSON for scores.json', async () => {
    const page = openPage(html, new Map())
    page.score(0, 'good')
    page.score(1, 'bad')

    await page.clickCopy()

    assert.equal(page.copied.length, 1)
    const scores = JSON.parse(page.copied[0]) as Record<string, unknown>
    assert.ok(!Number.isNaN(Date.parse(String(scores.scoredAt))))
    delete scores.scoredAt
    assert.deepEqual(scores, {
      run: '2026-01-02T03-04-05Z',
      provider: 'openai',
      model: 'gpt-4o',
      engine: 'loop',
      commit: 'abc1234',
      totals: { good: 1, ok: 0, bad: 1, unrated: 1 },
      scores: {
        '01-first': { beat_1: 'good', beat_2: 'bad' },
        '02-second': { beat_1: null }
      }
    })
    assert.equal(page.copyStatus.textContent, 'Copied. Save it as scores.json in this folder.')
  })

  it('falls back to the copy command where the clipboard API is missing', async () => {
    const page = openPage(html, new Map(), { clipboard: false, copyCommandWorks: true })
    page.score(0, 'ok')

    await page.clickCopy()

    assert.deepEqual(page.copied, [])
    assert.equal(page.output.selected, true, 'the JSON was selected for the copy command')
    assert.equal(page.details.open, true)
    assert.equal(page.copyStatus.textContent, 'Copied. Save it as scores.json in this folder.')
  })

  it('says so when nothing could be copied, and leaves the JSON on the page', async () => {
    const page = openPage(html, new Map(), { clipboard: false, copyCommandWorks: false })
    page.score(0, 'ok')

    await page.clickCopy()

    assert.match(page.copyStatus.textContent, /^The clipboard is not available\./)
    assert.equal(JSON.parse(page.output.value).scores['01-first'].beat_1, 'ok')
  })

  it('keeps the scores of a run when the page is opened again', () => {
    const storage = new Map<string, string>()
    openPage(html, storage).score(1, 'ok')
    assert.deepEqual([...storage.keys()], ['stockfinder-eval:2026-01-02T03-04-05Z'])

    const reopened = openPage(html, storage)

    assert.equal(reopened.beats[1].dataset.rated, 'ok')
    assert.equal(reopened.progress.textContent, '1 of 3 beats scored: 0 good, 1 ok, 0 bad')
  })

  it('ignores stored scores that are not good, ok or bad', () => {
    const storage = new Map([
      ['stockfinder-eval:2026-01-02T03-04-05Z', '{"01-first":{"beat_1":"excellent"}}']
    ])
    const page = openPage(html, storage)

    assert.equal(page.progress.textContent, '0 of 3 beats scored: 0 good, 0 ok, 0 bad')
  })
})
