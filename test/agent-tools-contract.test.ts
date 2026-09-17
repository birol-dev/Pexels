import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SearchPexelsPhotosArgsSchema,
  SearchPexelsVideosArgsSchema,
  SelectAssetsForDownloadArgsSchema,
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

    it('enforces page bounds between 1 and 10 and max perPage 80', () => {
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
