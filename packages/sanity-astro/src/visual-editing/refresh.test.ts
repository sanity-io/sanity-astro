import {afterEach, describe, expect, it, vi} from 'vitest'

import {createRefresher, type HistoryRefresh, type MorphOutcome} from './refresh'

const manual: HistoryRefresh = {source: 'manual', livePreviewEnabled: false}
const mutation: HistoryRefresh = {
  source: 'mutation',
  livePreviewEnabled: false,
  document: {_id: 'movie-lab-1', _type: 'movie', _rev: '1'},
}

const applied = () =>
  vi.fn<(signal: AbortSignal) => Promise<MorphOutcome>>().mockResolvedValue('applied')

function deferred() {
  let resolve!: (outcome: MorphOutcome) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<MorphOutcome>((next, fail) => {
    resolve = next
    reject = fail
  })
  return {promise, resolve, reject}
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createRefresher', () => {
  it('coalesces three schedule() calls into one morph after the delay', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload, mutationDelayMs: 200})

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
    const morph = applied().mockImplementationOnce(() => first.promise)
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload})

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

    first.resolve('applied')
    await shared
    expect(settled).toBe(true)
    expect(morph).toHaveBeenCalledTimes(2)

    refresher.dispose()
  })

  it('refreshes immediately for a manual source and delays a mutation source', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload, mutationDelayMs: 200})

    await refresher.refresh(manual)
    expect(morph).toHaveBeenCalledTimes(1)

    const pending = refresher.refresh(mutation)
    expect(morph).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    await pending
    expect(morph).toHaveBeenCalledTimes(2)

    refresher.dispose()
  })

  it('runs one settle morph after a stream-scheduled morph, and none after manual or upstream ones', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const reload = vi.fn()
    const refresher = createRefresher({
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

    // Presentation already re-fires its mutation refresh after a second, so no settle pass here.
    const pending = refresher.refresh(mutation)
    await vi.advanceTimersByTimeAsync(200)
    await pending
    expect(morph).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(4)

    refresher.dispose()
  })

  it('pushes a pending settle pass out to one second after a refresh inside its window', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const refresher = createRefresher({
      morph,
      reload: vi.fn(),
      mutationDelayMs: 200,
      settleDelayMs: 1000,
    })

    refresher.schedule()
    await vi.advanceTimersByTimeAsync(200)
    expect(morph).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(300)
    await refresher.refresh(manual)
    expect(morph).toHaveBeenCalledTimes(2)

    // The settle pass armed by the first morph would have fired here, right after the refresh.
    await vi.advanceTimersByTimeAsync(700)
    expect(morph).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(300)
    expect(morph).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(3)

    refresher.dispose()
  })

  it('drops a pending settle pass when a later morph asks for a reload', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload, mutationDelayMs: 200, settleDelayMs: 1000})

    refresher.schedule()
    await vi.advanceTimersByTimeAsync(200)
    expect(morph).toHaveBeenCalledTimes(1)

    morph.mockResolvedValueOnce('reload')
    await refresher.refresh(manual)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(morph).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('keeps the shared promise pending until a pass scheduled mid-morph has run', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const morph = applied().mockImplementationOnce(() => first.promise)
    const refresher = createRefresher({
      morph,
      reload: vi.fn(),
      mutationDelayMs: 200,
    })

    const flushed = refresher.flush()
    const delayed = refresher.refresh(mutation)
    expect(delayed).toBe(flushed)
    let settled = false
    void flushed.then(() => {
      settled = true
    })

    first.resolve('applied')
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    expect(morph).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)
    await flushed
    expect(settled).toBe(true)
    expect(morph).toHaveBeenCalledTimes(2)

    refresher.dispose()
  })

  it('aborts an in-flight morph on dispose without reloading', async () => {
    let signal: AbortSignal | undefined
    const morph = vi.fn((s: AbortSignal) => {
      signal = s
      return new Promise<MorphOutcome>((_, reject) => {
        s.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload})

    const pending = refresher.flush()
    refresher.dispose()
    await pending

    expect(signal?.aborted).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when a morph asks for one after it was aborted', async () => {
    const morph = vi.fn(
      (signal: AbortSignal) =>
        new Promise<MorphOutcome>((resolve) => {
          signal.addEventListener('abort', () => resolve('reload'))
        }),
    )
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload})

    const pending = refresher.flush()
    refresher.dispose()
    await pending

    expect(reload).not.toHaveBeenCalled()
  })

  it('restarts the mutation delay on every schedule() call', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const refresher = createRefresher({
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

  it('reloads once, quietly, when the morph reports a case only a reload handles', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const morph = applied().mockResolvedValueOnce('reload')
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload})

    await refresher.flush()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(morph).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()

    // The page did not unload (a test, a blocked beforeunload): the morph is still trusted.
    await refresher.refresh(manual)
    expect(morph).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('reports a throwing morph once, reloads, and stops morphing from then on', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const morph = applied().mockRejectedValueOnce(new TypeError('context moved'))
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload, mutationDelayMs: 200})

    await refresher.flush()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toMatch(/in-place refresh threw/)
    expect(error.mock.calls[0]?.[1]).toBeInstanceOf(TypeError)

    // Presentation's refreshes reload the page as they did before the opt-in...
    await expect(refresher.refresh(manual)).resolves.toBeUndefined()
    await expect(refresher.refresh(mutation)).resolves.toBeUndefined()
    expect(reload).toHaveBeenCalledTimes(3)
    // ...and the document stream no longer triggers anything.
    refresher.schedule()
    await vi.advanceTimersByTimeAsync(5000)
    expect(morph).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(3)
    expect(error).toHaveBeenCalledTimes(1)

    refresher.dispose()
  })

  it('returns false from refresh after dispose and does not fire a scheduled morph', async () => {
    vi.useFakeTimers()
    const morph = applied()
    const reload = vi.fn()
    const refresher = createRefresher({morph, reload, mutationDelayMs: 200})

    refresher.schedule()
    refresher.dispose()
    expect(refresher.refresh(manual)).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(morph).not.toHaveBeenCalled()
  })
})
