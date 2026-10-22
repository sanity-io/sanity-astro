// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  applyPresentationHistoryUpdate,
  createBrowserHistoryAdapter,
  getPresentationUrl,
  shouldPublishUrl,
} from './history'

const adapters: Array<{dispose(): void}> = []

function clickAnchor(href: string, init: MouseEventInit = {}, extras?: {target?: string}) {
  const anchor = document.createElement('a')
  anchor.href = href
  if (extras?.target) {
    anchor.target = extras.target
  }
  document.body.appendChild(anchor)
  anchor.addEventListener('click', (event) => event.preventDefault())
  anchor.dispatchEvent(
    new MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ...init}),
  )
  anchor.remove()
}

afterEach(() => {
  for (const adapter of adapters) {
    adapter.dispose()
  }
  adapters.length = 0
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

describe('visual editing history helpers', () => {
  it('builds a presentation URL from location parts', () => {
    expect(
      getPresentationUrl({
        pathname: '/movies/abc',
        search: '?draft=true',
        hash: '#cast',
      }),
    ).toBe('/movies/abc?draft=true#cast')
  })

  it('publishes only when url changes', () => {
    expect(shouldPublishUrl('/movies/abc', '/movies/abc')).toBe(false)
    expect(shouldPublishUrl('/movies/abc', '/movies/def')).toBe(true)
  })

  it('applies push and replace updates using navigation callbacks', () => {
    const assign = vi.fn()
    const replace = vi.fn()
    const back = vi.fn()

    applyPresentationHistoryUpdate(
      {type: 'push', url: '/movies/abc'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(assign).toHaveBeenCalledWith('/movies/abc')
    expect(replace).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()

    assign.mockReset()
    replace.mockReset()
    back.mockReset()

    applyPresentationHistoryUpdate(
      {type: 'replace', url: '/movies/xyz'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(replace).toHaveBeenCalledWith('/movies/xyz')
    expect(assign).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('applies pop updates and skips duplicate navigations', () => {
    const assign = vi.fn()
    const replace = vi.fn()
    const back = vi.fn()

    applyPresentationHistoryUpdate(
      {type: 'pop', url: '/movies/abc'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(back).toHaveBeenCalledTimes(1)

    assign.mockReset()
    replace.mockReset()
    back.mockReset()

    applyPresentationHistoryUpdate(
      {type: 'push', url: 'http://localhost:4321/movies/abc'},
      'http://localhost:4321/movies/abc',
      {assign, replace, back},
    )
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('throws on an unknown history update type', () => {
    expect(() =>
      applyPresentationHistoryUpdate({type: 'nope', url: '/x'} as never, 'http://localhost/', {
        assign: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
      }),
    ).toThrow(/Unknown history update type/)
  })
})

describe('createBrowserHistoryAdapter', () => {
  it('reports the current URL as soon as Presentation subscribes, and again on resubscribe', () => {
    window.history.replaceState(null, '', '/movies/abc?x=1#cast')
    document.title = 'Movie ABC'
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const navigate = vi.fn()

    const unsubscribe = adapter.subscribe(navigate)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({
      type: 'push',
      title: 'Movie ABC',
      url: '/movies/abc?x=1#cast',
    })

    // A same-URL popstate is still deduplicated against what was just published.
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(navigate).toHaveBeenCalledTimes(1)

    // Presentation reconnecting needs the URL again even though nothing navigated.
    unsubscribe()
    const next = vi.fn()
    adapter.subscribe(next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({url: '/movies/abc?x=1#cast'}))
  })

  it('publishes pushState, replaceState, popstate and hashchange to the subscriber', () => {
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const navigate = vi.fn()
    adapter.subscribe(navigate)
    navigate.mockClear()

    window.history.pushState(null, '', '/movies/walle')
    window.history.replaceState(null, '', '/movies/walle?tab=cast')
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.history.replaceState(null, '', '/movies/walle#crew')
    window.dispatchEvent(new Event('hashchange'))

    expect(navigate.mock.calls.map(([update]) => update.url)).toEqual([
      '/movies/walle',
      '/movies/walle?tab=cast',
      '/movies/walle#crew',
    ])
  })

  it('publishes a same-origin click and ignores the rest', () => {
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const navigate = vi.fn()
    adapter.subscribe(navigate)
    navigate.mockClear()

    clickAnchor('/movies/guardians')
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({url: '/movies/guardians'}))
    navigate.mockClear()

    clickAnchor('https://example.com/movies/guardians')
    clickAnchor('/movies/held', {button: 1})
    clickAnchor('/movies/meta', {metaKey: true})
    clickAnchor('/movies/ctrl', {ctrlKey: true})
    clickAnchor('/movies/alt', {altKey: true})
    clickAnchor('/movies/shift', {shiftKey: true})
    clickAnchor('/movies/blank', {}, {target: '_blank'})

    const alreadyHandled = new MouseEvent('click', {bubbles: true, cancelable: true, button: 0})
    alreadyHandled.preventDefault()
    const handled = document.createElement('a')
    handled.href = '/movies/prevented'
    document.body.appendChild(handled)
    handled.dispatchEvent(alreadyHandled)
    handled.remove()

    expect(navigate).not.toHaveBeenCalled()
  })

  it('still publishes during the unsubscribe grace period, then stops', () => {
    vi.useFakeTimers()
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const navigate = vi.fn()
    const unsubscribe = adapter.subscribe(navigate)
    navigate.mockClear()

    unsubscribe()
    window.history.pushState(null, '', '/grace')
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({url: '/grace'}))

    navigate.mockClear()
    vi.advanceTimersByTime(200)
    window.history.pushState(null, '', '/after-grace')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('applies presentation updates onto location and history', () => {
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const assign = vi.fn()
    const replace = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'http://localhost/now',
        assign,
        replace,
      },
    })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    try {
      adapter.update({type: 'push', url: '/next'})
      adapter.update({type: 'replace', url: '/swap'})
      adapter.update({type: 'pop', url: '/prev'})
      expect(assign).toHaveBeenCalledWith('/next')
      expect(replace).toHaveBeenCalledWith('/swap')
      expect(back).toHaveBeenCalledTimes(1)
    } finally {
      back.mockRestore()
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    }
  })

  it('skips push and replace when Presentation echoes the current relative URL', () => {
    window.history.replaceState(null, '', '/movies/abc?x=1#cast')
    const adapter = createBrowserHistoryAdapter()
    adapters.push(adapter)
    const assign = vi.fn()
    const replace = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: '/movies/abc',
        search: '?x=1',
        hash: '#cast',
        href: 'http://localhost:4321/movies/abc?x=1#cast',
        assign,
        replace,
      },
    })

    try {
      adapter.update({type: 'push', url: '/movies/abc?x=1#cast'})
      adapter.update({type: 'replace', url: '/movies/abc?x=1#cast'})
      expect(assign).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    }
  })

  it('restores native history methods on dispose', () => {
    const nativePushState = window.history.pushState
    const nativeReplaceState = window.history.replaceState
    const adapter = createBrowserHistoryAdapter()
    expect(window.history.pushState).not.toBe(nativePushState)

    adapter.dispose()
    expect(window.history.pushState).toBe(nativePushState)
    expect(window.history.replaceState).toBe(nativeReplaceState)
  })
})
