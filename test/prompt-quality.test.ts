import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBeatCorrectionMessage,
  buildBeatSplitSystemPrompt,
  findScriptMismatch
} from '../src/main/services/llm/beat-parse-tool.ts'
import {
  parseDurationSeconds,
  wordGuidanceForDuration
} from '../src/main/services/llm/duration-guidance.ts'
import {
  buildBroadSearchNudgeMessage,
  buildLiveBeatStatusUserContent,
  buildStockScoutSystemPrompt,
  describeTurnBudget,
  messagesWithCacheStablePrefix
} from '../src/main/services/agent/search-mode.ts'

describe('wordGuidanceForDuration', () => {
  it('keeps the word counts the duration picker advertises', () => {
    assert.match(wordGuidanceForDuration('30s'), /approximately 60-80 words/)
    assert.match(wordGuidanceForDuration('60s'), /approximately 120-160 words/)
    assert.match(wordGuidanceForDuration('2-3min'), /approximately 300-450 words/)
  })

  it('does not confuse durations that merely contain a digit from another bucket', () => {
    assert.match(wordGuidanceForDuration('20s'), /approximately 40-55 words/)
    assert.match(wordGuidanceForDuration('120s'), /approximately 240-325 words/)
    assert.match(wordGuidanceForDuration('45s'), /approximately 90-120 words/)
  })

  it('understands minutes, ranges and spelled-out units', () => {
    assert.deepEqual(parseDurationSeconds('10 min'), [600, 600])
    assert.deepEqual(parseDurationSeconds('30 minutes'), [1800, 1800])
    assert.deepEqual(parseDurationSeconds('1.5 minutes'), [90, 90])
    assert.deepEqual(parseDurationSeconds('2 to 3 min'), [120, 180])
    assert.deepEqual(parseDurationSeconds('3-2min'), [120, 180])
    assert.deepEqual(parseDurationSeconds('90 seconds'), [90, 90])
  })

  it('treats a bare number as seconds', () => {
    assert.deepEqual(parseDurationSeconds('45'), [45, 45])
  })

  it('understands the legacy word labels', () => {
    assert.deepEqual(parseDurationSeconds('short'), [30, 30])
    assert.deepEqual(parseDurationSeconds('Deep dive'), [120, 180])
    assert.deepEqual(parseDurationSeconds('long form'), [120, 180])
  })

  it('falls back to 60 seconds for missing, zero or unparseable input', () => {
    assert.deepEqual(parseDurationSeconds(undefined), [60, 60])
    assert.deepEqual(parseDurationSeconds(''), [60, 60])
    assert.deepEqual(parseDurationSeconds('0s'), [60, 60])
    assert.deepEqual(parseDurationSeconds('whenever'), [60, 60])
  })
})

