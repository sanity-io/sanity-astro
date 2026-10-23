import {
  VisualEditing as InternalVisualEditing,
  type HistoryAdapter,
  type HistoryAdapterNavigate,
  type HistoryRefresh,
  type VisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'

// `@sanity/visual-editing` is a dependency rather than a peer, so consumers cannot import these
// from it directly under a non-hoisted layout; re-export what typed callbacks need.
export type {
  HistoryAdapter,
  HistoryAdapterNavigate,
  HistoryRefresh,
  HistoryUpdate,
  OverlayComponentResolver,
  OverlayPluginDefinition,
  SuspiciousStegaReport,
  VisualEditingOptions,
} from '@sanity/visual-editing/react'

const defaultRefresh: (payload: HistoryRefresh) => Promise<void> = () =>
  new Promise<void>((resolve) => {
    window.location.reload()
    resolve()
  })

export function VisualEditingComponent(props: VisualEditingOptions) {
  const navigateRef = React.useRef<HistoryAdapterNavigate | undefined>()
  const lastUrlRef = React.useRef('')
  const optimisticUrlRef = React.useRef<string | undefined>()
  const optimisticUntilRef = React.useRef(0)
  const clearNavigateTimeoutRef = React.useRef<number | undefined>()
  const hasCustomHistory = Boolean(props.history)

  const publishUrl = React.useCallback((url: string, force = false) => {
    const navigate = navigateRef.current
    if (!navigate) {
      return
    }
    const optimisticUrl = optimisticUrlRef.current
    const optimisticWindowOpen = Date.now() < optimisticUntilRef.current
    if (!force && optimisticUrl && optimisticWindowOpen && url !== optimisticUrl) {
      return
    }
    if (optimisticUrl && url === optimisticUrl) {
      optimisticUrlRef.current = undefined
      optimisticUntilRef.current = 0
    }
    if (!force && !shouldPublishUrl(url, lastUrlRef.current)) {
      return
    }
    lastUrlRef.current = url
    navigate({
      type: 'push',
      title: document.title,
      url,
    })
  }, [])

  React.useEffect(() => {
    // Skip the default URL sync when the consumer supplies their own history adapter.
    if (hasCustomHistory) {
      return
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
      optimisticUrlRef.current = url
      optimisticUntilRef.current = Date.now() + 1_500
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

    return () => {
      window.removeEventListener('popstate', syncCurrentUrl)
      window.removeEventListener('hashchange', syncCurrentUrl)
      document.removeEventListener('click', publishClickedLink, true)
      window.history.pushState = nativePushState
      window.history.replaceState = nativeReplaceState
    }
  }, [hasCustomHistory, publishUrl])

  const defaultHistory = React.useMemo<HistoryAdapter>(
    () => ({
      subscribe: (_navigate) => {
        window.clearTimeout(clearNavigateTimeoutRef.current)
        navigateRef.current = _navigate
        // Presentation can't drive the frame until it has reported a URL, and an MPA has
        // no router event to report it from, so publish the current one on every subscribe.
        publishUrl(getPresentationUrl(window.location), true)
        return () => {
          // Keep navigation publishing alive briefly for immediate link clicks
          // after edit mode is toggled off, then release it to respect off mode.
          clearNavigateTimeoutRef.current = window.setTimeout(() => {
            if (navigateRef.current === _navigate) {
              navigateRef.current = undefined
            }
          }, 200)
        }
      },
      update: (update) => {
        applyPresentationHistoryUpdate(update, window.location.href, {
          assign: (url) => window.location.assign(url),
          replace: (url) => window.location.replace(url),
          back: () => window.history.back(),
        })
      },
    }),
    [publishUrl],
  )

  return (
    <InternalVisualEditing
      {...props}
      portal
      history={props.history ?? defaultHistory}
      refresh={props.refresh ?? defaultRefresh}
    />
  )
}
