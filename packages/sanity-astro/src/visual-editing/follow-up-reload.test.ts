import type {HistoryRefresh} from '@sanity/visual-editing/react'
import {describe, expect, it, vi} from 'vitest'

import {
  FOLLOW_UP_RELOAD_KEY,
  type FollowUpReloadHost,
  markFollowUpReload,
  scheduleFollowUpReload,
} from './follow-up-reload'

const DELAY = 1200
const PAGE_URL = 'http://localhost:4321/movies/abc'

const manualRefresh: HistoryRefresh = {source: 'manual', livePreviewEnabled: false}
const mutationRefresh: HistoryRefresh = {
  source: 'mutation',
  livePreviewEnabled: false,
  document: {_id: 'drafts.movie', _type: 'movie', _rev: 'rev1'},
}

/** In-memory stand-in for the browser: storage that survives reloads plus manual timers. */
function createHost() {
  const store = new Map<string, string>()
  const timers = new Map<number, {callback: () => void; delayMs: number}>()
  let nextId = 1
  const host: FollowUpReloadHost = {
    location: {href: PAGE_URL},
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
  return {host, store, timers, fireTimers}
}

describe('visual editing follow-up reload', () => {
  it('sets the marker only for mutation refreshes', () => {
    const {host, store} = createHost()

    markFollowUpReload(manualRefresh, host)
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)

    markFollowUpReload(mutationRefresh, host)
    expect(store.get(FOLLOW_UP_RELOAD_KEY)).toBe(PAGE_URL)
  })

  it('schedules exactly one reload after the delay and consumes the marker when it fires', () => {
    const {host, store, timers, fireTimers} = createHost()
    const reload = vi.fn()
    markFollowUpReload(mutationRefresh, host)

    const cancel = scheduleFollowUpReload(host, reload, DELAY)

    expect(typeof cancel).toBe('function')
    expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([DELAY])
    expect(reload).not.toHaveBeenCalled()

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
  })

  it('re-arms the reload when the island remounts before it fires', () => {
    const {host, timers, fireTimers} = createHost()
    const reload = vi.fn()
    markFollowUpReload(mutationRefresh, host)

    // Strict Mode mounts, unmounts and mounts the island again on arrival.
    scheduleFollowUpReload(host, reload, DELAY)?.()
    const cancel = scheduleFollowUpReload(host, reload, DELAY)

    expect(typeof cancel).toBe('function')
    expect(timers.size).toBe(1)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing after a plain navigation or a manual refresh', () => {
    const {host, timers} = createHost()
    const reload = vi.fn()

    // Plain navigation: nothing ever marked.
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()

    // Manual refresh button: reload happens, but no marker is left behind.
    markFollowUpReload(manualRefresh, host)
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()

    expect(timers.size).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('discards a marker left for a different URL instead of reloading it', () => {
    const {host, store, timers} = createHost()
    const reload = vi.fn()
    markFollowUpReload(mutationRefresh, host)

    // A Presentation navigation won the race against the reload: a different
    // page arrives carrying the stale marker.
    host.location.href = 'http://localhost:4321/movies/def'
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()

    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('is not re-armed by the follow-up reload itself', () => {
    const {host, store, fireTimers} = createHost()
    const reload = vi.fn()
    markFollowUpReload(mutationRefresh, host)

    // First arrival after the mutation reload: schedule, consume on fire.
    scheduleFollowUpReload(host, reload, DELAY)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)

    // The follow-up reload bypasses `refresh`, so the page that arrives next
    // finds no marker and schedules nothing.
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending reload when asked to', () => {
    const {host, timers, fireTimers} = createHost()
    const reload = vi.fn()
    markFollowUpReload(mutationRefresh, host)

    scheduleFollowUpReload(host, reload, DELAY)?.()

    expect(timers.size).toBe(0)
    fireTimers()
    expect(reload).not.toHaveBeenCalled()
  })

  it('degrades to no follow-up when storage is unavailable', () => {
    const {host: timersOnly, timers} = createHost()
    const host: FollowUpReloadHost = {
      ...timersOnly,
      get sessionStorage(): never {
        throw new Error('SecurityError')
      },
    }
    const reload = vi.fn()

    expect(() => markFollowUpReload(mutationRefresh, host)).not.toThrow()
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()
    expect(timers.size).toBe(0)
  })
})
