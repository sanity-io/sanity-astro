// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createRuntime} from './runtime'

const {liveText, morphDocument, hasNewExecutableScript, fetchDocument} = vi.hoisted(() => ({
  liveText: {
    patch: vi.fn(() => 0),
    patchAll: vi.fn(() => 0),
    isStale: vi.fn(() => false),
    dispose: vi.fn(),
  },
  morphDocument: vi.fn(),
  hasNewExecutableScript: vi.fn(() => false),
  fetchDocument: vi.fn(async () => new DOMParser().parseFromString('<p>fresh</p>', 'text/html')),
}))

vi.mock('./live-text', () => ({
  createLiveText: vi.fn((options: {onRemoteChange: (id: string, doc: unknown) => void}) => {
    remoteChange = options.onRemoteChange
    return liveText
  }),
}))

vi.mock('./morph', () => ({fetchDocument, hasNewExecutableScript, morphDocument}))

let remoteChange: ((id: string, doc: unknown) => void) | undefined
const manual = {source: 'manual', livePreviewEnabled: false} as const

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  liveText.isStale.mockReturnValue(false)
  hasNewExecutableScript.mockReturnValue(false)
  fetchDocument.mockImplementation(async () =>
    new DOMParser().parseFromString('<p>fresh</p>', 'text/html'),
  )
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('createRuntime', () => {
  it('morphs once and re-applies live text when the fetched HTML is fresh', async () => {
    const runtime = createRuntime({strategy: 'morph'})

    await runtime.refresh(manual)

    expect(fetchDocument).toHaveBeenCalledTimes(1)
    expect(fetchDocument).toHaveBeenCalledWith(window.location.href, fetch, expect.any(AbortSignal))
    expect(morphDocument).toHaveBeenCalledTimes(1)
    expect(liveText.patchAll).toHaveBeenCalledTimes(1)

    runtime.dispose()
    expect(liveText.dispose).toHaveBeenCalledTimes(1)
  })

  it('refetches while the HTML is stale and applies the last attempt regardless', async () => {
    vi.useFakeTimers()
    liveText.isStale.mockReturnValue(true)
    const runtime = createRuntime({strategy: 'morph'})

    const refreshed = runtime.refresh(manual)
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(500)
    await refreshed

    expect(fetchDocument).toHaveBeenCalledTimes(4)
    expect(morphDocument).toHaveBeenCalledTimes(1)
    expect(liveText.patchAll).toHaveBeenCalledTimes(1)

    runtime.dispose()
  })

  it('schedules a morph when the document stream reports a remote change', async () => {
    vi.useFakeTimers()
    const runtime = createRuntime({strategy: 'morph'})

    remoteChange?.('movie-lab-1', {_type: 'movie', _rev: 'r1'})
    expect(fetchDocument).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchDocument).toHaveBeenCalledTimes(1)

    runtime.dispose()
  })

  it('does not morph HTML fetched for a page that has since navigated away', async () => {
    let resolveFetch!: (doc: Document) => void
    fetchDocument.mockImplementationOnce(
      () =>
        new Promise<Document>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const runtime = createRuntime({strategy: 'morph'})

    const refreshed = runtime.refresh(manual)
    window.history.pushState(null, '', '/elsewhere')
    resolveFetch(new DOMParser().parseFromString('<p>route a</p>', 'text/html'))
    await refreshed

    expect(morphDocument).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('reloads instead of morphing when the fresh HTML introduces a script', async () => {
    const reload = vi.fn()
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...window.location, reload, href: 'http://localhost/'},
    })
    hasNewExecutableScript.mockReturnValue(true)
    const runtime = createRuntime({strategy: 'morph'})

    void runtime.refresh(manual)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(morphDocument).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('hands remote changes to a custom refresh as mutation payloads and skips the morph', () => {
    const custom = vi.fn(() => false as const)
    const runtime = createRuntime({strategy: 'morph', refresh: custom})

    expect(runtime.refresh).toBe(custom)
    remoteChange?.('movie-lab-1', {_type: 'movie', _rev: 'r2'})

    expect(custom).toHaveBeenCalledWith({
      source: 'mutation',
      livePreviewEnabled: false,
      document: {_id: 'movie-lab-1', _type: 'movie', _rev: 'r2'},
    })
    expect(fetchDocument).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('leaves window.history alone when a custom history adapter is given', () => {
    const pushState = window.history.pushState
    const custom = {subscribe: () => () => {}, update: () => {}}

    const runtime = createRuntime({strategy: 'morph', history: custom})

    expect(runtime.history).toBe(custom)
    expect(window.history.pushState).toBe(pushState)

    runtime.dispose()
  })
})
