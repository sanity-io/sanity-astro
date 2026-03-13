import React from 'react'
import {
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'

export type VisualEditingOptions = Pick<InternalVisualEditingOptions, 'zIndex'>
type HistoryAdapter = NonNullable<InternalVisualEditingOptions['history']>
type HistoryNavigate = Parameters<HistoryAdapter['subscribe']>[0]

export function VisualEditingComponent(props: VisualEditingOptions) {
  const navigateRef = React.useRef<HistoryNavigate | undefined>()
  const lastUrlRef = React.useRef('')
  const lastPublishedAtRef = React.useRef(0)
  const optimisticUrlRef = React.useRef<string | undefined>()
  const optimisticUntilRef = React.useRef(0)
  const clearNavigateTimeoutRef = React.useRef<number | undefined>()

  React.useEffect(() => {
    const publishUrl = (url: string, force = false) => {
      const navigate = navigateRef.current
      if (!navigate) {
        return
      }
      const now = Date.now()
      const optimisticUrl = optimisticUrlRef.current
      const optimisticWindowOpen = now < optimisticUntilRef.current
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
      lastPublishedAtRef.current = now
      navigate({
        type: 'push',
        title: document.title,
        url,
      })
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

    syncCurrentUrl()
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
  }, [])

  const history = React.useMemo<HistoryAdapter>(
    () => ({
      subscribe: (_navigate) => {
        window.clearTimeout(clearNavigateTimeoutRef.current)
        navigateRef.current = _navigate
        const currentUrl = getPresentationUrl(window.location)
        lastUrlRef.current = currentUrl
        lastPublishedAtRef.current = Date.now()
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
    [],
  )

  return (
    <InternalVisualEditing
      portal
      history={history}
      zIndex={props.zIndex}
      refresh={() => {
        return new Promise((resolve) => {
          window.location.reload()
          resolve()
        })
      }}
    />
  )
}
