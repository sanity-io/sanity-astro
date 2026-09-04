import {Idiomorph} from './idiomorph.js'

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
 * Astro's `transition:persist` attribute already means "keep this element across page swaps",
 * so it doubles as the opt-out for widgets a client script injected after load and for
 * server-rendered elements whose client state must survive a refresh.
 */
const PERSIST_ATTRIBUTE = 'data-astro-transition-persist'

/**
 * Head resources are kept even when the server stops sending them: Vite dev styles,
 * styled-components output and font loaders all inject head nodes the server never rendered,
 * and dropping a stylesheet mid-preview flashes unstyled content. Everything else in `<head>`
 * (title, meta, canonical and alternate links, JSON-LD) is metadata the server owns.
 */
const PRESERVED_HEAD_LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload'])

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
  signal?: AbortSignal,
): Promise<Document> {
  const response = await fetchImpl(url, {
    headers: {accept: 'text/html'},
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
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

/** The fragment never reaches the server, so URLs that differ only by hash are the same page. */
export function stripHash(url: string): string {
  return url.split('#')[0]
}

function isClientOwned(node: Node): boolean {
  return (
    node instanceof Element &&
    (CLIENT_OWNED_TAGS.has(node.tagName) || node.hasAttribute(PERSIST_ATTRIBUTE))
  )
}

function isIsland(node: Node): node is Element {
  return node instanceof Element && node.tagName === 'ASTRO-ISLAND'
}

/** Script types the browser executes. Data blocks like JSON-LD are content, not behaviour. */
function isExecutableScript(script: HTMLScriptElement): boolean {
  const type = script.getAttribute('type')
  return (
    !type || type === 'module' || type === 'text/javascript' || type === 'application/javascript'
  )
}

function scriptSignature(script: HTMLScriptElement): string {
  return script.getAttribute('src') ?? script.textContent ?? ''
}

/**
 * A script parsed by `DOMParser` is permanently flagged as already started, so a morph can
 * insert it but never run it. When the fresh HTML introduces one, only a reload gives it the
 * behaviour the server intended.
 */
export function hasNewExecutableScript(target: Document, next: Document): boolean {
  const live = new Set(
    [...target.body.querySelectorAll('script')].filter(isExecutableScript).map(scriptSignature),
  )
  return [...next.body.querySelectorAll('script')]
    .filter(isExecutableScript)
    .some((script) => !live.has(scriptSignature(script)))
}

/**
 * A control the visitor has typed in or toggled. Idiomorph syncs values on every non-focused
 * control, which would discard a half-filled form each time content changes.
 */
function isDirtyFormControl(node: Node): boolean {
  if (node instanceof HTMLInputElement) {
    return node.type === 'checkbox' || node.type === 'radio'
      ? node.checked !== node.defaultChecked
      : node.value !== node.defaultValue
  }
  if (node instanceof HTMLTextAreaElement) {
    return node.value !== node.defaultValue
  }
  if (node instanceof HTMLSelectElement) {
    return [...node.options].some((option) => option.selected !== option.defaultSelected)
  }
  return false
}

function isPreservedHeadElement(element: Element): boolean {
  switch (element.tagName) {
    case 'STYLE':
    case 'NOSCRIPT':
      return true
    case 'SCRIPT':
      return element.getAttribute('type') !== 'application/ld+json'
    case 'LINK':
      return PRESERVED_HEAD_LINK_RELS.has(element.getAttribute('rel') ?? '')
    default:
      return false
  }
}

/**
 * Hydrated islands keep their client-rendered subtree, but `astro-island` re-hydrates when its
 * `props` attribute changes, so fresh server props still reach the component.
 */
function syncIslandProps(island: Element, next: Node): void {
  if (!(next instanceof Element)) {
    return
  }
  const props = next.getAttribute('props')
  if (props !== null && props !== island.getAttribute('props')) {
    island.setAttribute('props', props)
  }
}

/**
 * Patches `target` in place so it matches `next`, keeping node identity where the content
 * did not change. Text nodes keep their stega characters because they arrive in the fresh
 * HTML too. Islands, persisted elements and client-owned nodes keep their subtrees.
 */
export function morphDocument(target: Document, next: Document): void {
  Idiomorph.morph(target.documentElement, next.documentElement, {
    ignoreActiveValue: true,
    head: {
      style: 'merge',
      shouldPreserve: isPreservedHeadElement,
    },
    callbacks: {
      beforeNodeRemoved: (node) => !isClientOwned(node),
      beforeNodeMorphed: (oldNode, newNode) => {
        if (isIsland(oldNode)) {
          syncIslandProps(oldNode, newNode)
          return false
        }
        return !isClientOwned(oldNode) && !isDirtyFormControl(oldNode)
      },
      beforeAttributeUpdated: (_name, node) =>
        node !== target.documentElement && node !== target.body,
    },
  })
}
