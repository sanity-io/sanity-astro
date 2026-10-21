import {
  type HistoryAdapter,
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import {createBrowserHistoryAdapter} from './history.js'
import {createRuntime, type Runtime} from './runtime.js'

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
} from '@sanity/visual-editing/react'

/** Every option of `VisualEditing` from `@sanity/visual-editing/react`, plus the Astro flag. */
export type VisualEditingOptions = InternalVisualEditingOptions & {
  /**
   * Opts into the experimental in-place refresh: stega text updates the moment a change
   * arrives and the page morphs instead of reloading. Off by default; the page then reloads on
   * every refresh, as it always has. Ignored when a custom `refresh` is given.
   */
  experimental_inPlaceRefresh?: boolean
}

interface Defaults {
  history: HistoryAdapter | undefined
  runtime: Runtime | undefined
}

/**
 * React island wrapper around `VisualEditing` from `@sanity/visual-editing/react` with the same
 * defaults as the `.astro` component: URL sync with Presentation and a page reload on refresh.
 * Every other option is forwarded as is, so this is the component to reach for when you need a
 * custom `refresh` or `history` function, `onSuspiciousStega` or the overlay plugin APIs.
 */
export function VisualEditingComponent(props: VisualEditingOptions) {
  const {experimental_inPlaceRefresh, ...upstream} = props
  const inPlaceRefresh = experimental_inPlaceRefresh === true
  const hasCustomHistory = upstream.history !== undefined
  const hasCustomRefresh = upstream.refresh !== undefined
  const [defaults, setDefaults] = React.useState<Defaults>()

  // Keyed on whether a custom handler exists, not on its identity: an inline `refresh` gets a
  // new identity every parent render and must not rebuild the defaults.
  React.useEffect(() => {
    const history = hasCustomHistory ? undefined : createBrowserHistoryAdapter()
    const runtime = hasCustomRefresh ? undefined : createRuntime({inPlaceRefresh})
    // Both install window listeners, so they cannot be built during render; one extra render
    // at mount is the price of keeping StrictMode's double-invoked initializers clean.
    // oxlint-disable-next-line react/set-state-in-effect
    setDefaults({history, runtime})
    return () => {
      runtime?.dispose()
      history?.dispose()
    }
  }, [hasCustomHistory, hasCustomRefresh, inPlaceRefresh])

  const history = upstream.history ?? defaults?.history
  const refresh = upstream.refresh ?? defaults?.runtime?.refresh
  if (!history || !refresh) {
    return null
  }

  return <InternalVisualEditing {...upstream} portal history={history} refresh={refresh} />
}
