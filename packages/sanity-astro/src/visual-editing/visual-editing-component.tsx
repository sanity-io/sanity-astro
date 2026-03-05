import React from 'react'
import {
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'

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
      const url = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (url === lastUrl) {
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
        switch (update.type) {
          case 'push': {
            if (window.location.href !== update.url) {
              window.location.assign(update.url)
            }
            return
          }
          case 'replace': {
            if (window.location.href !== update.url) {
              window.location.replace(update.url)
            }
            return
          }
          case 'pop': {
            window.history.back()
            return
          }
          default: {
            throw new Error(`Unknown history update type: ${(update as {type?: string}).type ?? 'unknown'}`)
          }
        }
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
