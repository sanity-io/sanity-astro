import type {
  HistoryAdapter,
  HistoryAdapterNavigate,
  HistoryUpdate,
} from '@sanity/visual-editing/enable-visual-editing'

export type {HistoryAdapter, HistoryAdapterNavigate, HistoryUpdate}

export function getPresentationUrl(location: {
  pathname: string
  search: string
  hash: string
}): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function shouldPublishUrl(nextUrl: string, previousUrl: string): boolean {
  return nextUrl !== previousUrl
}

export function applyPresentationHistoryUpdate(
  update: Pick<HistoryUpdate, 'type' | 'url'>,
  currentHref: string,
  navigate: {
    assign: (url: string) => void
    replace: (url: string) => void
    back: () => void
  },
): void {
  switch (update.type) {
    case 'push': {
      if (currentHref !== update.url) {
        navigate.assign(update.url)
      }
      return
    }
    case 'replace': {
      if (currentHref !== update.url) {
        navigate.replace(update.url)
      }
      return
    }
    case 'pop': {
      navigate.back()
      return
    }
    default: {
      throw new Error(
        `Unknown history update type: ${(update as {type?: string}).type ?? 'unknown'}`,
      )
    }
  }
}

/**
 * How long link clicks keep publishing after Presentation unsubscribes, so a click that
 * toggles edit mode off still reaches the Studio before the browser navigates.
 */
const NAVIGATE_GRACE_MS = 200
/**
 * How long a clicked link's URL wins over the current location, covering the gap between
 * the click and the browser committing the navigation.
 */
const OPTIMISTIC_URL_MS = 1_500

export interface BrowserHistoryAdapter extends HistoryAdapter {
  dispose(): void
}

/**
 * Keeps Presentation's URL bar in sync with the preview frame and applies navigation
 * requests coming back from Presentation. Framework-free; works with plain `.astro` pages.
 */
export function createBrowserHistoryAdapter(): BrowserHistoryAdapter {
  let navigate: HistoryAdapterNavigate | undefined
  let lastUrl = ''
  let optimisticUrl: string | undefined
  let optimisticUntil = 0
  let clearNavigateTimeout: number | undefined

  const publishUrl = (url: string, force = false) => {
    if (!navigate) {
      return
    }
    const now = Date.now()
    const optimisticWindowOpen = now < optimisticUntil
    if (!force && optimisticUrl && optimisticWindowOpen && url !== optimisticUrl) {
      return
    }
    if (optimisticUrl && url === optimisticUrl) {
      optimisticUrl = undefined
      optimisticUntil = 0
    }
    if (!force && !shouldPublishUrl(url, lastUrl)) {
      return
    }
    lastUrl = url
    navigate({type: 'push', title: document.title, url})
  }
  const syncCurrentUrl = () => {
    publishUrl(getPresentationUrl(window.location))
  }
  const publishClickedLink = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) {
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return
    }
    const eventTarget = event.target
    if (!(eventTarget instanceof Element)) {
      return
    }
    const anchor = eventTarget.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) {
      return
    }
    if (anchor.target && anchor.target !== '_self') {
      return
    }
    let targetUrl: URL
    try {
      targetUrl = new URL(anchor.href, window.location.href)
    } catch {
      return
    }
    if (targetUrl.origin !== window.location.origin) {
      return
    }
    const url = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
    optimisticUrl = url
    optimisticUntil = Date.now() + OPTIMISTIC_URL_MS
    publishUrl(url, true)
  }

  window.addEventListener('popstate', syncCurrentUrl)
  window.addEventListener('hashchange', syncCurrentUrl)
  document.addEventListener('click', publishClickedLink, true)
  const nativePushState = window.history.pushState
  const nativeReplaceState = window.history.replaceState
  window.history.pushState = function (...args) {
    nativePushState.apply(window.history, args)
    syncCurrentUrl()
  }
  window.history.replaceState = function (...args) {
    nativeReplaceState.apply(window.history, args)
    syncCurrentUrl()
  }

  return {
    subscribe: (nextNavigate) => {
      window.clearTimeout(clearNavigateTimeout)
      navigate = nextNavigate
      lastUrl = getPresentationUrl(window.location)
      return () => {
        clearNavigateTimeout = window.setTimeout(() => {
          if (navigate === nextNavigate) {
            navigate = undefined
          }
        }, NAVIGATE_GRACE_MS)
      }
    },
    update: (update) => {
      applyPresentationHistoryUpdate(update, window.location.href, {
        assign: (url) => window.location.assign(url),
        replace: (url) => window.location.replace(url),
        back: () => window.history.back(),
      })
    },
    dispose: () => {
      window.clearTimeout(clearNavigateTimeout)
      navigate = undefined
      window.removeEventListener('popstate', syncCurrentUrl)
      window.removeEventListener('hashchange', syncCurrentUrl)
      document.removeEventListener('click', publishClickedLink, true)
      window.history.pushState = nativePushState
      window.history.replaceState = nativeReplaceState
    },
  }
}
