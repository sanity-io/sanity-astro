import {
  VisualEditing as InternalVisualEditing,
  type SuspiciousStegaReport,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import React from 'react'

import type {RefreshStrategy} from './refresh'
import {createRuntime, type Runtime} from './runtime'

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

  React.useEffect(() => {
    const next = createRuntime(strategy)
    setRuntime(next)
    return () => next.dispose()
  }, [strategy])

  if (!runtime) {
    return null
  }

  return (
    <InternalVisualEditing
      portal
      history={props.history ?? runtime.history}
      zIndex={props.zIndex}
      refresh={props.refresh ?? runtime.refresh}
      keepStegaOnCopy={props.keepStegaOnCopy}
      onSuspiciousStega={props.onSuspiciousStega}
    />
  )
}