describe('findScriptMismatch', () => {
  const beat = (text: string): { text: string; visualPrompt: string } => ({
    text,
    visualPrompt: 'x'
  })

  it('accepts beats that reproduce the script', () => {
    const script = 'The sun rises. Birds sing. A city wakes up.'
    assert.equal(
      findScriptMismatch(script, [beat('The sun rises.'), beat('Birds sing. A city wakes up.')]),
      null
    )
  })

  it('ignores case, punctuation and whitespace differences', () => {
    const script = 'The sun rises.\n\nBirds sing -- loudly!'
    assert.equal(
      findScriptMismatch(script, [beat('the SUN rises'), beat('birds sing, loudly')]),
      null
    )
  })

  it('reports a dropped sentence with its position', () => {
    const script = 'One two three. Four five six. Seven eight nine.'
    const message = findScriptMismatch(script, [beat('One two three.'), beat('Seven eight nine.')])
    assert.ok(message)
    assert.match(message, /script has 9 words and the beats have 6/)
    assert.match(message, /differ at word 4/)
    assert.match(message, /four five six/)
  })

  it('reports a reworded beat', () => {
    const message = findScriptMismatch('The cat sat down.', [beat('The cat took a seat.')])
    assert.ok(message)
    assert.match(message, /differ at word 3/)
  })

  it('reports extra text the model added at the end', () => {
    const message = findScriptMismatch('Hello world.', [beat('Hello world.'), beat('Thanks!')])
    assert.ok(message)
    assert.match(message, /differ at word 3/)
  })

  it('reports beats that are out of order', () => {
    assert.ok(
      findScriptMismatch('Alpha beta. Gamma delta.', [beat('Gamma delta.'), beat('Alpha beta.')])
    )
  })

  it('handles non-latin scripts', () => {
    assert.equal(
      findScriptMismatch('שלום עולם. מה נשמע', [beat('שלום עולם.'), beat('מה נשמע')]),
      null
    )
    assert.ok(findScriptMismatch('שלום עולם. מה נשמע', [beat('שלום עולם.')]))
  })

  it('flags empty beats against a real script', () => {
    assert.ok(findScriptMismatch('Something to say.', []))
  })

  it('builds a correction message that quotes the problem', () => {
    const message = buildBeatCorrectionMessage('The beats do not reproduce the script.')
    assert.match(message, /^The beats do not reproduce the script\./)
    assert.match(message, /submit_script_beats again/)
    assert.match(message, /verbatim/)
  })
})

describe('buildBeatSplitSystemPrompt', () => {
  it('tells the model how large a beat is and how many it may use', () => {
    const prompt = buildBeatSplitSystemPrompt({ maxTotalDownloads: 12, avoidPeople: false })
    assert.match(prompt, /at most 12 beats/)
    assert.match(prompt, /only 12 assets in total/)
    assert.match(prompt, /one beat per sentence/)
    assert.match(prompt, /reproduce the full script/)
    assert.match(prompt, /abstract narration/)
  })

  it('adds the no-people rule only when the user asked for it', () => {
    assert.doesNotMatch(
      buildBeatSplitSystemPrompt({ maxTotalDownloads: 15, avoidPeople: false }),
      /no people/
    )
    assert.match(
      buildBeatSplitSystemPrompt({ maxTotalDownloads: 15, avoidPeople: true }),
      /no people in the footage/
    )
  })
})

