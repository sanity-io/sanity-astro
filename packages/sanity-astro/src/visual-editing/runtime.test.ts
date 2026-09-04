// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createRuntime} from './runtime'

const {liveText, morphDocument, fetchDocument} = vi.hoisted(() => ({
  liveText: {
    patch: vi.fn(() => 0),
    patchAll: vi.fn(() => 0),
    isStale: vi.fn(() => false),
    dispose: vi.fn(),
  },
  morphDocument: vi.fn(),
  fetchDocument: vi.fn(async () => new DOMParser().parseFromString('<p>fresh</p>', 'text/html')),
}))

vi.mock('./live-text', () => ({
  createLiveText: vi.fn((options: {onRemoteChange: (id: string) => void}) => {
    remoteChange = options.onRemoteChange
    return liveText
  }),
}))

vi.mock('./morph', () => ({fetchDocument, morphDocument}))

let remoteChange: ((id: string) => void) | undefined

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  liveText.isStale.mockReturnValue(false)
  sessionStorage.clear()
})

describe('createRuntime', () => {
  it('morphs once and re-applies live text when the fetched HTML is fresh', async () => {
    const runtime = createRuntime('morph')

    await runtime.refresh({source: 'manual', livePreviewEnabled: false})

    expect(fetchDocument).toHaveBeenCalledTimes(1)
    expect(fetchDocument).toHaveBeenCalledWith(window.location.href)
    expect(morphDocument).toHaveBeenCalledTimes(1)
    expect(liveText.patchAll).toHaveBeenCalledTimes(1)

    runtime.dispose()
    expect(liveText.dispose).toHaveBeenCalledTimes(1)
  })

  it('refetches while the HTML is stale and applies the last attempt regardless', async () => {
    vi.useFakeTimers()
    liveText.isStale.mockReturnValue(true)
    const runtime = createRuntime('morph')

    const refreshed = runtime.refresh({source: 'manual', livePreviewEnabled: false})
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
    const runtime = createRuntime('morph')

    remoteChange?.('movie-lab-1')
    expect(fetchDocument).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchDocument).toHaveBeenCalledTimes(1)

    runtime.dispose()
  })
})
