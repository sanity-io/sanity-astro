// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {mockLocationReload} from '../../test/location'
import {createDocumentStream} from './document-stream'
import {createLiveText} from './live-text'
import {createRuntime} from './runtime'

const {liveText, morphDocument, hasNewExecutableScript, fetchDocument} = vi.hoisted(() => ({
  liveText: {
    patchAll: vi.fn(() => 0),
    isStale: vi.fn(() => false),
    dispose: vi.fn(),
  },
  morphDocument: vi.fn(),
  hasNewExecutableScript: vi.fn(() => false),
  fetchDocument: vi.fn(async () => new DOMParser().parseFromString('<p>fresh</p>', 'text/html')),
}))

let remoteChange: ((id: string) => void) | undefined

vi.mock('./document-stream', () => ({
  createDocumentStream: vi.fn(() => ({readField: () => undefined, subscribe: () => () => {}})),
}))

vi.mock('./live-text', () => ({
  createLiveText: vi.fn((options: {onRemoteChange: (id: string) => void}) => {
    remoteChange = options.onRemoteChange
    return liveText
  }),
}))

vi.mock('./morph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./morph')>()),
  fetchDocument,
  hasNewExecutableScript,
  morphDocument,
}))

const manual = {source: 'manual', livePreviewEnabled: false} as const

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  liveText.isStale.mockReturnValue(false)
  hasNewExecutableScript.mockReturnValue(false)
  fetchDocument.mockImplementation(async () =>
    new DOMParser().parseFromString('<p>fresh</p>', 'text/html'),
  )
  window.history.replaceState(null, '', '/')
})

describe('createRuntime', () => {
  it('reloads the page on refresh by default and never touches the document stream', async () => {
    const location = mockLocationReload()
    try {
      const runtime = createRuntime({})

      await expect(runtime.refresh(manual)).resolves.toBeUndefined()
      await expect(
        runtime.refresh({
          source: 'mutation',
          livePreviewEnabled: false,
          document: {_id: 'movie-lab-1', _type: 'movie', _rev: '1'},
        }),
      ).resolves.toBeUndefined()

      expect(location.reload).toHaveBeenCalledTimes(2)
      expect(fetchDocument).not.toHaveBeenCalled()
      expect(morphDocument).not.toHaveBeenCalled()
      expect(createLiveText).not.toHaveBeenCalled()
      expect(createDocumentStream).not.toHaveBeenCalled()

      runtime.dispose()
    } finally {
      location.restore()
    }
  })

  it('morphs once and re-applies live text when the fetched HTML is fresh', async () => {
    const runtime = createRuntime({inPlaceRefresh: true})

    await runtime.refresh(manual)

    expect(fetchDocument).toHaveBeenCalledTimes(1)
    expect(fetchDocument).toHaveBeenCalledWith(window.location.href, fetch, expect.any(AbortSignal))
    expect(morphDocument).toHaveBeenCalledTimes(1)
    expect(liveText.patchAll).toHaveBeenCalledTimes(1)
    expect(createDocumentStream).toHaveBeenCalledTimes(1)

    runtime.dispose()
    expect(liveText.dispose).toHaveBeenCalledTimes(1)
  })

  it('refetches while the HTML is stale and applies the last attempt regardless', async () => {
    vi.useFakeTimers()
    liveText.isStale.mockReturnValue(true)
    const runtime = createRuntime({inPlaceRefresh: true})

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
    const runtime = createRuntime({inPlaceRefresh: true})

    remoteChange?.('movie-lab-1')
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
    const runtime = createRuntime({inPlaceRefresh: true})

    const refreshed = runtime.refresh(manual)
    window.history.pushState(null, '', '/elsewhere')
    resolveFetch(new DOMParser().parseFromString('<p>route a</p>', 'text/html'))
    await refreshed

    expect(morphDocument).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('still morphs when only the hash changed while the fetch was in flight', async () => {
    let resolveFetch!: (doc: Document) => void
    fetchDocument.mockImplementationOnce(
      () =>
        new Promise<Document>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const runtime = createRuntime({inPlaceRefresh: true})

    const refreshed = runtime.refresh(manual)
    window.history.pushState(null, '', '/#cast')
    resolveFetch(new DOMParser().parseFromString('<p>same page</p>', 'text/html'))
    await refreshed

    expect(morphDocument).toHaveBeenCalledTimes(1)

    runtime.dispose()
  })

  it('reloads instead of morphing when the fresh HTML introduces a script', async () => {
    const location = mockLocationReload()
    try {
      hasNewExecutableScript.mockReturnValue(true)
      const runtime = createRuntime({inPlaceRefresh: true})

      await runtime.refresh(manual)

      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(morphDocument).not.toHaveBeenCalled()

      runtime.dispose()
    } finally {
      location.restore()
    }
  })

  it('reloads quietly when the fetch fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const location = mockLocationReload()
    try {
      fetchDocument.mockRejectedValueOnce(new Error('Refresh fetch returned 503'))
      const runtime = createRuntime({inPlaceRefresh: true})

      await runtime.refresh(manual)

      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(error).not.toHaveBeenCalled()

      runtime.dispose()
    } finally {
      location.restore()
    }
  })

  it('reports a morph that throws and falls back to reloading', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const location = mockLocationReload()
    try {
      morphDocument.mockImplementationOnce(() => {
        throw new TypeError('idiomorph edge case')
      })
      const runtime = createRuntime({inPlaceRefresh: true})

      await runtime.refresh(manual)
      await runtime.refresh(manual)

      expect(location.reload).toHaveBeenCalledTimes(2)
      expect(morphDocument).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledTimes(1)

      runtime.dispose()
    } finally {
      location.restore()
    }
  })
})
