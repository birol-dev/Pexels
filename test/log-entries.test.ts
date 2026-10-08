import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tailLogEntries } from '../src/main/services/agent/log-tail.ts'
import { safetyFilterReport } from '../src/main/services/agent/content-filters.ts'
import { summarizeToolResultForLog } from '../src/main/services/agent/tool-schemas.ts'
import {
  photoResultForModel,
  videoResultForModel
} from '../src/main/services/agent/tool-results.ts'
import { photo, video } from './support/pexels-fixtures.ts'

describe('summarizeToolResultForLog', () => {
  it('keeps the count and the ids of a video search, not the candidates', () => {
    const result = {
      total_results: 4200,
      results: [video(101, 'city-street'), video(102, 'forest')].map(videoResultForModel)
    }

    assert.deepEqual(summarizeToolResultForLog('search_pexels_videos', result), {
      total_results: 4200,
      returned: 2,
      ids: [101, 102]
    })
  })

  it('does the same for a photo search', () => {
    const result = {
      total_results: 12,
      results: [photo(7, 'a quiet beach')].map(photoResultForModel)
    }

    assert.deepEqual(summarizeToolResultForLog('search_pexels_photos', result), {
      total_results: 12,
      returned: 1,
      ids: [7]
    })
  })

  it('keeps the number of results the safety settings hid, and the note', () => {
    const result = {
      total_results: 12,
      results: [photo(7, 'a quiet beach')].map(photoResultForModel),
      ...safetyFilterReport(3, 1)
    }

    assert.deepEqual(summarizeToolResultForLog('search_pexels_photos', result), {
      total_results: 12,
      returned: 1,
      filtered: 3,
      ids: [7]
    })
    assert.deepEqual(
      summarizeToolResultForLog('search_pexels_videos', { total_results: 5, results: [] }),
      { total_results: 5, returned: 0, ids: [] },
      'no filtered key when nothing was hidden'
    )
  })

  it('reports a search that found nothing', () => {
    assert.deepEqual(
      summarizeToolResultForLog('search_pexels_videos', { total_results: 0, results: [] }),
      { total_results: 0, returned: 0, ids: [] }
    )
  })

  it('is much smaller than what a full search result takes', () => {
    const videos = Array.from({ length: 15 }, (_, i) => video(1000 + i, `clip-number-${i}`))
    const result = { total_results: 900, results: videos.map(videoResultForModel) }

    const kept = JSON.stringify(summarizeToolResultForLog('search_pexels_videos', result)).length
    assert.ok(kept < JSON.stringify(result).length / 4, `kept ${kept} characters`)
  })

  it('passes other results through as they are', () => {
    const selection = { status: 'queued', results: [{ pexelsId: 1, ok: true }] }
    const failure = { error: 'Rate limited', retryable: true }
    const download = { downloaded: [{ assetId: 'video_1' }], failed: [] }

    assert.equal(summarizeToolResultForLog('select_assets_for_download', selection), selection)
    assert.equal(summarizeToolResultForLog('download_selected_assets', download), download)
    assert.equal(summarizeToolResultForLog('submit_beat_plan', failure), failure)
  })

  it('passes a failed search through, since it has no results to list', () => {
    const failure = { error: 'Rate limited', retryable: true }
    const interrupted = { interrupted: true, note: 'Repeat it.' }

    assert.equal(summarizeToolResultForLog('search_pexels_videos', failure), failure)
    assert.equal(summarizeToolResultForLog('search_pexels_photos', interrupted), interrupted)
    assert.equal(summarizeToolResultForLog('search_pexels_videos', null), null)
    assert.equal(summarizeToolResultForLog('search_pexels_videos', 'oops'), 'oops')
  })
})

describe('tailLogEntries', () => {
  const line = (n: number, data?: unknown): string =>
    JSON.stringify({
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'info',
      message: `entry ${n}`,
      data
    })

  it('returns the newest entries, oldest first, when there are more than the limit', () => {
    const lines = Array.from({ length: 2500 }, (_, i) => line(i))

    const entries = tailLogEntries(lines, 1000)

    assert.equal(entries.length, 1000)
    assert.equal(entries[0].message, 'entry 1500')
    assert.equal(entries[999].message, 'entry 2499')
  })

  it('returns everything when there are fewer lines than the limit', () => {
    const entries = tailLogEntries([line(1), line(2), line(3)])

    assert.deepEqual(
      entries.map((e) => e.message),
      ['entry 1', 'entry 2', 'entry 3']
    )
  })

  it('defaults to the newest 1000', () => {
    const lines = Array.from({ length: 1200 }, (_, i) => line(i))

    assert.equal(tailLogEntries(lines).length, 1000)
  })

  it('parses only the lines it keeps', () => {
    // A line that is not JSON would be skipped if it were parsed; an old one is never looked at.
    const lines = ['{ not json', ...Array.from({ length: 3 }, (_, i) => line(i))]

    assert.deepEqual(
      tailLogEntries(lines, 3).map((e) => e.message),
      ['entry 0', 'entry 1', 'entry 2']
    )
  })

  it('skips malformed lines, blank lines and values that are not entries', () => {
    const lines = [line(1), '', '{ not json', '   ', '42', 'null', '[1,2]', '"text"', line(2)]

    assert.deepEqual(
      tailLogEntries(lines).map((e) => e.message),
      ['entry 1', 'entry 2']
    )
  })

  it('replaces large data with its size, and keeps small data', () => {
    const big = { results: 'x'.repeat(5000) }
    const bigText = 'y'.repeat(4001)
    const small = { total_results: 3, returned: 3, ids: [1, 2, 3] }

    const [a, b, c, d] = tailLogEntries([
      line(1, big),
      line(2, bigText),
      line(3, small),
      line(4, 'z'.repeat(4000))
    ])

    assert.deepEqual(a.data, { truncated: true, characters: JSON.stringify(big).length })
    assert.deepEqual(b.data, { truncated: true, characters: 4001 })
    assert.deepEqual(c.data, small)
    assert.equal((d.data as string).length, 4000, 'the limit itself is kept')
    assert.equal(a.message, 'entry 1', 'the rest of the entry is untouched')
  })

  it('returns nothing for an empty log', () => {
    assert.deepEqual(tailLogEntries([]), [])
    assert.deepEqual(tailLogEntries(['']), [])
  })
})
