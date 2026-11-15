import type {HistoryRefresh} from '@sanity/visual-editing/react'
import {describe, expect, it, vi} from 'vitest'

import {FOLLOW_UP_RELOAD_KEY} from './follow-up-reload'
import {
  createDefaultRefresh,
  type DefaultRefreshHost,
  resolveRefreshStrategy,
} from './refresh-strategy'

const manualRefresh: HistoryRefresh = {
  source: 'manual',
  livePreviewEnabled: false,
}

const mutationRefresh: HistoryRefresh = {
  source: 'mutation',
  livePreviewEnabled: false,
  document: {_id: 'drafts.movie', _type: 'movie', _rev: 'rev1'},
}

/** Storage that survives "reloads", manual timers and a counted `location.reload`. */
function createHost() {
  const store = new Map<string, string>()
  const timers = new Map<number, {callback: () => void; delayMs: number}>()
  let nextId = 1
  const reload = vi.fn()
  const host: DefaultRefreshHost = {
    location: {href: 'http://localhost:4321/movies/abc', reload},
    sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    },
    setTimeout: (callback, delayMs) => {
      const id = nextId++
      timers.set(id, {callback, delayMs})
      return id
    },
    clearTimeout: (id) => void timers.delete(id),
  }
  const fireTimers = () => {
    const due = [...timers.values()]
    timers.clear()
    due.forEach((timer) => timer.callback())
  }
  return {host, store, timers, reload, fireTimers}
}

describe('resolveRefreshStrategy', () => {
  it('defaults to a plain reload with no follow-up', () => {
    expect(resolveRefreshStrategy(undefined)).toEqual({type: 'reload', followUpDelayMs: undefined})
  })

  it('selects a plain reload with the shorthand', () => {
    expect(resolveRefreshStrategy('reload')).toEqual({type: 'reload', followUpDelayMs: undefined})
  })

  it('selects a reload with a follow-up reload', () => {
    expect(resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})).toEqual({
      type: 'reload',
      followUpDelayMs: 1200,
    })
  })

  it('parses a stringified strategy passed from an astro template', () => {
    expect(resolveRefreshStrategy('{type: "reload", followUpDelayMs: 1200}')).toEqual({
      type: 'reload',
      followUpDelayMs: 1200,
    })
  })

  it('selects the in-place refresh', () => {
    expect(resolveRefreshStrategy('in-place')).toEqual({type: 'in-place'})
  })

  it('drops a follow-up delay that would do nothing', () => {
    for (const followUpDelayMs of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveRefreshStrategy({type: 'reload', followUpDelayMs})).toEqual({
        type: 'reload',
        followUpDelayMs: undefined,
      })
    }
  })
})

describe('createDefaultRefresh', () => {
  it.each([undefined, 'reload'] as const)(
    'with %s, acknowledges any pending flag, reloads once, and arms nothing on arrival',
    async (strategy) => {
      const {host, store, reload, timers, fireTimers} = createHost()
      store.set(FOLLOW_UP_RELOAD_KEY, host.location.href)

      const resolved = resolveRefreshStrategy(strategy)
      await createDefaultRefresh(resolved, host).refresh(mutationRefresh)

      // Flag is cleared synchronously; reload is queued on a 0ms macrotask.
      expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
      expect([...timers.values()].map((t) => t.delayMs)).toEqual([0])
      fireTimers()
      expect(reload).toHaveBeenCalledTimes(1)

      const cancel = createDefaultRefresh(resolved, host).arrive()
      expect(cancel).toBeUndefined()
      expect(timers.size).toBe(0)
    },
  )

  it('handles manual refreshes and rejects unknown refresh sources', async () => {
    const {host, reload, timers, fireTimers} = createHost()
    const defaultRefresh = createDefaultRefresh(resolveRefreshStrategy('reload'), host)

    expect(defaultRefresh.refresh({source: 'unknown'} as unknown as HistoryRefresh)).toBe(false)
    expect(timers.size).toBe(0)

    await defaultRefresh.refresh(manualRefresh)
    expect([...timers.values()].map((t) => t.delayMs)).toEqual([0])
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reconciles an unacknowledged snapshot flag on arrival after followUpDelayMs', () => {
    const {host, store, reload, timers, fireTimers} = createHost()
    const strategy = resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})

    // Simulate a trailing keystroke snapshot-event that arrived during the reload window.
    store.set(FOLLOW_UP_RELOAD_KEY, host.location.href)

    const cancel = createDefaultRefresh(strategy, host).arrive()
    expect(typeof cancel).toBe('function')
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([1200])

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps the follow-up reload across an effect remount on arrival', () => {
    const strategy = resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})
    const {host, store, reload, timers, fireTimers} = createHost()
    store.set(FOLLOW_UP_RELOAD_KEY, host.location.href)

    // The component's `useEffect(() => defaultRefresh.arrive())` under Strict Mode:
    // mount, cleanup, mount again.
    const defaultRefresh = createDefaultRefresh(strategy, host)
    defaultRefresh.arrive()?.()
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    defaultRefresh.arrive()

    expect(timers.size).toBe(1)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending follow-up when a regular refresh arrives first', async () => {
    const strategy = resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})
    const {host, store, reload, timers, fireTimers} = createHost()
    store.set(FOLLOW_UP_RELOAD_KEY, host.location.href)

    const defaultRefresh = createDefaultRefresh(strategy, host)
    defaultRefresh.arrive()
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(1)

    await defaultRefresh.refresh(mutationRefresh)

    // The 1200ms arrival timer is cancelled and replaced by the 0ms immediate reload.
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect([...timers.values()].map((t) => t.delayMs)).toEqual([0])
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
