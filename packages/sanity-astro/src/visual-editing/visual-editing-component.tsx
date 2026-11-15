import {
  type HistoryAdapter,
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import {createBrowserHistoryAdapter} from './history.js'
import {type RefreshStrategy, resolveRefreshStrategy} from './refresh-strategy.js'
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
export function VisualEditingComponent(props: VisualEditingComponentProps) {
  const {experimental_refreshStrategy, ...upstream} = props
  const strategy = resolveRefreshStrategy(experimental_refreshStrategy)
  const strategyType = strategy.type
  const followUpDelayMs = strategy.type === 'reload' ? strategy.followUpDelayMs : undefined
  const hasCustomHistory = upstream.history !== undefined
  const hasCustomRefresh = upstream.refresh !== undefined
  const [defaults, setDefaults] = React.useState<Defaults>()

  // Keyed on whether a custom handler exists, not on its identity: an inline `refresh` gets a
  // new identity every parent render and must not rebuild the defaults. The strategy is keyed on
  // its resolved values for the same reason, since an inline object is new every render too.
  React.useEffect(() => {
    const history = hasCustomHistory ? undefined : createBrowserHistoryAdapter()
    const runtime = hasCustomRefresh
      ? undefined
      : createRuntime(
          strategyType === 'in-place' ? {type: 'in-place'} : {type: 'reload', followUpDelayMs},
        )
    // Both install window listeners, so they cannot be built during render; one extra render
    // at mount is the price of keeping StrictMode's double-invoked initializers clean.
    // oxlint-disable-next-line react/set-state-in-effect
    setDefaults({history, runtime})
    return () => {
      runtime?.dispose()
      history?.dispose()
    }
  }, [hasCustomHistory, hasCustomRefresh, strategyType, followUpDelayMs])

  const history = upstream.history ?? defaults?.history
  const refresh = upstream.refresh ?? defaults?.runtime?.refresh
  if (!history || !refresh) {
    return null
  }

  return <InternalVisualEditing {...upstream} portal history={history} refresh={refresh} />
}
