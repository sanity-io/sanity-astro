import type {HistoryRefresh} from '@sanity/visual-editing/react'
import {describe, expect, it, vi} from 'vitest'

import {FOLLOW_UP_RELOAD_KEY} from './follow-up-reload'
import {
  createDefaultRefresh,
  type DefaultRefreshHost,
  type ReloadRefreshStrategy,
  resolveRefreshStrategy,
} from './refresh-strategy'

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

/** Runs one change-triggered refresh, then the arrival of the reloaded page. */
async function refreshThenArrive(strategy: ReloadRefreshStrategy | undefined) {
  const env = createHost()
  await createDefaultRefresh(resolveRefreshStrategy(strategy), env.host).refresh(mutationRefresh)
  const marked = env.store.has(FOLLOW_UP_RELOAD_KEY)
  const cancel = createDefaultRefresh(resolveRefreshStrategy(strategy), env.host).arrive()
  return {...env, marked, cancel}
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
    'with %s, reloads once and leaves nothing behind',
    async (strategy) => {
      const {reload, marked, cancel, timers} = await refreshThenArrive(strategy)

      expect(reload).toHaveBeenCalledTimes(1)
      expect(marked).toBe(false)
      expect(cancel).toBeUndefined()
      expect(timers.size).toBe(0)
    },
  )

  it('with a follow-up delay, reloads once more after that delay on arrival', async () => {
    const {reload, marked, cancel, timers, fireTimers} = await refreshThenArrive({
      type: 'reload',
      followUpDelayMs: 1200,
    })

    expect(reload).toHaveBeenCalledTimes(1)
    expect(marked).toBe(true)
    expect(typeof cancel).toBe('function')
    expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([1200])

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('keeps the follow-up reload across an effect remount on arrival', async () => {
    const strategy = resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})
    const {host, reload, timers, fireTimers} = createHost()
    await createDefaultRefresh(strategy, host).refresh(mutationRefresh)

    // The component's `useEffect(() => defaultRefresh.arrive())` under Strict Mode:
    // mount, cleanup, mount again.
    const defaultRefresh = createDefaultRefresh(strategy, host)
    defaultRefresh.arrive()?.()
    defaultRefresh.arrive()

    expect(timers.size).toBe(1)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('cancels the pending follow-up when another change reloads the page first', async () => {
    const strategy = resolveRefreshStrategy({type: 'reload', followUpDelayMs: 1200})
    const {host, store, reload, timers, fireTimers} = createHost()
    await createDefaultRefresh(strategy, host).refresh(mutationRefresh)

    const defaultRefresh = createDefaultRefresh(strategy, host)
    defaultRefresh.arrive()
    await defaultRefresh.refresh(mutationRefresh)

    expect(timers.size).toBe(0)
    expect(reload).toHaveBeenCalledTimes(2)
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(true)

    // The page that lands arms the follow-up for the newer change.
    createDefaultRefresh(strategy, host).arrive()
    expect(timers.size).toBe(1)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(3)
  })
})
