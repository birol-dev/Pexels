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
    assert.match(prompt, /one call per beat/)
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
    assert.match(
      prompt,
      /You are done when every beat has at least one selected or downloaded asset/
    )
    assert.match(prompt, /nothing you selected is still waiting to be queued/)
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

  it('asks for a plain-text summary instead of an unspecified structure', () => {
    const prompt = buildStockScoutSystemPrompt(base)
    assert.match(prompt, /short plain-text summary/)
    assert.doesNotMatch(prompt, /structured summaries/)
  })

  it('does not contradict the safety setting', () => {
    const off = buildStockScoutSystemPrompt({ ...base, skipExplicit: false })
    assert.match(off, /Safety controls: No strict content filtering\.\n/)
    assert.doesNotMatch(off, /Avoid explicit sexual/)

    const on = buildStockScoutSystemPrompt({ ...base, avoidPeople: true })
    assert.match(
      on,
      /Safety controls: Skip explicit\/adult keywords\. AVOID queries containing people/
    )
  })

  it('has no trailing whitespace on the safety line', () => {
    assert.match(
      buildStockScoutSystemPrompt(base),
      /Safety controls: Skip explicit\/adult keywords\.\n/
    )
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
