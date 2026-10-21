// @vitest-environment jsdom
import React, {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {VisualEditingComponent, type VisualEditingOptions} from './visual-editing-component'

type HistoryAdapter = NonNullable<VisualEditingOptions['history']>
type Navigate = Parameters<HistoryAdapter['subscribe']>[0]
type Refresh = NonNullable<VisualEditingOptions['refresh']>
type CapturedProps = {history: HistoryAdapter; refresh: Refresh; zIndex?: number}

const renders: CapturedProps[] = []

vi.mock('@sanity/visual-editing/react', () => ({
  VisualEditing: (props: CapturedProps) => {
    renders.push(props)
    return null
  },
}))

let roots: Array<{root: Root; container: HTMLElement}> = []

async function renderVisualEditing(props: VisualEditingOptions = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(VisualEditingComponent, props))
  })
  await act(async () => {})
  roots.push({root, container})
  return renders[renders.length - 1]
}

function clickAnchor(href: string) {
  const anchor = document.createElement('a')
  anchor.href = href
  document.body.appendChild(anchor)
  anchor.addEventListener('click', (event) => event.preventDefault())
  anchor.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, button: 0}))
  anchor.remove()
}

beforeEach(() => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  renders.length = 0
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers()
})

afterEach(async () => {
  for (const {root, container} of roots) {
    await act(async () => root.unmount())
    container.remove()
  }
  roots = []
  vi.useRealTimers()
})

describe('VisualEditingComponent', () => {
  it('passes zIndex through and morphs the page on refresh by default', async () => {
    const marker = document.createElement('p')
    marker.id = 'lab-marker'
    marker.textContent = 'before'
    document.body.appendChild(marker)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html><head></head><body><p id="lab-marker">after</p></body></html>', {
        status: 200,
        headers: {'content-type': 'text/html'},
      }),
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock

    try {
      const props = await renderVisualEditing({zIndex: 42})
      await act(async () => {
        await props.refresh({source: 'manual', livePreviewEnabled: false})
      })

      expect(props.zIndex).toBe(42)
      expect(fetchMock).toHaveBeenCalledWith(window.location.href, expect.any(Object))
      expect(document.getElementById('lab-marker')?.textContent).toBe('after')
    } finally {
      globalThis.fetch = originalFetch
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

  it('passes a consumer history adapter through to VisualEditing', async () => {
    const custom: HistoryAdapter = {subscribe: () => () => {}, update: () => {}}

    const props = await renderVisualEditing({history: custom})

    expect(props.history).toBe(custom)
  })

  it('restores the native history methods on unmount', async () => {
    const nativePushState = window.history.pushState
    const nativeReplaceState = window.history.replaceState

    await renderVisualEditing()
    expect(window.history.pushState).not.toBe(nativePushState)

    for (const {root} of roots) {
      await act(async () => root.unmount())
    }

    expect(window.history.pushState).toBe(nativePushState)
    expect(window.history.replaceState).toBe(nativeReplaceState)
  })
})
