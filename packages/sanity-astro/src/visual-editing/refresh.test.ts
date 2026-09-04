import {afterEach, describe, expect, it, vi} from 'vitest'

import {createRefresher, type HistoryRefresh} from './refresh'

const manual: HistoryRefresh = {source: 'manual', livePreviewEnabled: false}
const mutation: HistoryRefresh = {
  source: 'mutation',
  livePreviewEnabled: false,
  document: {_id: 'movie-lab-1', _type: 'movie', _rev: '1'},
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((next, fail) => {
    resolve = next
    reject = fail
  })
  return {promise, resolve, reject}
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createRefresher', () => {
  it('coalesces three schedule() calls into one morph after the delay', async () => {
    vi.useFakeTimers()
    const morph = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'morph', morph, reload, mutationDelayMs: 200})

    refresher.schedule()
    refresher.schedule()
    refresher.schedule()
    expect(morph).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(199)
    expect(morph).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(morph).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('runs a second morph when flush() lands during an in-flight morph', async () => {
    const first = deferred()
    const morph = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'morph', morph, reload})

    const shared = refresher.flush()
    expect(morph).toHaveBeenCalledTimes(1)

    const again = refresher.flush()
    expect(again).toBe(shared)
    expect(morph).toHaveBeenCalledTimes(1)

    let settled = false
    void shared.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    first.resolve()
    await shared
    expect(settled).toBe(true)
    expect(morph).toHaveBeenCalledTimes(2)

    refresher.dispose()
  })

  it('refreshes immediately for a manual source and delays a mutation source', async () => {
    vi.useFakeTimers()
    const morph = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'morph', morph, reload, mutationDelayMs: 200})

    await refresher.refresh(manual)
    expect(morph).toHaveBeenCalledTimes(1)

    const pending = refresher.refresh(mutation)
    expect(morph).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    await pending
    expect(morph).toHaveBeenCalledTimes(2)

    refresher.dispose()
  })

  it('runs one settle morph after a mutation-triggered morph, and none after a manual one', async () => {
    vi.useFakeTimers()
    const morph = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({
      strategy: 'morph',
      morph,
      reload,
      mutationDelayMs: 200,
      settleDelayMs: 1000,
    })

    refresher.schedule()
    await vi.advanceTimersByTimeAsync(200)
    expect(morph).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(morph).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(morph).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(2)

    await refresher.refresh(manual)
    expect(morph).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(3)

    refresher.dispose()
  })

  it('restarts the mutation delay on every schedule() call', async () => {
    vi.useFakeTimers()
    const morph = vi.fn().mockResolvedValue(undefined)
    const refresher = createRefresher({
      strategy: 'morph',
      morph,
      reload: vi.fn(),
      mutationDelayMs: 200,
    })

    refresher.schedule()
    await vi.advanceTimersByTimeAsync(150)
    refresher.schedule()
    await vi.advanceTimersByTimeAsync(150)
    expect(morph).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(morph).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('falls back to reload once when morph rejects', async () => {
    const morph = vi.fn().mockRejectedValue(new Error('morph failed'))
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'morph', morph, reload})

    void refresher.flush()
    await Promise.resolve()
    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(morph).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('calls reload for strategy reload and leaves the returned promise pending', async () => {
    const morph = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'reload', morph, reload})

    const pending = refresher.refresh(manual)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(morph).not.toHaveBeenCalled()
    expect(pending).toBeInstanceOf(Promise)

    const tick = Promise.resolve('tick')
    await expect(
      Promise.race([(pending as Promise<void>).then(() => 'settled'), tick]),
    ).resolves.toBe('tick')

    refresher.dispose()
  })

  it('returns false from refresh after dispose and does not fire a scheduled morph', async () => {
    vi.useFakeTimers()
    const morph = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const refresher = createRefresher({strategy: 'morph', morph, reload, mutationDelayMs: 200})

    refresher.schedule()
    refresher.dispose()
    expect(refresher.refresh(manual)).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(morph).not.toHaveBeenCalled()
  })
})
