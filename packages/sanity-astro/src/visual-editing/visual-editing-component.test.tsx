// @vitest-environment jsdom
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {clickAnchor, renderInAct, unmountAll} from '../../test/react'
import {VisualEditingComponent, type VisualEditingOptions} from './visual-editing-component'

type HistoryAdapter = NonNullable<VisualEditingOptions['history']>
type Navigate = Parameters<HistoryAdapter['subscribe']>[0]
type CapturedProps = {history: HistoryAdapter; refresh: () => Promise<void>; zIndex?: number}

const renders: CapturedProps[] = []

vi.mock('@sanity/visual-editing/react', () => ({
  VisualEditing: (props: CapturedProps) => {
    renders.push(props)
    return null
  },
}))

async function renderVisualEditing(props: VisualEditingOptions = {}) {
  await renderInAct(React.createElement(VisualEditingComponent, props))
  return renders[renders.length - 1]
}

beforeEach(() => {
  renders.length = 0
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers()
})

afterEach(async () => {
  await unmountAll()
  vi.useRealTimers()
})

describe('VisualEditingComponent', () => {
  it('passes zIndex through and reloads the page on refresh by default', async () => {
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        reload,
        pathname: '/',
        search: '',
        hash: '',
        href: 'http://localhost/',
      },
    })

    try {
      const props = await renderVisualEditing({zIndex: 42})
      await props.refresh()

      expect(props.zIndex).toBe(42)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    }
  })

  it('publishes pushState, replaceState and popstate navigation to Presentation', async () => {
    const props = await renderVisualEditing()
    const navigate = vi.fn<Navigate>()
    props.history.subscribe(navigate)

    window.history.pushState(null, '', '/movies/walle')
    window.history.replaceState(null, '', '/movies/walle?tab=cast')
    window.history.replaceState(null, '', '/people/andrew')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(navigate.mock.calls.map(([update]) => update.url)).toEqual([
      '/movies/walle',
      '/movies/walle?tab=cast',
      '/people/andrew',
    ])
    expect(navigate.mock.calls[0][0]).toEqual({
      type: 'push',
      title: document.title,
      url: '/movies/walle',
    })
  })

  it('publishes a clicked same-origin link before the browser navigates', async () => {
    const props = await renderVisualEditing()
    const navigate = vi.fn<Navigate>()
    props.history.subscribe(navigate)

    clickAnchor('/movies/guardians')

    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({url: '/movies/guardians'}))
  })

  it('ignores clicks on other origins and drops navigation once unsubscribed', async () => {
    const props = await renderVisualEditing()
    const navigate = vi.fn<Navigate>()
    const unsubscribe = props.history.subscribe(navigate)

    clickAnchor('https://example.com/movies/guardians')
    expect(navigate).not.toHaveBeenCalled()

    unsubscribe()
    vi.advanceTimersByTime(250)
    window.history.pushState(null, '', '/after-unsubscribe')

    expect(navigate).not.toHaveBeenCalled()
  })

  it('leaves history alone when the consumer brings their own adapter', async () => {
    const custom: HistoryAdapter = {subscribe: () => () => {}, update: () => {}}
    const nativePushState = window.history.pushState

    const props = await renderVisualEditing({history: custom})

    expect(props.history).toBe(custom)
    expect(window.history.pushState).toBe(nativePushState)
  })

  it('restores the native history methods on unmount', async () => {
    const nativePushState = window.history.pushState
    const nativeReplaceState = window.history.replaceState

    await renderVisualEditing()
    expect(window.history.pushState).not.toBe(nativePushState)

    await unmountAll()

    expect(window.history.pushState).toBe(nativePushState)
    expect(window.history.replaceState).toBe(nativeReplaceState)
  })
})
