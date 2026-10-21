// @vitest-environment jsdom
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {mockLocationReload} from '../../test/location'
import {renderInAct, unmountAll} from '../../test/react'
import {
  type HistoryAdapter,
  type HistoryAdapterNavigate,
  type HistoryRefresh,
  VisualEditingComponent,
  type VisualEditingOptions,
} from './visual-editing-component'

type Refresh = (payload: HistoryRefresh) => Promise<void> | false
type Captured = Record<string, unknown> & {history: HistoryAdapter; refresh: Refresh}

const renders: Captured[] = []

vi.mock('@sanity/visual-editing/react', () => ({
  VisualEditing: (props: Captured) => {
    renders.push(props)
    return null
  },
}))

const manual: HistoryRefresh = {source: 'manual', livePreviewEnabled: false}
const last = () => renders[renders.length - 1]!

async function renderVisualEditing(props: VisualEditingOptions = {}) {
  const rerender = await renderInAct(<VisualEditingComponent {...props} />)
  return {
    props: last(),
    rerender: async (next: VisualEditingOptions) => {
      await rerender(<VisualEditingComponent {...next} />)
      return last()
    },
  }
}

function stubFetch(html: string) {
  const fetchMock = vi.fn(
    async () => new Response(html, {status: 200, headers: {'content-type': 'text/html'}}),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  renders.length = 0
  window.history.replaceState(null, '', '/')
})

afterEach(async () => {
  await unmountAll()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('VisualEditingComponent', () => {
  it('forces portal and, by default, reloads the page on refresh', async () => {
    const fetchMock = stubFetch('<html><body></body></html>')
    const location = mockLocationReload()
    try {
      const {props} = await renderVisualEditing({zIndex: 42})

      expect(props.portal).toBe(true)
      expect(props.zIndex).toBe(42)
      await expect(props.refresh(manual)).resolves.toBeUndefined()
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      location.restore()
    }
  })

  it('morphs the page in place on refresh with the in-place refresh strategy', async () => {
    const marker = document.createElement('p')
    marker.id = 'lab-marker'
    marker.textContent = 'before'
    document.body.appendChild(marker)
    const fetchMock = stubFetch(
      '<html><head></head><body><p id="lab-marker">after</p></body></html>',
    )
    const location = mockLocationReload()
    try {
      const {props} = await renderVisualEditing({experimental_refreshStrategy: 'in-place'})

      await props.refresh(manual)

      expect(fetchMock).toHaveBeenCalledWith(window.location.href, expect.any(Object))
      expect(document.getElementById('lab-marker')?.textContent).toBe('after')
      expect(location.reload).not.toHaveBeenCalled()
    } finally {
      location.restore()
    }
  })

  it('forwards every upstream option by reference', async () => {
    const options = {
      zIndex: 1234,
      keepStegaOnCopy: true,
      components: vi.fn(),
      plugins: [],
      onPerspectiveChange: vi.fn(),
      onVariantChange: vi.fn(),
      onSuspiciousStega: vi.fn(),
    } satisfies VisualEditingOptions

    const {props} = await renderVisualEditing(options)

    for (const [key, value] of Object.entries(options)) {
      expect(props[key], key).toBe(value)
    }
    expect(props).not.toHaveProperty('experimental_refreshStrategy')
  })

  it('passes a consumer refresh and history through by identity and leaves window.history alone', async () => {
    const nativePushState = window.history.pushState
    const refresh = vi.fn(() => false as const)
    const history: HistoryAdapter = {subscribe: () => () => {}, update: () => {}}

    const {props} = await renderVisualEditing({
      refresh,
      history,
      experimental_refreshStrategy: 'in-place',
    })

    expect(props.refresh).toBe(refresh)
    expect(props.history).toBe(history)
    expect(props.portal).toBe(true)
    expect(window.history.pushState).toBe(nativePushState)
  })

  it('keeps the same defaults across re-renders with new inline callbacks', async () => {
    const {props, rerender} = await renderVisualEditing({onSuspiciousStega: () => {}})

    const next = await rerender({onSuspiciousStega: () => {}, zIndex: 7})

    expect(next.history).toBe(props.history)
    expect(next.refresh).toBe(props.refresh)
    expect(next.zIndex).toBe(7)
  })

  it('does not rebuild the default history when an inline refresh changes identity', async () => {
    const {props, rerender} = await renderVisualEditing({refresh: () => false})
    // The adapter patches pushState on install, so a rebuild would swap in a new wrapper.
    const patchedPushState = window.history.pushState

    const second = await rerender({refresh: () => false})
    const third = await rerender({refresh: () => false})

    expect(window.history.pushState).toBe(patchedPushState)
    expect(second.history).toBe(props.history)
    expect(third.history).toBe(props.history)
    expect(third.refresh).not.toBe(second.refresh)
  })

  it('rebuilds the refresh handler when experimental_refreshStrategy changes', async () => {
    const {props, rerender} = await renderVisualEditing()

    const next = await rerender({experimental_refreshStrategy: 'in-place'})

    expect(next.refresh).not.toBe(props.refresh)
  })

  it('reports the current URL to Presentation as soon as it subscribes', async () => {
    window.history.replaceState(null, '', '/movies/abc?x=1#cast')
    document.title = 'Movie ABC'
    const {props} = await renderVisualEditing()
    const navigate = vi.fn<HistoryAdapterNavigate>()

    props.history.subscribe(navigate)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({
      type: 'push',
      title: 'Movie ABC',
      url: '/movies/abc?x=1#cast',
    })
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
