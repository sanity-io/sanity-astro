// @vitest-environment jsdom
import React, {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

type StudioProps = {config: unknown; unstable_history?: {listen: (listener: unknown) => unknown}}

const studioRenders: StudioProps[] = []

vi.mock('sanity', () => ({
  Studio: (props: StudioProps) => {
    studioRenders.push(props)
    return React.createElement('div', {'data-testid': 'studio'})
  },
}))

async function renderStudio(studioConfig: unknown, history?: 'browser' | 'hash') {
  vi.resetModules()
  vi.doMock('sanity:studio', () => ({config: studioConfig}))
  const {StudioComponent} = await import('./studio-component')

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(StudioComponent, {history}))
  })
  roots.push({root, container})
  return studioRenders[studioRenders.length - 1]
}

let roots: Array<{root: Root; container: HTMLElement}> = []

function studioClaimsClick(href: string, init: MouseEventInit = {}): boolean {
  const anchor = document.createElement('a')
  anchor.href = href
  document.body.appendChild(anchor)
  let claimed = false
  anchor.addEventListener('click', (event) => {
    claimed = event.defaultPrevented
    event.preventDefault()
  })
  anchor.dispatchEvent(
    new MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ...init}),
  )
  anchor.remove()
  return claimed
}

beforeEach(() => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  studioRenders.length = 0
  window.history.replaceState(null, '', '/admin')
})

afterEach(async () => {
  for (const {root, container} of roots) {
    await act(async () => root.unmount())
    container.remove()
  }
  roots = []
  vi.doUnmock('sanity:studio')
})

describe('StudioComponent', () => {
  it('throws a readable error when sanity:studio has no config', async () => {
    vi.resetModules()
    vi.doMock('sanity:studio', () => ({config: undefined}))

    await expect(import('./studio-component')).rejects.toThrow(/Can't load Sanity Studio/)
  })

  it('renders Studio with the config and native history in browser mode', async () => {
    const config = {name: 'default', basePath: '/admin'}

    const props = await renderStudio(config, 'browser')

    expect(props.config).toBe(config)
    expect(props.unstable_history).toBeUndefined()
    expect(
      document.querySelector('[data-ui="AstroStudioLayout"] [data-testid="studio"]'),
    ).not.toBeNull()
  })

  it('hands Studio a hash history that reports plain locations to listeners', async () => {
    const props = await renderStudio({name: 'default', basePath: '/'}, 'hash')
    const listener = vi.fn()

    const history = props.unstable_history as {
      listen: (listener: unknown) => () => void
      push: (to: string) => void
    }
    const unlisten = history.listen(listener)
    history.push('/desk')
    unlisten()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({pathname: '/desk'}))
  })

  it('exposes the full history surface Studio reads from', async () => {
    const props = await renderStudio({name: 'default', basePath: '/'}, 'hash')
    const history = props.unstable_history as unknown as {
      action: string
      location: {pathname: string}
      createHref: (to: string) => string
      push: (to: string) => void
      replace: (to: string) => void
      go: (delta: number) => void
      back: () => void
      forward: () => void
      block: (blocker: unknown) => () => void
    }

    history.push('/desk/movie')
    expect(history.action).toBe('PUSH')
    expect(history.location.pathname).toBe('/desk/movie')
    expect(history.createHref('/vision')).toBe('#/vision')

    history.replace('/vision')
    expect(history.action).toBe('REPLACE')
    expect(window.location.hash).toBe('#/vision')

    const unblock = history.block(() => {})
    expect(typeof unblock).toBe('function')
    unblock()
    for (const method of [history.go, history.back, history.forward]) {
      expect(typeof method).toBe('function')
    }
  })

  it('seeds an empty hash with the first workspace path', async () => {
    await renderStudio(
      [
        {name: 'marketing', basePath: '/marketing'},
        {name: 'blog', basePath: '/blog'},
      ],
      'hash',
    )

    expect(window.location.hash).toBe('#/marketing')
  })

  it('leaves an existing hash alone', async () => {
    window.history.replaceState(null, '', '/admin#/blog')

    await renderStudio(
      [
        {name: 'marketing', basePath: '/marketing'},
        {name: 'blog', basePath: '/blog'},
      ],
      'hash',
    )

    expect(window.location.hash).toBe('#/blog')
  })

  it('turns workspace links into hash navigation', async () => {
    await renderStudio(
      [
        {name: 'marketing', basePath: '/marketing'},
        {name: 'blog', basePath: '/blog'},
      ],
      'hash',
    )

    expect(studioClaimsClick('/blog')).toBe(true)
    expect(window.location.hash).toBe('#/blog')
  })

  it('ignores links that are not workspace roots, open elsewhere, or use modifier keys', async () => {
    await renderStudio(
      [
        {name: 'marketing', basePath: '/marketing'},
        {name: 'blog', basePath: '/blog'},
      ],
      'hash',
    )

    expect(studioClaimsClick('/somewhere-else')).toBe(false)
    expect(studioClaimsClick('https://example.com/blog')).toBe(false)
    expect(studioClaimsClick('/blog', {metaKey: true})).toBe(false)
    expect(studioClaimsClick('/blog', {button: 1})).toBe(false)
    expect(window.location.hash).toBe('#/marketing')
  })
})
