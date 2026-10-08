import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  photoResultForModel,
  shapeForPlatform,
  shapeOf,
  slugFromPexelsUrl,
  videoResultForModel
} from '../src/main/services/agent/tool-results.ts'
import { photo, video } from './support/pexels-fixtures.ts'

describe('shapeOf', () => {
  it('names landscape, portrait and square sizes', () => {
    assert.equal(shapeOf(1920, 1080), 'landscape')
    assert.equal(shapeOf(1080, 1920), 'portrait')
    assert.equal(shapeOf(1000, 1000), 'square')
  })

  it('treats ratios from 0.9 to 1.1 as square, boundaries included', () => {
    assert.equal(shapeOf(1100, 1000), 'square')
    assert.equal(shapeOf(1101, 1000), 'landscape')
    assert.equal(shapeOf(1000, 1111), 'square')
    assert.equal(shapeOf(1000, 1112), 'portrait')
    assert.equal(shapeOf(900, 1000), 'square')
    assert.equal(shapeOf(899, 1000), 'portrait')
  })
})

describe('shapeForPlatform', () => {
  it('wants landscape for YouTube and portrait for the vertical platforms', () => {
    assert.equal(shapeForPlatform('YouTube'), 'landscape')
    assert.equal(shapeForPlatform('Shorts'), 'portrait')
    assert.equal(shapeForPlatform('TikTok'), 'portrait')
    assert.equal(shapeForPlatform('Instagram Reels'), 'portrait')
  })
})

describe('slugFromPexelsUrl', () => {
  it('turns the slug of a video page into words', () => {
    assert.equal(
      slugFromPexelsUrl('https://www.pexels.com/video/waves-crashing-on-rocks-1234/'),
      'waves crashing on rocks'
    )
  })

  it('reads a photo page the same way', () => {
    assert.equal(
      slugFromPexelsUrl('https://www.pexels.com/photo/brown-wooden-chairs-near-table-5678/'),
      'brown wooden chairs near table'
    )
  })

  it('does not need the trailing slash', () => {
    assert.equal(slugFromPexelsUrl('https://www.pexels.com/video/city-street-9'), 'city street')
  })

  it('keeps a slug that has no id', () => {
    assert.equal(slugFromPexelsUrl('https://www.pexels.com/video/city-street/'), 'city street')
  })

  it('gives nothing for an empty URL or a page that is only an id', () => {
    assert.equal(slugFromPexelsUrl(''), '')
    assert.equal(slugFromPexelsUrl('https://www.pexels.com/video/1234/'), '')
  })
})

describe('photoResultForModel', () => {
  it('keeps the id, the alt text, the shape and the size', () => {
    assert.deepEqual(photoResultForModel(photo(201, 'A quiet desk', 4000, 6000)), {
      pexelsId: 201,
      about: 'A quiet desk',
      shape: 'portrait',
      size: '4000x6000'
    })
  })

  it('describes a photo without alt text by the slug of its page', () => {
    const noAlt = { ...photo(201, 'A quiet desk'), alt: null }
    assert.equal(photoResultForModel(noAlt).about, 'a quiet desk')
    assert.equal(photoResultForModel({ ...noAlt, alt: '' }).about, 'a quiet desk')
  })

  it('shows no URL, photographer or color', () => {
    const shown = JSON.stringify(photoResultForModel(photo(201, 'A quiet desk')))
    assert.doesNotMatch(shown, /https?:\/\/|images\.|photographer|avg|#808080/i)
  })
})

describe('videoResultForModel', () => {
  it('keeps the id, the slug, the shape, the size and the length', () => {
    assert.deepEqual(videoResultForModel(video(101, 'city-street', undefined, 14)), {
      pexelsId: 101,
      about: 'city street',
      shape: 'landscape',
      size: '3840x2160',
      seconds: 14,
      fullHd: true
    })
  })

  it('says whether any file reaches full HD, in either orientation', () => {
    const small = video(1, 'a', [
      ['hd', 1280, 720],
      ['sd', 640, 360]
    ])
    const tall = video(2, 'b', [['hd', 1080, 1920]])
    assert.equal(videoResultForModel(small).fullHd, false)
    assert.equal(videoResultForModel(tall).fullHd, true)
    assert.equal(videoResultForModel(tall).shape, 'portrait')
  })

  it('reports zero seconds for a clip with no duration', () => {
    const clip = { ...video(101, 'city-street'), duration: undefined }
    assert.equal(videoResultForModel(clip).seconds, 0)
  })

  it('shows no download URL, creator or preview link', () => {
    const shown = JSON.stringify(videoResultForModel(video(101, 'city-street')))
    assert.doesNotMatch(shown, /https?:\/\/|videos\.|images\.|creator|preview/i)
  })
})

describe('size of a search result', () => {
  it('stays under 2,500 characters for 15 photos', () => {
    const photos = Array.from({ length: 15 }, (_, i) =>
      photo(2_000_000 + i, `Person working at a wooden desk near window ${i}`)
    )

    const shown = JSON.stringify({
      total_results: 8000,
      results: photos.map(photoResultForModel)
    })

    assert.ok(shown.length < 2500, `${shown.length} characters`)
    assert.doesNotMatch(shown, /https:\/\/images\.|https:\/\/videos\./)
  })

  it('is a small fraction of what the full photo record weighs', () => {
    const photos = Array.from({ length: 15 }, (_, i) => photo(2_000_000 + i, `A quiet desk ${i}`))

    const slim = JSON.stringify(photos.map(photoResultForModel)).length
    const full = JSON.stringify(photos).length

    assert.ok(slim < full * 0.2, `${slim} of ${full} characters`)
  })
})
