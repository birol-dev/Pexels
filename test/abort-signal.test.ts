import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import { createTimeoutLinkedSignal } from '../src/main/services/http/abort-signal.ts'

describe('createTimeoutLinkedSignal', () => {
  it('aborts immediately when the parent signal is already aborted', () => {
    const parent = new AbortController()
    parent.abort()
    const { signal, cleanup } = createTimeoutLinkedSignal(60_000, parent.signal)
    assert.equal(signal.aborted, true)
    cleanup()
  })

  it('aborts the child when the parent aborts later', async () => {
    const parent = new AbortController()
    const { signal, cleanup } = createTimeoutLinkedSignal(60_000, parent.signal)
    assert.equal(signal.aborted, false)
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
    parent.abort()
    await aborted
    assert.equal(signal.aborted, true)
    cleanup()
  })

  it('aborts an in-flight fetch while the delayed upstream reply can still finish', async () => {
    let upstreamFinished = false
    const server = createServer((_req, res) => {
      setTimeout(() => {
        upstreamFinished = true
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      }, 180)
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}/`

    const { signal, cleanup } = createTimeoutLinkedSignal(40)
    try {
      await assert.rejects(
        () => fetch(url, { signal }),
        (error: unknown) => {
          return error instanceof Error && error.name === 'AbortError'
        }
      )
      assert.equal(signal.aborted, true)
      assert.equal(upstreamFinished, false)
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal(upstreamFinished, true)
    } finally {
      cleanup()
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })
})
