import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractToolCallsFromText } from '../src/main/services/agent/tool-parser.ts'

describe('extractToolCallsFromText', () => {
  const validToolNames = [
    'search_pexels_photos',
    'search_pexels_videos',
    'select_assets_for_download',
    'download_selected_assets'
  ]

  it('returns empty array for text with no tool calls', () => {
    const text = 'I will now look for videos about artificial intelligence.'
    const result = extractToolCallsFromText(text, validToolNames)
    assert.deepEqual(result, [])
  })

  it('extracts tool calls from <tool_call> tags', () => {
    const text = `
Here is my plan:
<tool_call>
{
  "name": "search_pexels_videos",
  "arguments": {
    "beatId": "beat_1",
    "query": "artificial intelligence neural network"
  }
}
</tool_call>
`
    const result = extractToolCallsFromText(text, validToolNames)
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'search_pexels_videos')
    const args = JSON.parse(result[0].arguments)
    assert.equal(args.beatId, 'beat_1')
    assert.equal(args.query, 'artificial intelligence neural network')
  })

  it('extracts tool calls from markdown json code blocks', () => {
    const text = `
Let me search Pexels:
\`\`\`json
{
  "name": "search_pexels_photos",
  "arguments": {
    "beatId": "beat_2",
    "query": "futuristic city skyline"
  }
}
\`\`\`
`
    const result = extractToolCallsFromText(text, validToolNames)
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'search_pexels_photos')
    const args = JSON.parse(result[0].arguments)
    assert.equal(args.beatId, 'beat_2')
    assert.equal(args.query, 'futuristic city skyline')
  })

  it('extracts array of tool calls in json code blocks', () => {
    const text = `
\`\`\`json
[
  {
    "name": "search_pexels_videos",
    "arguments": { "beatId": "beat_1", "query": "robot working" }
  },
  {
    "name": "search_pexels_photos",
    "arguments": { "beatId": "beat_2", "query": "cyberpunk street" }
  }
]
\`\`\`
`
    const result = extractToolCallsFromText(text, validToolNames)
    assert.equal(result.length, 2)
    assert.equal(result[0].name, 'search_pexels_videos')
    assert.equal(result[1].name, 'search_pexels_photos')
  })

  it('ignores tool calls with unrecognized tool names', () => {
    const text = `
\`\`\`json
{
  "name": "unauthorized_dangerous_tool",
  "arguments": { "foo": "bar" }
}
\`\`\`
`
    const result = extractToolCallsFromText(text, validToolNames)
    assert.equal(result.length, 0)
  })
})
