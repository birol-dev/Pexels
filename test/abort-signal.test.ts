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
    // The server holds its reply until the test releases it, so the only clock in play is
    // the timeout under test.
    let requestSeen = false
    let upstreamFinished = false
    let release = (): void => {}
    let markFinished = (): void => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    const finished = new Promise<void>((resolve) => (markFinished = resolve))
    const server = createServer((_req, res) => {
      requestSeen = true
      void released.then(() => {
        upstreamFinished = true
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        markFinished()
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}/`

    try {
      // On a busy machine the timeout can fire before the request reaches the server. The
      // fetch still aborts, but there is no upstream reply to watch, so try a longer timeout.
      for (const timeoutMs of [40, 200, 1000]) {
        const { signal, cleanup } = createTimeoutLinkedSignal(timeoutMs)
        try {
          await assert.rejects(
            () => fetch(url, { signal }),
            (error: unknown) => {
              return error instanceof Error && error.name === 'AbortError'
            }
          )
          assert.equal(signal.aborted, true)
        } finally {
          cleanup()
        }
        if (requestSeen) break
      }
      assert.equal(requestSeen, true)
      assert.equal(upstreamFinished, false)
      release()
      await finished
      assert.equal(upstreamFinished, true)
    } finally {
      release()
      // The aborted client sockets are already gone; this drops any the server still holds.
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })
})
