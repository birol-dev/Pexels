import assert from 'node:assert/strict'
import { isAbsolute, normalize } from 'node:path'
import { describe, it } from 'node:test'
import {
  filePathFromMediaUrl,
  isPathInside,
  toMediaUrl
} from '../src/main/services/files/path-safety.ts'

function legacyFilePathFromMediaUrl(requestUrl: string): string {
  const urlPath = requestUrl.replace(/^media:\/\/+/i, '')
  return normalize(decodeURIComponent(urlPath))
}

describe('media URL round-trip', () => {
  it('rejects the legacy media:// + Windows path form as an invalid URL', () => {
    const filePath = 'C:\\Users\\omerb\\Downloads\\project\\photos\\photo_1.jpg'
    assert.throws(() => new URL(`media://${filePath}`), { code: 'ERR_INVALID_URL' })
  })

  it('legacy handler treats Chromium-serialized drive-letter URLs as relative', () => {
    const serialized = new URL('media://C:/Users/omerb/Downloads/project/photos/photo_1.jpg').href
    const decoded = legacyFilePathFromMediaUrl(serialized)
    assert.equal(isAbsolute(decoded), false)
  })

  it('round-trips Windows paths through the query-param media URL', () => {
    if (process.platform !== 'win32') return
    const filePath = 'C:\\Users\\omerb\\Downloads\\project\\photos\\photo 1.jpg'
    const url = toMediaUrl(filePath)
    assert.equal(filePathFromMediaUrl(url), normalize(filePath))
    assert.equal(new URL(url).protocol, 'media:')
  })

  it('round-trips POSIX paths through the query-param media URL', () => {
    if (process.platform === 'win32') return
    const filePath = '/home/omerb/Downloads/project/photos/photo 1.jpg'
    const url = toMediaUrl(filePath)
    assert.equal(filePathFromMediaUrl(url), normalize(filePath))
    assert.equal(new URL(url).protocol, 'media:')
  })

  it('round-trips current platform paths through the query-param media URL', () => {
    const filePath =
      process.platform === 'win32'
        ? 'C:\\Users\\test\\photos\\photo 1.jpg'
        : '/tmp/photos/photo 1.jpg'
    const url = toMediaUrl(filePath)
    assert.equal(filePathFromMediaUrl(url), normalize(filePath))
    assert.equal(new URL(url).protocol, 'media:')
  })
})

describe('isPathInside', () => {
  it('accepts a file under the project directory', () => {
    const project = process.platform === 'win32' ? 'C:\\proj' : '/proj'
    const file = process.platform === 'win32' ? 'C:\\proj\\photos\\a.jpg' : '/proj/photos/a.jpg'
    assert.equal(isPathInside(project, file), true)
  })

  it('rejects a sibling directory that only shares a prefix', () => {
    const project = process.platform === 'win32' ? 'C:\\proj' : '/proj'
    const file = process.platform === 'win32' ? 'C:\\proj-evil\\a.jpg' : '/proj-evil/a.jpg'
    assert.equal(isPathInside(project, file), false)
  })

  it('rejects relative paths', () => {
    assert.equal(isPathInside('/proj', 'photos/a.jpg'), false)
  })
})
