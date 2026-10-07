import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runLoopThenFinalize } from '../src/main/services/agent/run-tail.ts'

type Harness = {
  events: string[]
  status: { value: string }
  run: () => Promise<void>
}

function harness(loop: (status: { value: string }) => Promise<void> | void): Harness {
  const events: string[] = []
  const status = { value: 'running' }
  const run = (): Promise<void> =>
    runLoopThenFinalize({
      getStatus: () => status.value,
      runLoop: async () => {
        events.push('loop')
        await loop(status)
      },
      onLoopError: (message) => events.push(`error:${message}`),
      settleDownloads: async () => {
        events.push('settle')
      },
      finalize: () => {
        events.push('finalize')
      }
    })
  return { events, status, run }
}

describe('runLoopThenFinalize', () => {
  it('runs the loop, settles downloads, then finalizes', async () => {
    const h = harness(() => undefined)
    await h.run()
    assert.deepEqual(h.events, ['loop', 'settle', 'finalize'])
  })

  it('records a real loop failure but still settles and finalizes', async () => {
    const h = harness(() => {
      throw new Error('Invalid API key')
    })
    await h.run()
    assert.deepEqual(h.events, ['loop', 'error:Invalid API key', 'settle', 'finalize'])
  })

  it('ignores the abort thrown when the user pauses mid-loop', async () => {
    const h = harness((status) => {
      status.value = 'paused'
      throw new Error('Request aborted')
    })
    await h.run()
    assert.deepEqual(h.events, ['loop'])
  })

  it('ignores the abort thrown when the user cancels mid-loop', async () => {
    const h = harness((status) => {
      status.value = 'cancelled'
      throw new Error('Request aborted')
    })
    await h.run()
    assert.deepEqual(h.events, ['loop'])
  })

  it('does not settle or finalize when the loop pauses for approval without throwing', async () => {
    const h = harness((status) => {
      status.value = 'paused'
    })
    await h.run()
    assert.deepEqual(h.events, ['loop'])
  })

  it('skips finalize if the run is paused while waiting for downloads', async () => {
    const events: string[] = []
    const status = { value: 'running' }
    await runLoopThenFinalize({
      getStatus: () => status.value,
      runLoop: async () => {
        events.push('loop')
      },
      onLoopError: (message) => events.push(`error:${message}`),
      settleDownloads: async () => {
        events.push('settle')
        status.value = 'paused'
      },
      finalize: () => events.push('finalize')
    })
    assert.deepEqual(events, ['loop', 'settle'])
  })

  it('stringifies non-Error throws', async () => {
    const h = harness(() => {
      throw 'plain failure'
    })
    await h.run()
    assert.deepEqual(h.events, ['loop', 'error:plain failure', 'settle', 'finalize'])
  })
})
