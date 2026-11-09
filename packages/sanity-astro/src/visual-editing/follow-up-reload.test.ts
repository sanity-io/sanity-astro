import type {HistoryRefresh} from '@sanity/visual-editing/react'
import {describe, expect, it, vi} from 'vitest'

import {
  acknowledgeFollowUpReload,
  FOLLOW_UP_RELOAD_KEY,
  type FollowUpReloadHost,
  markFollowUpReload,
  scheduleFollowUpReload,
} from './follow-up-reload'

const DELAY = 1200
const PAGE_URL = 'http://localhost:4321/movies/abc'

const mutationRefresh: HistoryRefresh = {
  source: 'mutation',
  livePreviewEnabled: false,
  document: {_id: 'drafts.movie', _type: 'movie', _rev: 'rev1'},
}

/** In-memory stand-in for the browser: storage, timers, and message/load listeners. */
function createHost(readyState: DocumentReadyState = 'complete') {
  const store = new Map<string, string>()
  const timers = new Map<number, {callback: () => void; delayMs: number}>()
  const listeners = new Map<string, Array<(event: unknown) => void>>()
  let nextId = 1

  const doc = {readyState}
  const host: FollowUpReloadHost = {
    location: {href: PAGE_URL},
    document: doc,
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
    addEventListener: ((type: string, listener: (event: unknown) => void) => {
      const list = listeners.get(type) ?? []
      list.push(listener)
      listeners.set(type, list)
    }) as Window['addEventListener'],
  }

  const fireTimers = () => {
    const due = [...timers.values()]
    timers.clear()
    due.forEach((timer) => timer.callback())
  }

  const dispatchMessage = (data: unknown) => {
    for (const listener of listeners.get('message') ?? []) {
      listener({data} as MessageEvent)
    }
  }

  const dispatchLoad = () => {
    doc.readyState = 'complete'
    for (const listener of listeners.get('load') ?? []) {
      listener({} as Event)
    }
  }

  return {host, store, timers, listeners, fireTimers, dispatchMessage, dispatchLoad}
}

describe('visual editing follow-up reload', () => {
  it('marks the URL-scoped flag and arms a fallback timer only on mutation snapshot-events', () => {
    const {host, store, timers, fireTimers, dispatchMessage} = createHost('complete')
    const reload = vi.fn()

    scheduleFollowUpReload(host, reload, DELAY)

    // Handshake welcome, reconnect, and initial preview-snapshots must be ignored.
    dispatchMessage({type: 'presentation/snapshot-event', data: {event: {type: 'welcome'}}})
    dispatchMessage({type: 'presentation/snapshot-event', data: {event: {type: 'reconnect'}}})
    dispatchMessage({type: 'presentation/preview-snapshots'})

    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(0)

    // Actual live mutation event sets the URL-scoped flag and arms the fallback reload.
    dispatchMessage({type: 'presentation/snapshot-event', data: {event: {type: 'mutation'}}})
    expect(store.get(FOLLOW_UP_RELOAD_KEY)).toBe(PAGE_URL)
    expect([...timers.values()].map((t) => t.delayMs)).toEqual([DELAY])

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
  })

  it('reconciles on window load and immediately consumes the flag when a mutation arrived while loading', () => {
    const {host, store, timers, fireTimers, dispatchMessage, dispatchLoad} = createHost('loading')
    const reload = vi.fn()

    scheduleFollowUpReload(host, reload, DELAY)
    dispatchMessage({type: 'presentation/snapshot-event', data: {event: {type: 'mutation'}}})

    expect(store.get(FOLLOW_UP_RELOAD_KEY)).toBe(PAGE_URL)
    expect(timers.size).toBe(0)

    dispatchLoad()
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect([...timers.values()].map((t) => t.delayMs)).toEqual([DELAY])

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clears the flag, invokes VE acknowledgeRefresh, and cancels any fallback timer on acknowledge', () => {
    const {host, store, timers, dispatchMessage} = createHost('complete')
    const acknowledgeRefresh = vi.fn()
    host.__sanityVEConfig = {acknowledgeRefresh}
    const reload = vi.fn()

    scheduleFollowUpReload(host, reload, DELAY)
    dispatchMessage({type: 'presentation/snapshot-event', data: {event: {type: 'mutation'}}})
    expect(store.get(FOLLOW_UP_RELOAD_KEY)).toBe(PAGE_URL)
    expect(timers.size).toBe(1)

    acknowledgeFollowUpReload(host)
    expect(acknowledgeRefresh).toHaveBeenCalledTimes(1)
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(0)
    expect(host.__sanityFallbackTimer).toBeNull()
    expect(host.__sanityPendingFollowUpUrl).toBeNull()
  })

  it('consumes the sessionStorage flag immediately on arrival and reloads when the timer fires', () => {
    const {host, store, timers, fireTimers} = createHost()
    const reload = vi.fn()
    store.set(FOLLOW_UP_RELOAD_KEY, PAGE_URL)

    const cancel = scheduleFollowUpReload(host, reload, DELAY)

    expect(typeof cancel).toBe('function')
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([DELAY])
    expect(reload).not.toHaveBeenCalled()

    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('re-arms the reload when the island remounts under StrictMode without leaving a flag in sessionStorage', () => {
    const {host, store, timers, fireTimers} = createHost()
    const reload = vi.fn()
    store.set(FOLLOW_UP_RELOAD_KEY, PAGE_URL)

    // Strict Mode mounts, unmounts and mounts the island again on arrival.
    scheduleFollowUpReload(host, reload, DELAY)?.()
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    const cancel = scheduleFollowUpReload(host, reload, DELAY)

    expect(typeof cancel).toBe('function')
    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(1)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('discards a marker left for a different URL instead of reloading it', () => {
    const {host, store, timers} = createHost()
    const reload = vi.fn()
    store.set(FOLLOW_UP_RELOAD_KEY, PAGE_URL)

    // A preview navigation or document switch changed the URL before arrival.
    host.location.href = 'http://localhost:4321/movies/def'
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()

    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(timers.size).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing in a top-level window outside an iframe or with a non-positive delay', () => {
    const {host, listeners, timers} = createHost()
    const topWindow = {} as Window
    host.self = topWindow
    host.top = topWindow

    expect(scheduleFollowUpReload(host, vi.fn(), DELAY)).toBeUndefined()
    expect(listeners.size).toBe(0)
    expect(timers.size).toBe(0)

    const {host: iframeHost, listeners: iframeListeners} = createHost()
    expect(scheduleFollowUpReload(iframeHost, vi.fn(), 0)).toBeUndefined()
    expect(iframeListeners.size).toBe(0)
  })

  it('is not re-armed by the follow-up reload itself', () => {
    const {host, store, fireTimers} = createHost()
    const reload = vi.fn()
    store.set(FOLLOW_UP_RELOAD_KEY, PAGE_URL)

    scheduleFollowUpReload(host, reload, DELAY)
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)

    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
    expect(scheduleFollowUpReload(host, reload, DELAY)).toBeUndefined()
    fireTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending reload when asked to', () => {
    const {host, store, timers, fireTimers} = createHost()
    const reload = vi.fn()
    store.set(FOLLOW_UP_RELOAD_KEY, PAGE_URL)

    scheduleFollowUpReload(host, reload, DELAY)?.()

    expect(store.has(FOLLOW_UP_RELOAD_KEY)).toBe(false)
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
