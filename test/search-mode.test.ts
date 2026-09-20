import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'
import {
  BROAD_SEARCH_GUIDANCE,
  DEFAULT_SEARCH_MODE,
  buildBeatCatalogUserContent,
  buildBroadSearchNudgeMessage,
  buildLiveBeatStatusUserContent,
  buildStockScoutSystemPrompt,
  getBeatsNeedingBroaderSearch,
  messagesWithCacheStablePrefix,
  resolveSearchModeFromSnapshot,
  shouldInjectPostToolBroadNudge
} from '../src/main/services/agent/search-mode.ts'

const StartJobInputSchema = z
  .object({
    title: z.string().min(1),
    script: z.string(),
    inputMode: z.enum(['script', 'idea']).optional(),
    idea: z.string().optional(),
    targetDuration: z.string().optional(),
    tone: z.string().optional(),
    visualConcept: z.string().optional(),
    platform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']),
    style: z.string().min(1),
    mix: z.enum(['videos only', 'photos only', 'videos + photos']),
    maxAssetsPerBeat: z.number().min(1).max(10),
    maxTotalDownloads: z.number().min(1).max(100),
    searchMode: z.enum(['focused', 'broad']).optional().default('focused')
  })
  .refine(
    (data) => {
      if (data.inputMode === 'idea') {
        return Boolean((data.idea && data.idea.trim()) || (data.script && data.script.trim()))
      }
      return Boolean(data.script && data.script.trim())
    },
    {
      message: 'Please provide either a video script or an idea to begin.'
    }
  )

const baseJob = {
  title: 'Test Pack',
  script: 'A calm ocean at sunrise.',
  platform: 'YouTube' as const,
  style: 'cinematic',
  mix: 'videos + photos' as const,
  maxAssetsPerBeat: 3,
  maxTotalDownloads: 15
}

describe('searchMode IPC / start path', () => {
  it('defaults searchMode to focused when omitted', () => {
    const parsed = StartJobInputSchema.parse(baseJob)
    assert.equal(parsed.searchMode, 'focused')
    assert.equal(DEFAULT_SEARCH_MODE, 'focused')
  })

  it('accepts focused and broad searchMode values', () => {
    assert.equal(
      StartJobInputSchema.parse({ ...baseJob, searchMode: 'focused' }).searchMode,
      'focused'
    )
    assert.equal(StartJobInputSchema.parse({ ...baseJob, searchMode: 'broad' }).searchMode, 'broad')
  })

  it('rejects invalid searchMode values', () => {
    assert.throws(() => StartJobInputSchema.parse({ ...baseJob, searchMode: 'aggressive' }))
  })
})

describe('StockScout system prompt search modes', () => {
  const promptInput = {
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 3,
    maxTotalDownloads: 15,
    skipExplicit: true,
    avoidPeople: false
  }

  it('Focused prompt surfaces mode and does not include Broad guidance block', () => {
    const prompt = buildStockScoutSystemPrompt({ ...promptInput, searchMode: 'focused' })
    assert.match(prompt, /Search mode: Focused/)
    assert.equal(prompt.includes(BROAD_SEARCH_GUIDANCE), false)
    assert.equal(prompt.includes('Prefer common stock-footage vocabulary'), false)
  })

  it('Broad prompt includes broader guidance and surfaces Broad mode', () => {
    const prompt = buildStockScoutSystemPrompt({ ...promptInput, searchMode: 'broad' })
    assert.match(prompt, /Search mode: Broad/)
    assert.ok(prompt.includes(BROAD_SEARCH_GUIDANCE))
    assert.match(prompt, /common stock-footage vocabulary/)
    assert.match(prompt, /several angles per beat/)
    assert.match(prompt, /immediately broaden/)
    assert.match(prompt, /skipExplicit \/ avoidPeople/)
    assert.match(prompt, /Nature|Tigers|People/)
  })

  it('Broad prompt still mentions safety controls from configuration', () => {
    const prompt = buildStockScoutSystemPrompt({
      ...promptInput,
      searchMode: 'broad',
      avoidPeople: true
    })
    assert.match(prompt, /AVOID queries containing people/)
  })

  it('keeps the system prompt identical when only live beat status changes', () => {
    const first = buildStockScoutSystemPrompt({ ...promptInput, searchMode: 'focused' })
    const second = buildStockScoutSystemPrompt({ ...promptInput, searchMode: 'focused' })
    assert.equal(first, second)
    assert.equal(first.includes('"status": "completed"'), false)
    assert.equal(first.includes('ocean sunrise'), false)
    assert.match(first, /visual beat catalog is provided in the first user message/)
  })
})

