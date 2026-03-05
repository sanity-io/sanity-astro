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
  const [navigate, setNavigate] = React.useState<HistoryNavigate | undefined>()

  React.useEffect(() => {
    if (!navigate) {
      return
    }

    let lastUrl = ''
    const syncCurrentUrl = () => {
      const url = getPresentationUrl(window.location)
      if (!shouldPublishUrl(url, lastUrl)) {
        return
      }
      lastUrl = url
      navigate({
        type: 'push',
        title: document.title,
        url,
      })
    }

    syncCurrentUrl()
    window.addEventListener('popstate', syncCurrentUrl)
    window.addEventListener('hashchange', syncCurrentUrl)
    const intervalId = window.setInterval(syncCurrentUrl, 500)

    return () => {
      window.removeEventListener('popstate', syncCurrentUrl)
      window.removeEventListener('hashchange', syncCurrentUrl)
      window.clearInterval(intervalId)
    }
  }, [navigate])

  const history = React.useMemo<HistoryAdapter>(
    () => ({
      subscribe: (_navigate) => {
        setNavigate(() => _navigate)
        return () => {
          setNavigate(undefined)
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
