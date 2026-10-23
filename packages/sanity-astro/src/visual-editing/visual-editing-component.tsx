import {
  VisualEditing as InternalVisualEditing,
  type HistoryAdapter,
  type HistoryAdapterNavigate,
  type VisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'
import {
  createDefaultRefresh,
  type RefreshStrategy,
  resolveRefreshStrategy,
} from './refresh-strategy'

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
export type {RefreshStrategy}

/** Everything `@sanity/visual-editing`'s `VisualEditing` accepts, plus this integration's own options. */
export type VisualEditingComponentProps = VisualEditingOptions & {
  /**
   * Experimental, opt-in. How the default `refresh` updates the preview when Presentation
   * reports a change; see {@link RefreshStrategy}. Unset, the default, is a plain page reload.
   * Ignored when you pass your own `refresh`.
   */
  experimental_refreshStrategy?: RefreshStrategy
}

export function VisualEditingComponent(props: VisualEditingComponentProps) {
  // Strip this integration's own option so only upstream props are forwarded.
  const {experimental_refreshStrategy, ...upstreamProps} = props
  const navigateRef = React.useRef<HistoryAdapterNavigate | undefined>(undefined)
  const lastUrlRef = React.useRef('')
  const optimisticUrlRef = React.useRef<string | undefined>(undefined)
  const optimisticUntilRef = React.useRef(0)
  const clearNavigateTimeoutRef = React.useRef<number | undefined>(undefined)
  const hasCustomHistory = Boolean(props.history)
  const hasCustomRefresh = Boolean(props.refresh)
  // A custom `refresh` replaces the strategy, so no follow-up reload is armed for it.
  const {followUpDelayMs} = hasCustomRefresh
    ? {followUpDelayMs: undefined}
    : resolveRefreshStrategy(experimental_refreshStrategy)
  const defaultRefresh = React.useMemo(
    () => createDefaultRefresh({type: 'reload', followUpDelayMs}, window),
    [followUpDelayMs],
  )

  React.useEffect(() => defaultRefresh.arrive(), [defaultRefresh])

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
      {...upstreamProps}
      portal
      history={props.history ?? defaultHistory}
      refresh={props.refresh ?? defaultRefresh.refresh}
    />
  )
}