describe('cache-stable beat catalog vs live status', () => {
  const pendingBeat = {
    id: 'beat_1',
    text: 'A calm ocean at sunrise.',
    visualPrompt: 'ocean sunrise',
    status: 'pending',
    assets: [] as Array<{ id: string; type: string; status: string }>
  }
  const completedBeat = {
    ...pendingBeat,
    status: 'completed',
    assets: [{ id: 'video_1', type: 'video', status: 'completed' }]
  }

  it('keeps catalog text stable while status snapshots change', () => {
    assert.equal(
      buildBeatCatalogUserContent([pendingBeat]),
      buildBeatCatalogUserContent([completedBeat])
    )
    assert.match(buildBeatCatalogUserContent([pendingBeat]), /ocean sunrise/)
    assert.equal(buildBeatCatalogUserContent([pendingBeat]).includes('"status"'), false)
    assert.match(buildLiveBeatStatusUserContent([completedBeat]), /"status": "completed"/)
    assert.equal(buildLiveBeatStatusUserContent([completedBeat]).includes('ocean sunrise'), false)
  })

  it('puts the catalog before conversation and live status after it', () => {
    const messages = messagesWithCacheStablePrefix(
      [{ role: 'user' as const, content: 'Begin searching' }],
      [completedBeat]
    )
    assert.equal(messages.length, 3)
    assert.match(messages[0].content || '', /Visual beat catalog/)
    assert.equal(messages[1].content, 'Begin searching')
    assert.match(messages[2].content || '', /Live beat status snapshot/)
  })
})

describe('Broad search nudge path', () => {
  it('flags beats with no usable assets and 0–1 unique queries', () => {
    const beats = [
      {
        id: 'beat_1',
        visualPrompt: 'crowded neon market',
        status: 'searching',
        searchQueries: ['crowded neon night market stall'],
        assets: []
      },
      {
        id: 'beat_2',
        visualPrompt: 'quiet forest path',
        status: 'completed',
        searchQueries: ['forest path'],
        assets: [{ status: 'completed' }]
      },
      {
        id: 'beat_3',
        visualPrompt: 'city skyline',
        status: 'pending',
        searchQueries: [],
        assets: []
      }
    ]
    const needy = getBeatsNeedingBroaderSearch(beats)
    assert.deepEqual(
      needy.map((b) => b.id),
      ['beat_1', 'beat_3']
    )
  })

  it('does not flag beats that already tried 2+ unique queries', () => {
    const beats = [
      {
        id: 'beat_1',
        visualPrompt: 'busy kitchen',
        status: 'searching',
        searchQueries: ['busy restaurant kitchen', 'chef cooking'],
        assets: []
      }
    ]
    assert.equal(getBeatsNeedingBroaderSearch(beats).length, 0)
    assert.equal(buildBroadSearchNudgeMessage(beats), null)
  })

  it('builds a nudge that demands a DIFFERENT broader query', () => {
    const beats = [
      {
        id: 'beat_1',
        visualPrompt: 'vintage typewriter on desk',
        status: 'searching',
        searchQueries: ['vintage brass typewriter mahogany desk'],
        assets: []
      }
    ]
    const msg = buildBroadSearchNudgeMessage(beats)
    assert.ok(msg)
    assert.match(msg!, /Broad search mode/)
    assert.match(msg!, /DIFFERENT broader query/)
    assert.match(msg!, /beat_1/)
    assert.match(msg!, /vintage brass typewriter mahogany desk/)
  })
})

describe('resolveSearchModeFromSnapshot (rerun / old manifests)', () => {
  it('defaults missing searchMode to focused', () => {
    assert.equal(resolveSearchModeFromSnapshot(undefined), 'focused')
    assert.equal(resolveSearchModeFromSnapshot(null), 'focused')
  })

  it('preserves broad and focused', () => {
    assert.equal(resolveSearchModeFromSnapshot('broad'), 'broad')
    assert.equal(resolveSearchModeFromSnapshot('focused'), 'focused')
  })

  it('treats unknown values as focused (safe default)', () => {
    assert.equal(resolveSearchModeFromSnapshot('aggressive'), 'focused')
  })
})

describe('shouldInjectPostToolBroadNudge', () => {
  it('does not nudge after a search turn (protects search→select)', () => {
    assert.equal(
      shouldInjectPostToolBroadNudge({
        turnHadSelectOrDownload: false,
        searchedBeatCount: 1
      }),
      false
    )
    assert.equal(
      shouldInjectPostToolBroadNudge({
        turnHadSelectOrDownload: false,
        searchedBeatCount: 3
      }),
      false
    )
  })

  it('does not nudge after select or download', () => {
    assert.equal(
      shouldInjectPostToolBroadNudge({
        turnHadSelectOrDownload: true,
        searchedBeatCount: 0
      }),
      false
    )
  })

  it('allows nudge only when tools ran without search/select/download', () => {
    assert.equal(
      shouldInjectPostToolBroadNudge({
        turnHadSelectOrDownload: false,
        searchedBeatCount: 0
      }),
      true
    )
  })
})
