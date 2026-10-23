// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:4321/movies/abc?x=1#cast"}
import React, {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {VisualEditingComponent} from './visual-editing-component'

const post = vi.fn()

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
