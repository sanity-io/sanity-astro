import {Idiomorph} from 'idiomorph'

/**
 * Elements that live in the page but never come from the server render, so a morph must
 * not remove them: the overlay host, Astro's dev toolbar and Vite's error overlay.
 */
const CLIENT_OWNED_TAGS = new Set([
  'SANITY-VISUAL-EDITING',
  'ASTRO-DEV-TOOLBAR',
  'VITE-ERROR-OVERLAY',
])
/**
 * Head elements the server owns outright. Everything else in `<head>` may have been injected
 * by a client (Vite dev styles, styled-components, font loaders) and is left alone.
 */
const SERVER_OWNED_HEAD_TAGS = new Set(['TITLE', 'META'])

export class RefreshFetchError extends Error {
  constructor(
    message: string,
    readonly response: Response,
  ) {
    super(message)
    this.name = 'RefreshFetchError'
  }
}

export async function fetchDocument(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Document> {
  const response = await fetchImpl(url, {
    headers: {accept: 'text/html'},
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new RefreshFetchError(`Refresh fetch returned ${response.status}`, response)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    throw new RefreshFetchError(
      `Refresh fetch returned ${contentType || 'no content type'}`,
      response,
    )
  }
  if (response.redirected && stripHash(response.url) !== stripHash(url)) {
    throw new RefreshFetchError(`Refresh fetch redirected to ${response.url}`, response)
  }
  return new DOMParser().parseFromString(await response.text(), 'text/html')
}

function stripHash(url: string): string {
  return url.split('#')[0]
}

/**
 * Astro's `transition:persist` attribute already means "keep this element across page swaps",
 * so it doubles as the opt-out for widgets a client script injected after load.
 */
const PERSIST_ATTRIBUTE = 'data-astro-transition-persist'

function isClientOwned(node: Node): boolean {
  return (
    node instanceof Element &&
    (CLIENT_OWNED_TAGS.has(node.tagName) || node.hasAttribute(PERSIST_ATTRIBUTE))
  )
}

function isIsland(node: Node): boolean {
  return node instanceof Element && node.tagName === 'ASTRO-ISLAND'
}

/**
 * Patches `target` in place so it matches `next`, keeping node identity where the content
 * did not change. Text nodes keep their stega characters because they arrive in the fresh
 * HTML too. Hydrated islands and client-owned elements are skipped.
 */
export function morphDocument(target: Document, next: Document): void {
  Idiomorph.morph(target.documentElement, next.documentElement, {
    ignoreActiveValue: true,
    head: {
      style: 'merge',
      shouldPreserve: (element) => !SERVER_OWNED_HEAD_TAGS.has(element.tagName),
    },
    callbacks: {
      beforeNodeRemoved: (node) => !isClientOwned(node),
      beforeNodeMorphed: (oldNode) => !isIsland(oldNode),
      beforeAttributeUpdated: (_name, node) =>
        node !== target.documentElement && node !== target.body,
    },
  })
}

export function createMorph(fetchImpl?: typeof fetch): () => Promise<void> {
  return async () => {
    const next = await fetchDocument(window.location.href, fetchImpl)
    morphDocument(document, next)
  }
}
