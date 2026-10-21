// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {mockLocationReload} from '../../test/location'
import {start} from './client'
import {createLiveText} from './live-text'

type EnableOptions = {
  zIndex?: number | string
  keepStegaOnCopy?: boolean
  history: {subscribe: (navigate: unknown) => () => void; update: (update: unknown) => void}
  refresh: (payload: {source: 'manual' | 'mutation'; livePreviewEnabled: boolean}) => unknown
}

const {disposeSpy, enableVisualEditing, liveText} = vi.hoisted(() => {
  const dispose = vi.fn()
  return {
    disposeSpy: dispose,
    enableVisualEditing: vi.fn((_options: EnableOptions) => dispose),
    liveText: {patchAll: vi.fn(() => 0), isStale: vi.fn(() => false), dispose: vi.fn()},
  }
})

vi.mock('@sanity/visual-editing/enable-visual-editing', () => ({
  enableVisualEditing,
}))

vi.mock('./live-text', () => ({
  createLiveText: vi.fn(() => liveText),
}))

function mountHost(config?: Record<string, unknown>) {
  const host = document.createElement('sanity-astro-visual-editing')
  if (config) {
    host.setAttribute('data-config', JSON.stringify(config))
  }
  document.body.appendChild(host)
  return host
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe('start', () => {
  it('reloads on refresh by default and leaves the document stream alone', async () => {
    const host = mountHost({zIndex: 9})
    const location = mockLocationReload()

    try {
      const stop = start(host)
      const options = enableVisualEditing.mock.calls[0]![0]

      await expect(
        options.refresh({source: 'mutation', livePreviewEnabled: false}),
      ).resolves.toBeUndefined()
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(createLiveText).not.toHaveBeenCalled()

      stop()
      expect(disposeSpy).toHaveBeenCalledTimes(1)
    } finally {
      location.restore()
    }
  })

  it('passes the config through and subscribes to the stream with the in-place refresh strategy', () => {
    const host = mountHost({
      zIndex: 9,
      keepStegaOnCopy: true,
      experimental_refreshStrategy: 'in-place',
    })
    const nativePushState = window.history.pushState

    const stop = start(host)

    expect(enableVisualEditing).toHaveBeenCalledTimes(1)
    const options = enableVisualEditing.mock.calls[0]![0]
    expect(options.zIndex).toBe(9)
    expect(options.keepStegaOnCopy).toBe(true)
    expect(options.history).toEqual(
      expect.objectContaining({subscribe: expect.any(Function), update: expect.any(Function)}),
    )
    expect(typeof options.refresh).toBe('function')
    expect(createLiveText).toHaveBeenCalledTimes(1)
    expect(window.history.pushState).not.toBe(nativePushState)

    stop()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(liveText.dispose).toHaveBeenCalledTimes(1)
    expect(window.history.pushState).toBe(nativePushState)
  })

  it('omits options the config does not set and starts without data-config at all', () => {
    const host = mountHost()

    const stop = start(host)
    const options = enableVisualEditing.mock.calls[0]![0]

    expect(options).not.toHaveProperty('zIndex')
    expect(options).not.toHaveProperty('keepStegaOnCopy')
    expect(typeof options.refresh).toBe('function')
    expect(createLiveText).not.toHaveBeenCalled()

    stop()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('undoes what it set up before rethrowing when the overlays fail to start', () => {
    const host = mountHost({experimental_refreshStrategy: 'in-place'})
    const nativePushState = window.history.pushState
    const failure = new Error('overlays failed')
    enableVisualEditing.mockImplementationOnce(() => {
      throw failure
    })

    expect(() => start(host)).toThrow(failure)

    expect(liveText.dispose).toHaveBeenCalledTimes(1)
    expect(window.history.pushState).toBe(nativePushState)
  })
})
