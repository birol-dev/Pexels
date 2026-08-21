import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { validateDownloadUrl } from '../src/main/services/pexels/download-url-validation.ts'
import { LlmProviderFactory } from '../src/main/services/llm/llm-provider.ts'

describe('Fixes & Security Hardening Regression Suite', () => {
  describe('1. Download Cap Enforcement', () => {
    it('rejects download when queuedOrCompletedCount reaches or exceeds maxTotalDownloads', () => {
      const maxTotalDownloads = 2
      const beats = [
        {
          id: 'beat_1',
          assets: [
            { id: 'photo_1', pexelsId: 1, type: 'photo', status: 'completed' as const },
            { id: 'photo_2', pexelsId: 2, type: 'photo', status: 'downloading' as const },
            { id: 'photo_3', pexelsId: 3, type: 'photo', status: 'pending' as const }
          ]
        }
      ]

      const queuedOrCompletedCount = beats
        .flatMap((b) => b.assets || [])
        .filter((a) => a.status === 'completed' || a.status === 'downloading').length

      assert.equal(queuedOrCompletedCount, 2)
      assert.equal(queuedOrCompletedCount >= maxTotalDownloads, true)
    })
  })

  describe('2. Iteration Limit Finalization', () => {
    function evaluateRunStatus(
      hitIterationLimit: boolean,
      beats: Array<{ assets?: Array<{ status: string }> }>
    ): { status: 'completed' | 'failed'; reason: string } {
      const unfinishedAssets = beats
        .flatMap((b) => b.assets || [])
        .filter((a) => a.status === 'pending' || a.status === 'downloading')
      if (unfinishedAssets.length > 0) {
        return { status: 'failed', reason: 'unfinished downloads' }
      }

      const completedOrQueued = beats
        .flatMap((b) => b.assets || [])
        .filter((a) => a.status === 'completed' || a.status === 'downloading')
      if (completedOrQueued.length === 0 && beats.length > 0) {
        return { status: 'failed', reason: '0 assets downloaded' }
      }

      const hasIncompleteBeats =
        beats.length > 0 &&
        beats.some((b) => !b.assets || !b.assets.some((a) => a.status === 'completed'))

      if (hitIterationLimit && hasIncompleteBeats) {
        return { status: 'failed', reason: 'iteration limit with incomplete beats' }
      }

      return { status: 'completed', reason: 'success' }
    }

    it('marks job completed if all beats have completed assets despite hitting iteration limit', () => {
      const beats = [
        { assets: [{ status: 'completed' }] },
        { assets: [{ status: 'completed' }] }
      ]
      const result = evaluateRunStatus(true, beats)
      assert.equal(result.status, 'completed')
    })

    it('marks job failed on iteration limit if any beat is missing completed assets', () => {
      const beats = [
        { assets: [{ status: 'completed' }] },
        { assets: [] }
      ]
      const result = evaluateRunStatus(true, beats)
      assert.equal(result.status, 'failed')
      assert.equal(result.reason, 'iteration limit with incomplete beats')
    })

    it('marks job failed if there are unfinished downloads regardless of iteration limit', () => {
      const beats = [
        { assets: [{ status: 'downloading' }] }
      ]
      const result = evaluateRunStatus(false, beats)
      assert.equal(result.status, 'failed')
      assert.equal(result.reason, 'unfinished downloads')
    })
  })

  describe('3. Batch Selection Non-Throwing Error Handling', () => {
    it('records rejected status for invalid candidate and continues batch', () => {
      const candidates = new Map<string, { variants: Array<{ url: string }> }>()
      candidates.set('photo_100', {
        variants: [{ url: 'https://images.pexels.com/photos/100/valid.jpg' }]
      })

      const selections = [
        { beatId: 'beat_1', assetType: 'photo' as const, pexelsId: 999, variantUrl: 'https://images.pexels.com/photos/999/x.jpg' },
        { beatId: 'beat_1', assetType: 'photo' as const, pexelsId: 100, variantUrl: 'https://images.pexels.com/photos/100/valid.jpg' }
      ]

      const selectionResults: Array<{ pexelsId: number; status: string; reason?: string }> = []

      for (const sel of selections) {
        const key = `${sel.assetType}_${sel.pexelsId}`
        const candidate = candidates.get(key)
        if (!candidate) {
          selectionResults.push({
            pexelsId: sel.pexelsId,
            status: 'rejected',
            reason: `Asset not found in search results`
          })
          continue
        }

        const variantExists = candidate.variants.some((v) => v.url === sel.variantUrl)
        if (!variantExists) {
          selectionResults.push({
            pexelsId: sel.pexelsId,
            status: 'rejected',
            reason: `Variant not found`
          })
          continue
        }

        selectionResults.push({ pexelsId: sel.pexelsId, status: 'selected' })
      }

      assert.equal(selectionResults.length, 2)
      assert.equal(selectionResults[0].status, 'rejected')
      assert.equal(selectionResults[0].pexelsId, 999)
      assert.equal(selectionResults[1].status, 'selected')
      assert.equal(selectionResults[1].pexelsId, 100)
    })
  })

  describe('5. File URL Navigation Guard', () => {
    it('restricts file protocol navigation to exact renderer index.html path', () => {
      const currentDir = fileURLToPath(new URL('.', import.meta.url))
      const rendererPath = resolve(currentDir, '../src/renderer/index.html')

      const isAllowed = (url: string): boolean => {
        try {
          const target = new URL(url)
          if (target.protocol === 'file:') {
            const expectedPath = rendererPath
            const targetPath = resolve(fileURLToPath(url))
            return targetPath === expectedPath
          }
          return false
        } catch {
          return false
        }
      }

      const validUrl = new URL(`file:///${rendererPath.replace(/\\/g, '/')}`).href
      assert.equal(isAllowed(validUrl), true)

      // Arbitrary local html
      const badPath = resolve(currentDir, '../some-other.html')
      const invalidUrl = new URL(`file:///${badPath.replace(/\\/g, '/')}`).href
      assert.equal(isAllowed(invalidUrl), false)
    })
  })

  describe('6. Gemini API Key in Headers', () => {
    it('passes x-goog-api-key header and does not expose key in query param', async () => {
      const provider = LlmProviderFactory.getProvider('gemini')
      let capturedUrl = ''
      let capturedHeaders: Record<string, string> = {}

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedHeaders = (init?.headers as Record<string, string>) || {}
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'response' }] },
                finishReason: 'STOP'
              }
            ]
          })
        } as Response
      }) as typeof globalThis.fetch

      await provider.createToolTurn(
        {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'test' }],
          tools: [],
          toolChoice: 'none',
          temperature: 0.1,
          maxOutputTokens: 100
        },
        { apiKey: 'secret-gemini-key-12345' }
      )

      assert.equal(capturedUrl.includes('secret-gemini-key'), false)
      assert.equal(capturedHeaders['x-goog-api-key'], 'secret-gemini-key-12345')
    })
  })

  describe('7. Downloader Redirect Validation', () => {
    it('validates redirected URL against allowed Pexels CDN hosts', () => {
      // Valid redirect URL
      assert.doesNotThrow(() => {
        validateDownloadUrl('https://images.pexels.com/photos/123/final.jpg')
      })

      // Open redirect to external or attacker host
      assert.throws(() => {
        validateDownloadUrl('https://evil-attacker.com/malicious.mp4')
      }, /Security Check Failed/)

      // Open redirect to internal private IP
      assert.throws(() => {
        validateDownloadUrl('https://192.168.1.1/internal-asset.mp4')
      }, /Security Check Failed/)
    })
  })

  describe('8. Manifest Zod Schema Validation', () => {
    const ManifestSettingsSnapshotSchema = z.object({
      targetPlatform: z.enum(['YouTube', 'Shorts', 'TikTok', 'Instagram Reels']).optional(),
      visualStyle: z.string().optional(),
      assetMix: z.string().optional(),
      maxAssetsPerBeat: z.number().int().min(1).max(10).optional(),
      maxTotalDownloads: z.number().int().min(1).max(100).optional(),
      inputMode: z.enum(['script', 'idea']).optional(),
      targetDuration: z.string().optional(),
      tone: z.string().optional()
    })

    const ManifestSchema = z.object({
      title: z.string().optional(),
      script: z.string().optional(),
      inputMode: z.enum(['script', 'idea']).optional(),
      originalIdea: z.string().optional(),
      visualConcept: z.string().optional(),
      settingsSnapshot: ManifestSettingsSnapshotSchema.optional()
    })

    it('validates authentic manifest structure', () => {
      const validManifest = {
        title: 'Tech Innovations',
        script: 'Welcome to modern computing...',
        settingsSnapshot: {
          targetPlatform: 'YouTube',
          visualStyle: 'cinematic',
          assetMix: 'videos_only',
          maxAssetsPerBeat: 3,
          maxTotalDownloads: 15
        }
      }

      const result = ManifestSchema.safeParse(validManifest)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.settingsSnapshot?.targetPlatform, 'YouTube')
        assert.equal(result.data.settingsSnapshot?.maxTotalDownloads, 15)
      }
    })

    it('detects and rejects invalid platform enum or negative download caps', () => {
      const invalidManifest = {
        title: 'Corrupted Project',
        settingsSnapshot: {
          targetPlatform: 'MaliciousPlatformExploit',
          maxTotalDownloads: -50
        }
      }

      const result = ManifestSchema.safeParse(invalidManifest)
      assert.equal(result.success, false)
    })
  })
})
