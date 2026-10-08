import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  photoVariantDimensions,
  variantDimensions
} from '../src/main/services/pexels/variant-dimensions.ts'
import { photo, video, videoFileUrl } from './support/pexels-fixtures.ts'

describe('photoVariantDimensions', () => {
  const landscape = photo(201, 'A quiet desk', 6000, 4000).src
  const size = (url: string, width = 6000, height = 4000): [number, number] => {
    const result = photoVariantDimensions(width, height, url)
    return [result.width, result.height]
  }

  it('gives the source size for "original", which has no size parameters', () => {
    assert.deepEqual(size(landscape.original), [6000, 4000])
  })

  it('fits the photo into the w x h box, times dpr, keeping its aspect ratio', () => {
    assert.deepEqual(size(landscape.large2x || ''), [1880, 1253])
    assert.deepEqual(size(landscape.large || ''), [940, 627])
  })

  it('scales by the height alone when only h is given', () => {
    assert.deepEqual(size(landscape.medium || ''), [525, 350])
    assert.deepEqual(size(landscape.small || ''), [195, 130])
  })

  it('gives the box itself for a fit=crop variant', () => {
    assert.deepEqual(size(landscape.landscape || ''), [1200, 627])
    assert.deepEqual(size(landscape.portrait || ''), [800, 1200])
    assert.deepEqual(size(landscape.tiny || ''), [280, 200])
  })

  it('is limited by the height of the box for a portrait photo', () => {
    const portrait = photo(202, 'A tall tree', 4000, 6000).src
    assert.deepEqual(size(portrait.large2x || '', 4000, 6000), [867, 1300])
  })

  it('does not upscale a photo that is smaller than the box', () => {
    const small = photo(203, 'A small icon', 800, 600).src
    assert.deepEqual(size(small.large2x || '', 800, 600), [800, 600])
  })
})

describe('variantDimensions', () => {
  it('uses the selected file size for a video', () => {
    const clip = video(101, 'city-street')
    const candidate = {
      type: 'video' as const,
      width: clip.width,
      height: clip.height,
      variants: clip.video_files.map((file) => ({
        url: file.link,
        width: file.width ?? undefined,
        height: file.height ?? undefined
      }))
    }

    assert.deepEqual(variantDimensions(candidate, videoFileUrl(clip, 'sd')), {
      width: 960,
      height: 540
    })
    assert.deepEqual(variantDimensions(candidate, videoFileUrl(clip, 'hd')), {
      width: 1920,
      height: 1080
    })
    assert.deepEqual(variantDimensions(candidate, videoFileUrl(clip, 'uhd')), {
      width: 3840,
      height: 2160
    })
  })

  it('falls back to the video size when the file does not say its own', () => {
    const candidate = {
      type: 'video' as const,
      width: 3840,
      height: 2160,
      variants: [{ url: 'https://videos.pexels.com/video-files/101/101-hd.mp4' }]
    }

    assert.deepEqual(variantDimensions(candidate, candidate.variants[0].url), {
      width: 3840,
      height: 2160
    })
    assert.deepEqual(variantDimensions(candidate, 'https://videos.pexels.com/other.mp4'), {
      width: 3840,
      height: 2160
    })
  })

  it('reads the size of a photo variant from its URL', () => {
    const still = photo(201, 'A quiet desk', 6000, 4000)
    const candidate = {
      type: 'photo' as const,
      width: still.width,
      height: still.height,
      variants: [{ url: still.src.original }, { url: still.src.large2x || '' }]
    }

    assert.deepEqual(variantDimensions(candidate, still.src.large2x || ''), {
      width: 1880,
      height: 1253
    })
    assert.deepEqual(variantDimensions(candidate, still.src.original), {
      width: 6000,
      height: 4000
    })
  })
})