describe('StockScout prompt quality rules', () => {
  const base = {
    searchMode: 'focused' as const,
    platform: 'YouTube',
    style: 'cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 3,
    maxTotalDownloads: 15,
    skipExplicit: true,
    avoidPeople: false
  }

  it('tells the model to batch tool calls inside one turn', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /Make several tool calls in one turn/)
    assert.match(prompt, /one search call per beat, all in one reply/)
  })

  it('states the turn budget only when it is known', () => {
    assert.match(buildStockScoutSystemPrompt({ ...base, maxIterations: 30 }), /at most 30 turns/)
    assert.doesNotMatch(buildStockScoutSystemPrompt(base), /at most \d+ turns/)
  })

  it('warns when there are more beats than the download cap', () => {
    const over = buildStockScoutSystemPrompt({ ...base, beatCount: 40 })
    assert.match(over, /40 beats but the total cap is 15/)

    assert.doesNotMatch(
      buildStockScoutSystemPrompt({ ...base, beatCount: 15 }),
      /beats but the total cap/
    )
    assert.doesNotMatch(buildStockScoutSystemPrompt(base), /beats but the total cap/)
  })

  it('defines when the job is done', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /When every beat has an asset, stop calling tools/)
  })

  it('walks through search, select and repeat, and leaves queuing downloads to the app', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /1\. Search for every beat that has no asset yet/)
    assert.match(
      prompt,
      /2\. Select the best result for each beat in one select_assets_for_download call/
    )
    assert.match(prompt, /Selecting starts the download\./)
    assert.match(prompt, /3\. Repeat for beats whose results were weak/)
    assert.doesNotMatch(prompt, /download_selected_assets/)
    assert.doesNotMatch(prompt, /Available tools/)
    assert.doesNotMatch(prompt, /queue everything/)
    assert.doesNotMatch(prompt, /waiting to be queued/)
  })

  it('does not call the model a YouTube agent or ask it to download', () => {
    const prompt = buildStockScoutSystemPrompt({ ...base, platform: 'TikTok' })
    assert.match(prompt, /^You are StockScout\. You find Pexels stock footage/)
    assert.doesNotMatch(prompt, /YouTube creators/)
    assert.doesNotMatch(prompt, /and download them/)
  })

  it('has no rule about claiming downloads or writing a summary', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.doesNotMatch(prompt, /claim an asset was downloaded/)
    assert.doesNotMatch(prompt, /summary/)
    assert.doesNotMatch(prompt, /local file paths/)
    assert.doesNotMatch(prompt, /Respect the user's max assets/)
  })

  it('keeps no word in capitals except tool names and acronyms', () => {
    const inCapitals = (text: string): string[] => text.match(/\b[A-Z]{4,}\b/g) ?? []
    for (const searchMode of ['focused', 'broad'] as const) {
      for (const mix of ['videos only', 'photos only', 'videos + photos']) {
        const prompt = buildStockScoutSystemPrompt({
          ...base,
          searchMode,
          mix,
          avoidPeople: true,
          maxIterations: 30,
          beatCount: 40
        })
        assert.deepEqual(inCapitals(prompt), [], `${searchMode} / ${mix}`)
      }
    }
    const nudge = buildBroadSearchNudgeMessage([
      {
        id: 'beat_1',
        visualPrompt: 'busy street',
        status: 'pending',
        searchQueries: [],
        assets: []
      }
    ])
    assert.deepEqual(inCapitals(nudge ?? ''), [])
  })

  it('states the mix as a fact, and recommends a type only when both are allowed', () => {
    const both = buildStockScoutSystemPrompt(base)
    assert.match(both, /- Asset mix: videos \+ photos\n/)
    assert.match(both, /4\. Never select the same asset for two beats\./)
    assert.match(
      both,
      /5\. Prefer videos for beats with motion and photos for objects, textures, or establishing shots\./
    )

    for (const mix of ['videos only', 'photos only']) {
      const single = buildStockScoutSystemPrompt({ ...base, mix })
      assert.match(single, new RegExp(`- Asset mix: ${mix}\\n`))
      assert.doesNotMatch(single, /Prefer videos for beats with motion/)
      assert.doesNotMatch(single, /Only call search tools/)
      assert.doesNotMatch(single, /\n5\. /)
    }
  })

  it('asks for rejection reasons only as an option', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /You may add a 2 to 4 word reason to a rejection/)
    assert.match(prompt, /Reject only results you considered and ruled out\./)
    assert.doesNotMatch(prompt, /When rejecting assets, give a short reason/)
  })

  it('gives the default focused mode its own guidance', () => {
    const focused = buildStockScoutSystemPrompt(base)
    assert.match(focused, /Focused search mode guidance/)
    assert.doesNotMatch(focused, /Broad search mode guidance/)

    const broad = buildStockScoutSystemPrompt({ ...base, searchMode: 'broad' })
    assert.match(broad, /Broad search mode guidance/)
    assert.doesNotMatch(broad, /Focused search mode guidance/)
  })

  it('teaches Pexels query writing in both modes', () => {
    for (const searchMode of ['focused', 'broad'] as const) {
      const prompt = buildStockScoutSystemPrompt({ ...base, searchMode })
      assert.match(prompt, /Write queries in English/)
      assert.match(prompt, /no search operators/)
      assert.match(prompt, /stock market screen red/)
      assert.match(prompt, /"empty office desk"/)
    }
  })

  it('admits the model cannot see images and points it at alt text and slugs', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /search results are text only/)
    assert.match(prompt, /slug/)
    assert.match(prompt, /You cannot view the images/)
    assert.doesNotMatch(prompt, /clear subject visibility/)
    assert.doesNotMatch(prompt, /non-stocky/)
    assert.doesNotMatch(prompt, /poor composition/)
  })

  it('names the fields of a search result and no longer mentions average color', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(
      prompt,
      /Each result has pexelsId, about, shape \(landscape, portrait, or square\), and size/
    )
    assert.match(prompt, /A video result also has seconds and fullHd/)
    assert.doesNotMatch(prompt, /average color|alt text, size/)
  })

  it('says searches already return the platform shape', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /searches already return the platform's shape/)
    assert.match(prompt, /prefer results whose shape matches/)
    assert.doesNotMatch(prompt, /compare width and height/)
  })

  it('does not ask the model to pick a variant', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.doesNotMatch(prompt, /Choosing a variant/)
    assert.doesNotMatch(prompt, /variant/i)
    assert.doesNotMatch(prompt, /large2x|"hd" file|"uhd"/)
  })

  it('says older search results may be shortened, and can still be selected from', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /Older search results may be shortened to a list of ids and descriptions/)
    assert.match(prompt, /marked compacted\. You can still select from them\./)
  })

  it('says nothing about safety when both settings are off, rather than granting permission', () => {
    const off = buildStockScoutSystemPrompt({ ...base, skipExplicit: false, avoidPeople: false })
    assert.doesNotMatch(off, /Safety/)
    assert.doesNotMatch(off, /No strict content filtering/)
  })

  it('writes one safety sentence for each setting that is on', () => {
    assert.match(
      buildStockScoutSystemPrompt(base),
      /- Safety: Do not search for explicit or adult content\.\n/
    )
    assert.match(
      buildStockScoutSystemPrompt({ ...base, skipExplicit: false, avoidPeople: true }),
      /- Safety: Keep people out of frame: search for objects, places, nature, or hands\.\n/
    )
    assert.match(
      buildStockScoutSystemPrompt({ ...base, avoidPeople: true }),
      /- Safety: Do not search for explicit or adult content\. Keep people out of frame/
    )
  })

  it('forbids using one asset for two beats', () => {
    assert.match(buildStockScoutSystemPrompt(base), /Never select the same asset for two beats\./)
  })

  it('tells the model how to handle interrupted and refused calls', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /interrupted, repeat it if it is still needed/)
    assert.match(prompt, /do not retry the same asset/)
  })
})

