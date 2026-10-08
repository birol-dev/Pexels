import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import {
  PexelsDownloader,
  type DownloadTask
} from '../src/main/services/pexels/pexels-downloader.ts'

const originalFetch = globalThis.fetch
const PHOTO_URL = 'https://images.pexels.com/photos/7/pexels-photo-7.jpeg'
const BODY = new Uint8Array(64).fill(7)

describe('PexelsDownloader size and disk limits', () => {
  let downloadDir: string
  let fetchInits: Array<RequestInit | undefined>

  /** Every download answers with BODY and this content-length header. */
  function serveWithContentLength(contentLength: number): void {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      fetchInits.push(init)
      return new Response(BODY, {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': String(contentLength) }
      })
    }) as typeof globalThis.fetch
  }

  async function downloadPhoto(): Promise<DownloadTask> {
    const downloader = new PexelsDownloader(1, undefined, 5)
    downloader.enqueue(7, 'photo', PHOTO_URL, 6000, 4000, 'quiet desk', downloadDir)
    await downloader.waitForIdle()
    return downloader.getTasks()[0]
  }

  const savedFiles = (): Promise<string[]> =>
    fs.readdir(join(downloadDir, 'photos')).catch(() => [])

  beforeEach(async () => {
    downloadDir = await fs.mkdtemp(join(tmpdir(), 'stockfinder-limits-'))
    fetchInits = []
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    mock.restoreAll()
    await fs.rm(downloadDir, { recursive: true, force: true })
  })

  it('validates redirects itself instead of letting fetch follow them', async () => {
    serveWithContentLength(BODY.length)

    const task = await downloadPhoto()

    assert.equal(task.status, 'completed')
    assert.deepEqual(
      fetchInits.map((init) => init?.redirect),
      ['manual']
    )
  })

  it('refuses a response that declares more than the size cap, without retrying', async () => {
    serveWithContentLength(5 * 1024 ** 3)

    const task = await downloadPhoto()

    assert.equal(task.status, 'failed')
    assert.match(task.error || '', /too large to download \(5120 MB\)/)
    assert.equal(fetchInits.length, 1)
    assert.deepEqual(await savedFiles(), [], 'nothing was written')
  })

  it('refuses a download that would not leave the free-space margin', async () => {
    serveWithContentLength(BODY.length)
    // About 4 MB free: room for the file, but not for the margin kept on top of it.
    mock.method(fs, 'statfs', async () => ({ bavail: 1000, bsize: 4096 }))

    const task = await downloadPhoto()

    assert.equal(task.status, 'failed')
    assert.match(task.error || '', /Not enough free disk space/)
    assert.equal(fetchInits.length, 1)
    assert.deepEqual(await savedFiles(), [], 'nothing was written')
  })

  it('still downloads when free space cannot be measured', async () => {
    serveWithContentLength(BODY.length)
    mock.method(fs, 'statfs', async () => {
      throw Object.assign(new Error('ENOSYS: function not implemented, statfs'), { code: 'ENOSYS' })
    })

    const task = await downloadPhoto()

    assert.equal(task.status, 'completed')
    assert.deepEqual(await savedFiles(), ['photo_7_6000x4000_quiet-desk.jpeg'])
  })
})
