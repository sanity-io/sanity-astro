import {
  VisualEditing as InternalVisualEditing,
  type SuspiciousStegaReport,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import type {RefreshStrategy} from './refresh.js'
import {createRuntime, type Runtime} from './runtime.js'

export type {SuspiciousStegaReport}

export type VisualEditingOptions = Pick<
  InternalVisualEditingOptions,
  'zIndex' | 'refresh' | 'history' | 'keepStegaOnCopy' | 'onSuspiciousStega'
> & {
  /** Used when no `refresh` function is given. Defaults to `morph`. */
  refreshStrategy?: RefreshStrategy
}

/**
 * React island wrapper around the same browser runtime the `.astro` component uses. Reach for
 * it only when you need a custom `refresh` or `history` function; plain `.astro` pages should
 * render `VisualEditing` from `@sanity/astro/visual-editing` and skip React entirely.
 *
 * @deprecated Prefer `VisualEditing` from `@sanity/astro/visual-editing`. This export stays
 * until the next major release.
 */
export function VisualEditingComponent(props: VisualEditingOptions) {
  const strategy = props.refreshStrategy ?? 'morph'
  const [runtime, setRuntime] = React.useState<Runtime>()

  // Custom `refresh` and `history` are usually written inline, so their identity changes on
  // every parent render. The runtime reads the latest ones through a ref and is only rebuilt
  // when their presence changes, so a re-render does not tear down the connection.
  const latest = React.useRef(props)
  React.useEffect(() => {
    latest.current = props
  })
  const hasCustomHistory = props.history !== undefined
  const hasCustomRefresh = props.refresh !== undefined

  React.useEffect(() => {
    const next = createRuntime({
      strategy,
      history: hasCustomHistory
        ? {
            subscribe: (navigate) => latest.current.history!.subscribe(navigate),
            update: (update) => latest.current.history!.update(update),
          }
        : undefined,
      refresh: hasCustomRefresh ? (payload) => latest.current.refresh!(payload) : undefined,
    })
    // The runtime installs window listeners, so it cannot be built during render; one extra
    // render at mount is the price of keeping StrictMode's double-invoked initializers clean.
    // oxlint-disable-next-line react/set-state-in-effect
    setRuntime(next)
    return () => next.dispose()
  }, [strategy, hasCustomHistory, hasCustomRefresh])

  if (!runtime) {
    return null
  }

  return (
    <InternalVisualEditing
      portal
      history={runtime.history}
      zIndex={props.zIndex}
      refresh={runtime.refresh}
      keepStegaOnCopy={props.keepStegaOnCopy}
      onSuspiciousStega={props.onSuspiciousStega}
    />
  )
}
