// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:4321/movies/abc?x=1#cast"}
import React, {act} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderInAct, unmountAll} from '../../test/react'
import {type HistoryAdapter, VisualEditingComponent} from './visual-editing-component'

const post = vi.fn()

// Stand-in for @sanity/visual-editing's VisualEditing + History with the timing that matters:
// the comlink node lands in state from an effect, and History only subscribes to the history
// adapter in a later effect keyed on [comlink, history].
vi.mock('@sanity/visual-editing/react', () => {
  const {useEffect, useState, startTransition} = React
  type Comlink = {post: typeof post}
  function HistoryBridge(props: {comlink: Comlink; history: HistoryAdapter}) {
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
  function VisualEditing(props: {history: HistoryAdapter}) {
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

const initialUrl = '/movies/abc?x=1#cast'

/** Lets the transition-driven comlink state land and the subscribe effect flush. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function mount(element: React.ReactElement) {
  const rerender = await renderInAct(element)
  await settle()
  return async (next: React.ReactElement) => {
    await rerender(next)
    await settle()
  }
}

beforeEach(() => {
  post.mockReset()
  window.history.replaceState({}, '', initialUrl)
  document.title = 'Movie ABC'
})

afterEach(async () => {
  await unmountAll()
})

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
    const custom: HistoryAdapter = {subscribe: () => () => {}, update: () => {}}
    const rerender = await mount(<VisualEditingComponent history={custom} />)
    expect(post).not.toHaveBeenCalled()
    await rerender(<VisualEditingComponent />)
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
