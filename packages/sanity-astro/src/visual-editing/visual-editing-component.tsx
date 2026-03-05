import React from 'react'
import {
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import {
  applyPresentationHistoryUpdate,
  getPresentationUrl,
  shouldPublishUrl,
} from './history'

export type VisualEditingOptions = Pick<InternalVisualEditingOptions, 'zIndex'>
type HistoryAdapter = NonNullable<InternalVisualEditingOptions['history']>
type HistoryNavigate = Parameters<HistoryAdapter['subscribe']>[0]

export function VisualEditingComponent(props: VisualEditingOptions) {
  const navigateRef = React.useRef<HistoryNavigate | undefined>()
  const lastUrlRef = React.useRef('')
  const lastPublishedAtRef = React.useRef(0)

  React.useEffect(() => {
    const publishUrl = (url: string, force = false) => {
      const navigate = navigateRef.current
      if (!navigate) {
        return
      }
      const now = Date.now()
      const shouldRepublish = now - lastPublishedAtRef.current > 2_000
      if (!force && !shouldPublishUrl(url, lastUrlRef.current) && !shouldRepublish) {
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

      publishUrl(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`, true)
    }

    syncCurrentUrl()
    window.addEventListener('popstate', syncCurrentUrl)
    window.addEventListener('hashchange', syncCurrentUrl)
    document.addEventListener('click', publishClickedLink, true)
    const intervalId = window.setInterval(syncCurrentUrl, 500)

    return () => {
      window.removeEventListener('popstate', syncCurrentUrl)
      window.removeEventListener('hashchange', syncCurrentUrl)
      document.removeEventListener('click', publishClickedLink, true)
      window.clearInterval(intervalId)
    }
  }, [])

  const history = React.useMemo<HistoryAdapter>(
    () => ({
      subscribe: (_navigate) => {
        navigateRef.current = _navigate
        lastUrlRef.current = ''
        lastPublishedAtRef.current = 0
        return () => {
          // Keep the existing callback across edit mode toggles.
          // Presentation may briefly unsubscribe when overlays are disabled.
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
