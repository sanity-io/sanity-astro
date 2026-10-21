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
 * Attributes that mark a head node as injected by a client at runtime rather than rendered by
 * the server: Vite's dev styles and styled-components' sheet. Everything else in `<head>` is
 * reconciled, since preserving a changed node keeps the old copy and appends the new one.
 */
const CLIENT_INJECTED_HEAD_ATTRIBUTES = [
  'data-vite-dev-id',
  'data-styled',
  'data-styled-version',
  PERSIST_ATTRIBUTE,
]

export class RefreshFetchError extends Error {
  constructor(message: string) {
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
    throw new RefreshFetchError(`Refresh fetch returned ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    throw new RefreshFetchError(`Refresh fetch returned ${contentType || 'no content type'}`)
  }
  if (response.redirected && stripHash(response.url) !== stripHash(url)) {
    throw new RefreshFetchError(`Refresh fetch redirected to ${response.url}`)
  }
  return new DOMParser().parseFromString(await response.text(), 'text/html')
}

function stripHash(url: string): string {
  return url.split('#')[0]
}

function isClientOwned(node: Node): boolean {
  return (
    node instanceof Element &&
    (CLIENT_OWNED_TAGS.has(node.tagName) || node.hasAttribute(PERSIST_ATTRIBUTE))
  )
}

/**
 * A hydrated island owns its subtree, so the morph must not touch it. Astro drops the `ssr`
 * attribute once hydration finishes, so an island that still carries it is server markup a
 * morph can safely update.
 */
function isHydratedIsland(node: Node): node is Element {
  return node instanceof Element && node.tagName === 'ASTRO-ISLAND' && !node.hasAttribute('ssr')
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
    [...target.querySelectorAll('script')].filter(isExecutableScript).map(scriptSignature),
  )
  return [...next.querySelectorAll('script')]
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
  return CLIENT_INJECTED_HEAD_ATTRIBUTES.some((attribute) => element.hasAttribute(attribute))
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
        if (isHydratedIsland(oldNode)) {
          syncIslandProps(oldNode, newNode)
          return false
        }
        return !isClientOwned(oldNode) && !isDirtyFormControl(oldNode)
      },
      // `class` and `style` on the root elements are the ones client scripts mutate (theme
      // toggles, scroll locks), so they stay; everything else the server sends lands.
      beforeAttributeUpdated: (name, node) =>
        (node !== target.documentElement && node !== target.body) ||
        (name !== 'class' && name !== 'style'),
    },
  })
}
