import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGENT_TOOLS,
  SearchPexelsPhotosArgsSchema,
  SearchPexelsVideosArgsSchema,
  SelectAssetsForDownloadArgsSchema,
  DownloadSelectedAssetsArgsSchema,
  areAllBeatsDownloaded
} from '../src/main/services/agent/tool-schemas.ts'

describe('Agent Tools Contract & Validation', () => {
  describe('search_pexels_photos validation', () => {
    it('accepts valid arguments with defaults', () => {
      const parsed = SearchPexelsPhotosArgsSchema.parse({
        beatId: 'beat_1',
        query: 'mountain sunset'
      })

      assert.equal(parsed.beatId, 'beat_1')
      assert.equal(parsed.query, 'mountain sunset')
      assert.equal(parsed.page, 1)
      assert.equal(parsed.perPage, 15)
    })

    it('rejects query that is too short or too long', () => {
      assert.throws(
        () => SearchPexelsPhotosArgsSchema.parse({ beatId: 'beat_1', query: 'a' }),
        /too_small/
      )

      assert.throws(
        () => SearchPexelsPhotosArgsSchema.parse({ beatId: 'beat_1', query: 'x'.repeat(101) }),
        /too_big/
      )
    })

    it('validates orientation enum values', () => {
      const parsed = SearchPexelsPhotosArgsSchema.parse({
        beatId: 'beat_2',
        query: 'office worker',
        orientation: 'landscape'
      })
      assert.equal(parsed.orientation, 'landscape')

      assert.throws(
        () =>
          SearchPexelsPhotosArgsSchema.parse({
            beatId: 'beat_2',
            query: 'office worker',
            orientation: 'diagonal' as 'landscape'
          }),
        /invalid_value|invalid_enum_value|Invalid option/
      )
    })
  })

  describe('search_pexels_videos validation', () => {
    it('accepts valid video search arguments with defaults', () => {
      const parsed = SearchPexelsVideosArgsSchema.parse({
        beatId: 'beat_1',
        query: 'drone shot city'
      })

      assert.equal(parsed.beatId, 'beat_1')
      assert.equal(parsed.query, 'drone shot city')
      assert.equal(parsed.page, 1)
      assert.equal(parsed.perPage, 10)
    })

    it('enforces page bounds between 1 and 10 and max perPage 30', () => {
      assert.throws(
        () => SearchPexelsVideosArgsSchema.parse({ beatId: 'beat_1', query: 'city', page: 0 }),
        /too_small/
      )

      assert.throws(
        () => SearchPexelsVideosArgsSchema.parse({ beatId: 'beat_1', query: 'city', page: 11 }),
        /too_big/
      )

      assert.throws(
        () => SearchPexelsVideosArgsSchema.parse({ beatId: 'beat_1', query: 'city', perPage: 100 }),
        /too_big/
      )
    })

    it('stops at 30 results per page for photos and videos alike', () => {
      for (const schema of [SearchPexelsPhotosArgsSchema, SearchPexelsVideosArgsSchema]) {
        assert.equal(schema.parse({ beatId: 'beat_1', query: 'city', perPage: 30 }).perPage, 30)
        assert.throws(
          () => schema.parse({ beatId: 'beat_1', query: 'city', perPage: 31 }),
          /too_big/
        )
      }
    })

    it('leaves orientation unset, for the app to default to the platform shape', () => {
      const parsed = SearchPexelsVideosArgsSchema.parse({ beatId: 'beat_1', query: 'city' })
      assert.equal(parsed.orientation, undefined)
    })
  })

  describe('select_assets_for_download validation', () => {
    it('validates selections and rejections with correct schema', () => {
      const payload = {
        selections: [
          {
            beatId: 'beat_1',
            assetType: 'photo' as const,
            pexelsId: 123456,
            variantUrl: 'https://images.pexels.com/photos/123456/pexels-photo-123456.jpeg',
            reason: 'Crisp cinematic shot matching script mood'
          }
        ],
        rejections: [
          {
            beatId: 'beat_1',
            assetType: 'video' as const,
            pexelsId: 789012,
            reason: 'Wrong orientation for YouTube video'
          }
        ]
      }

      const parsed = SelectAssetsForDownloadArgsSchema.parse(payload)
      assert.equal(parsed.selections.length, 1)
      assert.equal(parsed.selections[0].pexelsId, 123456)
      assert.equal(parsed.rejections.length, 1)
      assert.equal(parsed.rejections[0].pexelsId, 789012)
    })

    it('accepts a selection without a variant URL, for the app to pick the file', () => {
      const parsed = SelectAssetsForDownloadArgsSchema.parse({
        selections: [
          { beatId: 'beat_1', assetType: 'video', pexelsId: 5, reason: 'Matches the beat' }
        ]
      })
      assert.equal(parsed.selections[0].variantUrl, undefined)
    })

    it('does not list variantUrl as required in the tool definition', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'select_assets_for_download')
      const { items } = (
        tool?.parameters.properties as {
          selections: { items: { properties: Record<string, unknown>; required: string[] } }
        }
      ).selections
      assert.ok(items.properties.variantUrl, 'the model may still pass one')
      assert.deepEqual(items.required, ['beatId', 'assetType', 'pexelsId'])
    })

    it('accepts selections and rejections without a reason', () => {
      const parsed = SelectAssetsForDownloadArgsSchema.parse({
        selections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 5 }],
        rejections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 6 }]
      })
      assert.equal(parsed.selections[0].reason, undefined)
      assert.equal(parsed.rejections[0].reason, undefined)
    })

    it('does not list reason as required in the tool definition', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'select_assets_for_download')
      const { selections, rejections } = tool?.parameters.properties as Record<
        'selections' | 'rejections',
        { items: { properties: Record<string, unknown>; required: string[] } }
      >
      assert.ok(selections.items.properties.reason, 'the model may still give one')
      assert.ok(rejections.items.properties.reason, 'the model may still give one')
      assert.deepEqual(rejections.items.required, ['beatId', 'assetType', 'pexelsId'])
    })

    it('accepts an empty reason instead of failing the whole call', () => {
      const parsed = SelectAssetsForDownloadArgsSchema.parse({
        selections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 5, reason: '' }],
        rejections: [{ beatId: 'beat_1', assetType: 'video', pexelsId: 6, reason: '' }]
      })
      assert.equal(parsed.rejections[0].reason, '')
    })

    it('rejects invalid variant URLs', () => {
      const invalidPayload = {
        selections: [
          {
            beatId: 'beat_1',
            assetType: 'photo' as const,
            pexelsId: 123456,
            variantUrl: 'not-a-valid-url',
            reason: 'Matches beat'
          }
        ]
      }

      assert.throws(
        () => SelectAssetsForDownloadArgsSchema.parse(invalidPayload),
        /invalid_format|invalid_url|invalid_string|Invalid URL/
      )
    })
  })

  describe('areAllBeatsDownloaded', () => {
    it('requires completed status and at least one completed asset per beat', () => {
      assert.equal(areAllBeatsDownloaded([]), false)
      assert.equal(
        areAllBeatsDownloaded([{ status: 'completed', assets: [{ status: 'completed' }] }]),
        true
      )
      assert.equal(areAllBeatsDownloaded([{ status: 'completed', assets: [] }]), false)
      assert.equal(
        areAllBeatsDownloaded([
          { status: 'completed', assets: [{ status: 'completed' }] },
          { status: 'downloading', assets: [{ status: 'completed' }] }
        ]),
        false
      )
    })
  })

  describe('download_selected_assets validation', () => {
    it('accepts a valid asset id list', () => {
      const parsed = DownloadSelectedAssetsArgsSchema.parse({
        assetIds: [
          { assetType: 'photo', pexelsId: 11 },
          { assetType: 'video', pexelsId: 22 }
        ]
      })
      assert.equal(parsed.assetIds.length, 2)
      assert.equal(parsed.assetIds[0].pexelsId, 11)
    })

    it('defaults to an empty list when assetIds is omitted', () => {
      const parsed = DownloadSelectedAssetsArgsSchema.parse({})
      assert.deepEqual(parsed.assetIds, [])
    })

    it('rejects non-positive pexels ids', () => {
      assert.throws(
        () =>
          DownloadSelectedAssetsArgsSchema.parse({
            assetIds: [{ assetType: 'photo', pexelsId: 0 }]
          }),
        /too_small/
      )
    })
  })

  describe('Candidate Safety Verification (Anti-Hallucination)', () => {
    it('verifies selected variant URL exists in registered candidates map', () => {
      const candidates = new Map<string, { pexelsId: number; variants: Array<{ url: string }> }>()
      candidates.set('photo_1001', {
        pexelsId: 1001,
        variants: [
          { url: 'https://images.pexels.com/photos/1001/large.jpg' },
          { url: 'https://images.pexels.com/photos/1001/medium.jpg' }
        ]
      })

      function verifyCandidateSelection(
        candidateMap: typeof candidates,
        pexelsId: number,
        selectedUrl: string
      ): boolean {
        const candidate = candidateMap.get(`photo_${pexelsId}`)
        if (!candidate) return false
        return candidate.variants.some((v) => v.url === selectedUrl)
      }

      // Valid candidate variant
      assert.equal(
        verifyCandidateSelection(
          candidates,
          1001,
          'https://images.pexels.com/photos/1001/large.jpg'
        ),
        true
      )

      // Hallucinated candidate ID
      assert.equal(
        verifyCandidateSelection(
          candidates,
          9999,
          'https://images.pexels.com/photos/9999/large.jpg'
        ),
        false
      )

      // Hallucinated URL for existing candidate
      assert.equal(
        verifyCandidateSelection(candidates, 1001, 'https://attacker.com/malicious-payload.jpg'),
        false
      )
    })
  })
})
