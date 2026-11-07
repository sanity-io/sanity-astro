// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:4321/movies/abc?x=1#cast"}
import React, {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FOLLOW_UP_RELOAD_KEY} from './follow-up-reload'
import {
  VisualEditingComponent,
  type VisualEditingComponentProps,
  type VisualEditingOptions,
} from './visual-editing-component'

const post = vi.fn()
const innerProps: Array<Record<string, unknown>> = []

// Stand-in for @sanity/visual-editing's VisualEditing + History with the timing that matters:
// the comlink node lands in state from an effect, and History only subscribes to the history
// adapter in a later effect keyed on [comlink, history].
vi.mock('@sanity/visual-editing/react', () => {
  const {useEffect, useState, startTransition} = React
  type Comlink = {post: typeof post}
  type History = {subscribe: (navigate: (update: unknown) => void) => () => void}
  function HistoryBridge(props: {comlink: Comlink; history: History}) {
    const {comlink, history} = props
    useEffect(
      () =>
        history.subscribe((update) => {
          comlink.post('visual-editing/navigate', update)
        }),
      [comlink, history],
    )
    return null
  }
  function VisualEditing(props: {history: History}) {
    innerProps.push(props)
    const [comlink, setComlink] = useState<Comlink | undefined>()
    useEffect(() => {
      const instance = {post}
      startTransition(() => setComlink(instance))
      return () => startTransition(() => setComlink(undefined))
    }, [])
    return comlink ? <HistoryBridge comlink={comlink} history={props.history} /> : null
  }
  return {VisualEditing}
})

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

const initialUrl = '/movies/abc?x=1#cast'
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  post.mockReset()
  innerProps.length = 0
  window.sessionStorage.clear()
  delete (window as {__sanityFallbackTimer?: number | null}).__sanityFallbackTimer
  delete (window as {__sanityFollowUpInstalled?: boolean}).__sanityFollowUpInstalled
  window.history.replaceState({}, '', initialUrl)
  document.title = 'Movie ABC'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

async function mount(element: React.ReactElement) {
  await act(async () => {
    root.render(element)
  })
  // Let the transition-driven comlink state land and the subscribe effect flush.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('VisualEditingComponent default history adapter', () => {
  it('reports the current URL to Presentation as soon as it subscribes', async () => {
    await mount(<VisualEditingComponent />)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('visual-editing/navigate', {
      type: 'push',
      title: 'Movie ABC',
      url: initialUrl,
    })
  })

  it('publishes exactly once when switching from a custom adapter to the default one', async () => {
    const custom = {subscribe: () => () => {}, update: () => {}}
    await mount(<VisualEditingComponent history={custom} />)
    expect(post).not.toHaveBeenCalled()
    await mount(<VisualEditingComponent />)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('only ever reports the current URL under StrictMode double-subscribe', async () => {
    await mount(
      <React.StrictMode>
        <VisualEditingComponent />
      </React.StrictMode>,
    )
    expect(post.mock.calls.length).toBeGreaterThanOrEqual(1)
    const urls = new Set(post.mock.calls.map(([, update]) => (update as {url: string}).url))
    expect(urls).toEqual(new Set([initialUrl]))
  })

  it('dedupes a same-URL popstate and still publishes a real pushState', async () => {
    await mount(<VisualEditingComponent />)
    expect(post).toHaveBeenCalledTimes(1)
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(post).toHaveBeenCalledTimes(1)
    await act(async () => {
      window.history.pushState({}, '', '/movies/def')
    })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenLastCalledWith('visual-editing/navigate', {
      type: 'push',
      title: 'Movie ABC',
      url: '/movies/def',
    })
  })

  it('removes the exact capture click listener on unmount without adding another', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    await mount(<VisualEditingComponent />)

    const clickAddCall = addSpy.mock.calls.find(
      ([type, , options]) => type === 'click' && options === true,
    )
    expect(clickAddCall).toBeDefined()
    const registeredHandler = clickAddCall![1]

    addSpy.mockClear()
    await act(async () => root.unmount())

    expect(addSpy).not.toHaveBeenCalledWith('click', expect.anything(), true)
    expect(removeSpy).toHaveBeenCalledWith('click', registeredHandler, true)
  })
})

describe('VisualEditingComponent prop forwarding and refresh lifecycle', () => {
  async function mountAndCapture(props: VisualEditingComponentProps = {}) {
    await mount(<VisualEditingComponent {...props} />)
    expect(innerProps.length).toBeGreaterThanOrEqual(1)
    return innerProps[innerProps.length - 1]
  }

  it('forces portal and applies the default refresh and history', async () => {
    const inner = await mountAndCapture()

    expect(inner.portal).toBe(true)
    expect(inner.refresh).toEqual(expect.any(Function))
    expect(inner.history).toEqual(
      expect.objectContaining({subscribe: expect.any(Function), update: expect.any(Function)}),
    )
  })

  it('forwards every upstream option by reference', async () => {
    const props = {
      zIndex: 1234,
      keepStegaOnCopy: true,
      components: vi.fn(),
      plugins: [],
      onPerspectiveChange: vi.fn(),
      onVariantChange: vi.fn(),
      onSuspiciousStega: vi.fn(),
    } satisfies VisualEditingOptions
    const inner = await mountAndCapture(props)

    for (const [key, value] of Object.entries(props)) {
      expect(inner[key], key).toBe(value)
    }
  })

  it('keeps experimental_refreshStrategy to itself and cancels a pending arrival timer on unmount', async () => {
    // Simulate running inside the Presentation iframe so scheduleFollowUpReload is active.
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    window.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, 'true')

    const inner = await mountAndCapture({
      experimental_refreshStrategy: {type: 'reload', followUpDelayMs: 1200},
    })

    expect('experimental_refreshStrategy' in inner).toBe(false)
    expect(inner.refresh).toEqual(expect.any(Function))
    expect(
      (window as {__sanityFallbackTimer?: number | null}).__sanityFallbackTimer,
    ).toEqual(expect.any(Number))

    await act(async () => root.unmount())
    expect(
      (window as {__sanityFallbackTimer?: number | null}).__sanityFallbackTimer,
    ).toBeNull()
  })

  it('lets a consumer refresh and history win over the defaults and disables follow-up arrival', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    window.sessionStorage.setItem(FOLLOW_UP_RELOAD_KEY, 'true')

    const refresh = vi.fn(() => false as const)
    const history = {subscribe: vi.fn(() => () => {}), update: vi.fn()}
    const inner = await mountAndCapture({
      refresh,
      history,
      experimental_refreshStrategy: {type: 'reload', followUpDelayMs: 1200},
    })

    expect(inner.refresh).toBe(refresh)
    expect(inner.history).toBe(history)
    expect(inner.portal).toBe(true)
    expect(
      (window as {__sanityFallbackTimer?: number | null}).__sanityFallbackTimer,
    ).toBeUndefined()
    expect(
      (window as {__sanityFollowUpInstalled?: boolean}).__sanityFollowUpInstalled,
    ).toBeUndefined()
  })
})