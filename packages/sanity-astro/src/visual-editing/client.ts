import {enableVisualEditing} from '@sanity/visual-editing/enable-visual-editing'

import {createBrowserHistoryAdapter} from './history.js'
import {type RefreshStrategy, resolveRefreshStrategy} from './refresh-strategy.js'
import {createRuntime} from './runtime.js'

/** Serializable options the `.astro` component hands to the browser through `data-config`. */
export interface VisualEditingConfig {
  zIndex?: number | string
  keepStegaOnCopy?: boolean
  /** Experimental: how the preview catches up with a change; see {@link RefreshStrategy}. */
  experimental_refreshStrategy?: RefreshStrategy
}

/**
 * Boots Visual Editing for a plain Astro page. Returns a function that tears everything down.
 */
export function start(host: Element): () => void {
  // Nothing but visual-editing.astro writes data-config, from a VisualEditingConfig it typed.
  const config = JSON.parse(host.getAttribute('data-config') ?? '{}') as VisualEditingConfig
  // Disposed in reverse, also when a later step throws, so a failed start leaves no patched
  // history methods or stream subscriptions behind for the retry to stack onto.
  const cleanups: Array<() => void> = []
  const stop = () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      cleanup()
    }
  }
  try {
    const history = createBrowserHistoryAdapter()
    cleanups.push(history.dispose)
    const runtime = createRuntime(resolveRefreshStrategy(config.experimental_refreshStrategy))
    cleanups.push(runtime.dispose)
    cleanups.push(
      enableVisualEditing({
        history,
        refresh: runtime.refresh,
        ...(config.zIndex !== undefined && {zIndex: config.zIndex}),
        ...(config.keepStegaOnCopy !== undefined && {keepStegaOnCopy: config.keepStegaOnCopy}),
      }),
    )
  } catch (error) {
    stop()
    throw error
  }
  return stop
}
