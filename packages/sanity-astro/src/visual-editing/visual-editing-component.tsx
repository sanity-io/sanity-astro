import {
  VisualEditing as InternalVisualEditing,
  type SuspiciousStegaReport,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import {markFollowUpReload, scheduleFollowUpReload} from './follow-up-reload'
import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'

export type {SuspiciousStegaReport}

export type VisualEditingOptions = Pick<
  InternalVisualEditingOptions,
  'zIndex' | 'refresh' | 'history' | 'keepStegaOnCopy' | 'onSuspiciousStega'
> & {
  /**
   * Experimental, opt-in. Milliseconds to wait after a change-triggered page reload before
   * reloading once more, so edits typed while the first reload was in flight
   * still show up in the preview (Visual Editing's built-in follow-up refresh
   * is lost when the page fully reloads). Unset, the default, leaves this off.
   * Only applies to the default `refresh`; ignored when you pass your own.
   */
  assureTypingInterval?: number
}
type HistoryAdapter = NonNullable<InternalVisualEditingOptions['history']>
type HistoryNavigate = Parameters<HistoryAdapter['subscribe']>[0]

function createDefaultRefresh(
  followUpReload: boolean,
): NonNullable<InternalVisualEditingOptions['refresh']> {
  return (payload) => {
    return new Promise((resolve) => {
      if (followUpReload) {
        markFollowUpReload(payload, window)
      }
      window.location.reload()
      resolve()
    })
  }
}

export function VisualEditingComponent(props: VisualEditingOptions) {
  const navigateRef = React.useRef<HistoryNavigate | undefined>()
  const lastUrlRef = React.useRef('')
  const lastPublishedAtRef = React.useRef(0)
  const optimisticUrlRef = React.useRef<string | undefined>()
  const optimisticUntilRef = React.useRef(0)
  const clearNavigateTimeoutRef = React.useRef<number | undefined>()
  const hasCustomHistory = Boolean(props.history)
  const {assureTypingInterval} = props
  const followUpReload = typeof assureTypingInterval === 'number' && assureTypingInterval > 0
  const defaultRefresh = React.useMemo(() => createDefaultRefresh(followUpReload), [followUpReload])

  React.useEffect(() => {
    if (!followUpReload) {
      return
    }
    return scheduleFollowUpReload(window, () => window.location.reload(), assureTypingInterval)
  }, [followUpReload, assureTypingInterval])

  React.useEffect(() => {
    // Skip the default URL sync when the consumer supplies their own history adapter.
    if (hasCustomHistory) {
      return
    }
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
  }, [hasCustomHistory])

  const defaultHistory = React.useMemo<HistoryAdapter>(
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
      history={props.history ?? defaultHistory}
      zIndex={props.zIndex}
      refresh={props.refresh ?? defaultRefresh}
      keepStegaOnCopy={props.keepStegaOnCopy}
      onSuspiciousStega={props.onSuspiciousStega}
    />
  )
}
