import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chooseVariant,
  choosePhotoVariant,
  chooseVideoFile,
  type Variant
} from '../src/main/services/pexels/choose-variant.ts'

function file(quality: string, width?: number, height?: number, fileType = 'video/mp4'): Variant {
  return { quality, fileType, width, height, url: `https://videos.pexels.com/${quality}.mp4` }
}

describe('chooseVideoFile', () => {
  it('prefers the smallest file that reaches full HD over a 4K one', () => {
    const files = [file('uhd', 3840, 2160), file('hd', 1920, 1080), file('sd', 960, 540)]
    assert.equal(chooseVideoFile(files)?.quality, 'hd')
  })

  it('takes a 2560 file over a 3840 one when there is no 1920 file', () => {
    const files = [file('uhd', 3840, 2160), file('qhd', 2560, 1440), file('sd', 960, 540)]
    assert.equal(chooseVideoFile(files)?.quality, 'qhd')
  })

  it('measures a portrait file by its long edge', () => {
    const files = [file('uhd', 2160, 3840), file('hd', 1080, 1920), file('sd', 540, 960)]
    assert.equal(chooseVideoFile(files)?.quality, 'hd')
  })

  it('falls back to the largest file when none reaches full HD', () => {
    const files = [file('sd', 640, 360), file('hd', 1280, 720), file('tiny', 320, 180)]
    assert.equal(chooseVideoFile(files)?.quality, 'hd')
  })

  it('skips files that are not MP4 while an MP4 exists', () => {
    const files = [file('webm', 1920, 1080, 'video/webm'), file('uhd', 3840, 2160)]
    assert.equal(chooseVideoFile(files)?.quality, 'uhd')
  })

  it('uses the other files when none is an MP4', () => {
    const files = [file('webm', 1920, 1080, 'video/webm'), file('small', 640, 360, 'video/webm')]
    assert.equal(chooseVideoFile(files)?.quality, 'webm')
  })

  it('counts a file with no type as an MP4', () => {
    const untyped = {
      quality: 'hd',
      url: 'https://videos.pexels.com/hd.mp4',
      width: 1920,
      height: 1080
    }
    assert.equal(chooseVideoFile([file('webm', 1920, 1080, 'video/webm'), untyped])?.quality, 'hd')
  })

  it('ignores files with no size while sized ones exist', () => {
    const files = [file('hls'), file('sd', 960, 540), file('hd', 1920, 1080)]
    assert.equal(chooseVideoFile(files)?.quality, 'hd')
  })

  it('still returns a file when none has a size, and nothing for an empty list', () => {
    assert.equal(chooseVideoFile([file('a'), file('b')])?.quality, 'a')
    assert.equal(chooseVideoFile([]), undefined)
  })

  it('does not reorder the list it was given', () => {
    const files = [file('sd', 640, 360), file('uhd', 3840, 2160), file('hd', 1920, 1080)]
    chooseVideoFile(files)
    assert.deepEqual(
      files.map((f) => f.quality),
      ['sd', 'uhd', 'hd']
    )
  })
})

describe('choosePhotoVariant', () => {
  const variants = ['original', 'large2x', 'large', 'medium', 'portrait', 'landscape'].map(
    (label) => ({ label, url: `https://images.pexels.com/${label}.jpeg` })
  )

  it('gives a landscape photo large2x', () => {
    assert.equal(choosePhotoVariant({ width: 6000, height: 4000, variants })?.label, 'large2x')
  })

  it('gives a square photo large2x', () => {
    assert.equal(choosePhotoVariant({ width: 3000, height: 3000, variants })?.label, 'large2x')
  })

  it('gives a portrait photo the original, since large2x is too small for a vertical edit', () => {
    assert.equal(choosePhotoVariant({ width: 4000, height: 6000, variants })?.label, 'original')
  })

  it('falls back to the original, then to the first variant', () => {
    const noLarge = variants.filter((v) => v.label !== 'large2x')
    assert.equal(
      choosePhotoVariant({ width: 6000, height: 4000, variants: noLarge })?.label,
      'original'
    )

    const odd = [{ label: 'medium', url: 'https://images.pexels.com/medium.jpeg' }]
    assert.equal(choosePhotoVariant({ width: 6000, height: 4000, variants: odd })?.label, 'medium')
    assert.equal(choosePhotoVariant({ width: 6000, height: 4000, variants: [] }), undefined)
  })
})

describe('chooseVariant', () => {
  it('picks a video file for a video and a photo variant for a photo', () => {
    const clip = {
      type: 'video' as const,
      width: 3840,
      height: 2160,
      variants: [file('uhd', 3840, 2160), file('hd', 1920, 1080)]
    }
    assert.equal(chooseVariant(clip)?.url, 'https://videos.pexels.com/hd.mp4')

    const still = {
      type: 'photo' as const,
      width: 6000,
      height: 4000,
      variants: [
        { label: 'original', url: 'o' },
        { label: 'large2x', url: 'l' }
      ]
    }
    assert.equal(chooseVariant(still)?.url, 'l')
  })
})
