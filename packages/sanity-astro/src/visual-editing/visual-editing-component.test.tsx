// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:4321/movies/abc?x=1#cast"}
import React, {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {VisualEditingComponent, type VisualEditingOptions} from './visual-editing-component'

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
  window.history.replaceState({}, '', initialUrl)
  document.title = 'Movie ABC'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
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
})

describe('VisualEditingComponent prop forwarding', () => {
  async function mountAndCapture(props: VisualEditingOptions = {}) {
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

  it('lets a consumer refresh and history win over the defaults', async () => {
    const refresh = vi.fn(() => false as const)
    const history = {subscribe: vi.fn(() => () => {}), update: vi.fn()}
    const inner = await mountAndCapture({refresh, history})

    expect(inner.refresh).toBe(refresh)
    expect(inner.history).toBe(history)
    expect(inner.portal).toBe(true)
  })
})
