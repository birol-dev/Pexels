import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'
import {
  BROAD_SEARCH_GUIDANCE,
  DEFAULT_SEARCH_MODE,
  buildBeatCatalogUserContent,
  buildBroadSearchNudgeMessage,
  buildEmptyReplyNudgeMessage,
  buildLiveBeatStatusUserContent,
  buildStockScoutSystemPrompt,
  getBeatsNeedingBroaderSearch,
  messagesWithCacheStablePrefix,
  resolveSearchModeFromSnapshot,
  shouldInjectPostToolBroadNudge,
  type BroadNudgeBeat
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
    assert.match(prompt, /Follow the safety settings below\./)
    assert.doesNotMatch(prompt, /skipExplicit|avoidPeople/)
    assert.match(prompt, /Nature|Tigers|People/)
  })

  it('Broad prompt still mentions safety controls from configuration', () => {
    const prompt = buildStockScoutSystemPrompt({
      ...promptInput,
      searchMode: 'broad',
      avoidPeople: true
    })
    assert.match(prompt, /- Safety: .*Keep people out of frame/)
  })

  it('mentions suggested queries in the prompt only when the beats have them', () => {
    const withQueries = buildStockScoutSystemPrompt({
      ...promptInput,
      searchMode: 'focused',
      suggestedQueries: true
    })
    const withoutQueries = buildStockScoutSystemPrompt({ ...promptInput, searchMode: 'focused' })
    assert.match(withQueries, /Each beat comes with suggested queries\. Start with the first\./)
    assert.doesNotMatch(withoutQueries, /suggested queries/)
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

  it('puts the suggested queries and asset type of a beat in the catalog', () => {
    const catalog = JSON.parse(
      buildBeatCatalogUserContent([
        { ...pendingBeat, queries: ['ocean sunrise', 'calm sea'], assetType: 'video' },
        { ...pendingBeat, id: 'beat_2', queries: [] }
      ])
        .split('\n')
        .slice(1)
        .join('\n')
    )
    assert.deepEqual(catalog[0].queries, ['ocean sunrise', 'calm sea'])
    assert.equal(catalog[0].assetType, 'video')
    assert.equal('queries' in catalog[1], false, 'an empty list is left out')
    assert.equal('assetType' in catalog[1], false)
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

  it('builds a short nudge that asks for a broader query', () => {
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
    assert.match(msg!, /^1 beat has no usable results yet \(/)
    assert.match(
      msg!,
      /beat_1 \("vintage typewriter on desk"\) tried "vintage brass typewriter mahogany desk"/
    )
    assert.match(
      msg!,
      /Search again with a broader query: drop adjectives or try a synonym, place, or mood\.$/
    )
    assert.doesNotMatch(msg!, /DIFFERENT|Broad search mode/)
  })

  it('says when a beat has not been searched yet', () => {
    const msg = buildBroadSearchNudgeMessage([
      {
        id: 'beat_3',
        visualPrompt: 'city skyline',
        status: 'pending',
        searchQueries: [],
        assets: []
      }
    ])
    assert.match(msg!, /beat_3 \("city skyline"\) not searched yet/)
  })
})

describe('buildEmptyReplyNudgeMessage', () => {
  const beat = (id: string, assets: string[], searchQueries: string[] = []): BroadNudgeBeat => ({
    id,
    visualPrompt: `footage for ${id}`,
    status: 'searching',
    searchQueries,
    assets: assets.map((status) => ({ status }))
  })

  it('counts every beat that is short, and says "beat" for one', () => {
    assert.equal(
      buildEmptyReplyNudgeMessage([beat('beat_1', [])], 1, 'focused'),
      '1 beat still needs footage, for example beat_1 ("footage for beat_1"). Search for it now.'
    )
    assert.equal(
      buildEmptyReplyNudgeMessage([beat('beat_1', []), beat('beat_2', [])], 1, 'focused'),
      '2 beats still need footage, for example beat_1 ("footage for beat_1"), beat_2 ("footage for beat_2"). Search for them now.'
    )
  })

  it('names at most four beats', () => {
    const beats = Array.from({ length: 6 }, (_, i) => beat(`beat_${i + 1}`, []))
    const msg = buildEmptyReplyNudgeMessage(beats, 1, 'focused')
    assert.match(msg, /^6 beats still need footage/)
    assert.match(msg, /beat_4 /)
    assert.doesNotMatch(msg, /beat_5/)
  })

  it('says how many assets a beat has when it has some but not enough', () => {
    assert.equal(
      buildEmptyReplyNudgeMessage([beat('beat_1', ['completed'])], 3, 'focused'),
      '1 beat does not have its 3 assets yet, for example beat_1 ("footage for beat_1") has 1. Search for it now.'
    )
    assert.equal(
      buildEmptyReplyNudgeMessage(
        [beat('beat_1', []), beat('beat_2', ['downloading', 'completed'])],
        3,
        'focused'
      ),
      '2 beats do not have their 3 assets yet, for example beat_1 ("footage for beat_1") has none, beat_2 ("footage for beat_2") has 2. Search for them now.'
    )
  })

  it('does not count a failed asset toward what a beat has', () => {
    const msg = buildEmptyReplyNudgeMessage([beat('beat_1', ['failed', 'completed'])], 2, 'focused')
    assert.match(msg, /beat_1 \("footage for beat_1"\) has 1\./)
    const empty = buildEmptyReplyNudgeMessage([beat('beat_1', ['failed'])], 2, 'focused')
    assert.match(empty, /^1 beat still needs footage/)
  })

  it('keeps the broader-query message for beats with nothing in broad mode', () => {
    const beats = [beat('beat_1', [], ['busy street'])]
    assert.equal(
      buildEmptyReplyNudgeMessage(beats, 3, 'broad'),
      buildBroadSearchNudgeMessage(beats)
    )
  })

  it('adds the broader-query message for the empty beats when others have some assets', () => {
    const msg = buildEmptyReplyNudgeMessage(
      [beat('beat_1', []), beat('beat_2', ['completed'])],
      2,
      'broad'
    )
    assert.match(msg, /^2 beats do not have their 2 assets yet, /)
    assert.match(msg, /beat_2 \("footage for beat_2"\) has 1\./)
    assert.match(
      msg,
      /1 beat has no usable results yet \(beat_1 \("footage for beat_1"\) not searched yet\)/
    )
    assert.doesNotMatch(msg, /beat_2[^.]*not searched yet/)
  })

  it('leaves out the broader-query message in focused mode, and when a beat already tried two queries', () => {
    const beats = [beat('beat_1', []), beat('beat_2', ['completed'])]
    assert.doesNotMatch(buildEmptyReplyNudgeMessage(beats, 2, 'focused'), /broader query/)
    const triedTwice = [beat('beat_1', [], ['a', 'b']), beat('beat_2', ['completed'])]
    assert.doesNotMatch(buildEmptyReplyNudgeMessage(triedTwice, 2, 'broad'), /broader query/)
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
