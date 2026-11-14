import type {ClientPerspective} from '@sanity/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {getActivePerspective, onRequest, type SanityMiddlewareContext} from './middleware'

function createContext({
                         url = 'http://localhost:4321/movies',
                         headers = {},
                         cookies = {},
                         isPrerendered = false,
                       }: {
  url?: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
  isPrerendered?: boolean
} = {}): SanityMiddlewareContext {
  const parsedUrl = new URL(url)
  const request = new Request(parsedUrl)
  Object.defineProperty(request, 'headers', {
    value: new Headers(headers),
  })

  return {
    isPrerendered,
    request,
    url: parsedUrl,
    cookies: {
      get(name: string) {
        return Object.prototype.hasOwnProperty.call(cookies, name)
          ? {value: cookies[name]}
          : undefined
      },
    },
  }
}

describe('visual-editing middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults getActivePerspective() to "published" outside a request context', () => {
    expect(getActivePerspective()).toBe('published')
  })

  it('locks perspective to "published" and leaves Cache-Control untouched when visual editing is disabled', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'false')

    let observed: ClientPerspective | undefined
    const response = await onRequest(
      createContext({
        url: 'http://localhost:4321/movies?sanity-preview-perspective=drafts',
        cookies: {'sanity-perspective-localhost-4321': 'drafts'},
      }),
      async () => {
        observed = getActivePerspective()
        return new Response('ok')
      },
    )

    expect(observed).toBe('published')
    expect(response.headers.get('Cache-Control')).toBeNull()
  })

  it('locks perspective to "published" for prerendered routes even when visual editing is enabled', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let observed: ClientPerspective | undefined
    const response = await onRequest(
      createContext({
        url: 'http://localhost:4321/movies?sanity-preview-perspective=drafts',
        isPrerendered: true,
      }),
      async () => {
        observed = getActivePerspective()
        return new Response('ok')
      },
    )

    expect(observed).toBe('published')
    expect(response.headers.get('Cache-Control')).toBeNull()
  })

  it('defaults to "published" and sets no-store Cache-Control when visual editing is enabled without param or cookie', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let observed: ClientPerspective | undefined
    const response = await onRequest(createContext(), async () => {
      observed = getActivePerspective()
      return new Response('ok')
    })

    expect(observed).toBe('published')
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate',
    )
  })

  it('resolves perspective from sanity-preview-perspective or perspective URL params over cookies', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let firstObserved: ClientPerspective | undefined
    const firstResponse = await onRequest(
      createContext({
        url: 'http://localhost:4321/movies?sanity-preview-perspective=drafts',
        cookies: {'sanity-perspective-localhost-4321': 'published'},
      }),
      async () => {
        firstObserved = getActivePerspective()
        return new Response('ok')
      },
    )

    expect(firstObserved).toBe('drafts')
    expect(firstResponse.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate',
    )

    let secondObserved: ClientPerspective | undefined
    await onRequest(
      createContext({
        url: 'http://localhost:4321/movies?perspective=previewDrafts',
      }),
      async () => {
        secondObserved = getActivePerspective()
        return new Response('ok')
      },
    )

    expect(secondObserved).toBe('previewDrafts')
  })

  it('reads the host-isolated cookie across x-forwarded-host, host, and url.host', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let forwardedObserved: ClientPerspective | undefined
    await onRequest(
      createContext({
        url: 'http://127.0.0.1:4321/movies',
        headers: {
          'x-forwarded-host': 'preview.example.com:8443, internal.proxy',
          host: 'ignored.example.com',
        },
        cookies: {'sanity-perspective-preview-example-com-8443': 'drafts'},
      }),
      async () => {
        forwardedObserved = getActivePerspective()
        return new Response('ok')
      },
    )
    expect(forwardedObserved).toBe('drafts')

    let hostHeaderObserved: ClientPerspective | undefined
    await onRequest(
      createContext({
        url: 'http://127.0.0.1:4321/movies',
        headers: {host: 'staging.example.com:3000'},
        cookies: {'sanity-perspective-staging-example-com-3000': 'previewDrafts'},
      }),
      async () => {
        hostHeaderObserved = getActivePerspective()
        return new Response('ok')
      },
    )
    expect(hostHeaderObserved).toBe('previewDrafts')

    let urlHostObserved: ClientPerspective | undefined
    await onRequest(
      createContext({
        url: 'http://localhost:4321/movies',
        cookies: {'sanity-perspective-localhost-4321': 'drafts'},
      }),
      async () => {
        urlHostObserved = getActivePerspective()
        return new Response('ok')
      },
    )
    expect(urlHostObserved).toBe('drafts')
  })

  it('parses comma-separated release stacks into a perspective array', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let observed: ClientPerspective | undefined
    await onRequest(
      createContext({
        url: 'http://localhost:4321/movies',
        cookies: {'sanity-perspective-localhost-4321': 'r1,r2,drafts'},
      }),
      async () => {
        observed = getActivePerspective()
        return new Response('ok')
      },
    )

    expect(observed).toEqual(['r1', 'r2', 'drafts'])
  })

  it('isolates concurrent async requests with different perspectives', async () => {
    vi.stubEnv('PUBLIC_SANITY_VISUAL_EDITING_ENABLED', 'true')

    let releaseFirst!: () => void
    const firstWaiting = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const observedFirst: ClientPerspective[] = []
    const observedSecond: ClientPerspective[] = []

    const firstRequest = onRequest(
      createContext({url: 'http://localhost:4321/a?sanity-preview-perspective=drafts'}),
      async () => {
        observedFirst.push(getActivePerspective())
        await firstWaiting
        observedFirst.push(getActivePerspective())
        return new Response('first')
      },
    )

    const secondRequest = onRequest(
      createContext({url: 'http://localhost:4321/b?sanity-preview-perspective=r1,drafts'}),
      async () => {
        observedSecond.push(getActivePerspective())
        releaseFirst()
        return new Response('second')
      },
    )

    await Promise.all([firstRequest, secondRequest])

    expect(observedFirst).toEqual(['drafts', 'drafts'])
    expect(observedSecond).toEqual([['r1', 'drafts']])
    expect(getActivePerspective()).toBe('published')
  })
})