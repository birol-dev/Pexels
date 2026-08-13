import assert from 'node:assert/strict'
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
})
