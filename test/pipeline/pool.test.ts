import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPool, firstFailure } from '../../src/main/services/pipeline/pool.ts'

const tick = (ms = 1): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('createPool', () => {
  it('runs no more tasks at once than its size, and all of them in the end', async () => {
    const pool = createPool(3)
    let active = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        pool(async () => {
          active++
          peak = Math.max(peak, active)
          await tick()
          active--
          return i
        })
      )
    )
    assert.equal(peak, 3)
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('starts waiting tasks in the order they asked', async () => {
    const pool = createPool(1)
    const started: number[] = []
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        pool(async () => {
          started.push(n)
          await tick()
        })
      )
    )
    assert.deepEqual(started, [1, 2, 3, 4])
  })

  it('gives its slot back when a task throws', async () => {
    const pool = createPool(1)
    const first = pool(async () => {
      throw new Error('boom')
    })
    const second = pool(async () => 'ran')
    await assert.rejects(first, /boom/)
    assert.equal(await second, 'ran')
  })

  it('starts no task once the signal aborts, and throws the reason instead', async () => {
    const controller = new AbortController()
    const pool = createPool(1, controller.signal)
    const started: number[] = []
    const tasks = [1, 2, 3].map((n) =>
      pool(async () => {
        started.push(n)
        if (n === 1) controller.abort(new Error('paused'))
        await tick()
      })
    )
    const settled = await Promise.allSettled(tasks)
    assert.deepEqual(started, [1])
    assert.equal(settled[0].status, 'fulfilled')
    assert.equal(settled[1].status, 'rejected')
    assert.equal(settled[2].status, 'rejected')
    assert.match(String((settled[1] as PromiseRejectedResult).reason), /paused/)
  })
})

describe('firstFailure', () => {
  it('returns the first rejection in order, or undefined when all succeeded', async () => {
    const settled = await Promise.allSettled([
      Promise.resolve(1),
      Promise.reject(new Error('first')),
      Promise.reject(new Error('second'))
    ])
    assert.match(String(firstFailure(settled)?.reason), /first/)
    assert.equal(firstFailure(await Promise.allSettled([Promise.resolve(1)])), undefined)
  })
})