describe('turn budget in the live status message', () => {
  const beats = [{ id: 'beat_1', visualPrompt: 'sea', status: 'pending', assets: [] }]

  it('describes the turns left', () => {
    assert.equal(describeTurnBudget({ used: 4, max: 30 }), 'Turn 4 of 30 (26 left after this one).')
  })

  it('urges the model to finish when the budget is nearly gone', () => {
    assert.match(
      describeTurnBudget({ used: 28, max: 30 }),
      /Finish the beats that are still empty now/
    )
    assert.doesNotMatch(describeTurnBudget({ used: 20, max: 30 }), /Finish/)
  })

  it('never reports negative turns', () => {
    assert.match(describeTurnBudget({ used: 35, max: 30 }), /\(0 left/)
  })

  it('adds the budget line to the status snapshot only when given', () => {
    assert.doesNotMatch(buildLiveBeatStatusUserContent(beats), /Turn \d+ of/)
    assert.match(buildLiveBeatStatusUserContent(beats, { used: 2, max: 30 }), /Turn 2 of 30/)
  })

  it('keeps the status as the last message and leaves the catalog untouched', () => {
    const messages = messagesWithCacheStablePrefix(
      [{ role: 'user' as const, content: 'Begin' }],
      beats.map((b) => ({ ...b, text: 'Sea.' })),
      { used: 1, max: 30 }
    )
    assert.equal(messages.length, 3)
    assert.doesNotMatch(messages[0].content || '', /Turn \d+ of/)
    assert.match(messages[2].content || '', /Turn 1 of 30/)
  })
})
