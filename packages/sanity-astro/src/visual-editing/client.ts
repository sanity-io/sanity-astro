import {enableVisualEditing} from '@sanity/visual-editing/enable-visual-editing'

import {createBrowserHistoryAdapter} from './history.js'
import {createRuntime} from './runtime.js'

/** Serializable options the `.astro` component hands to the browser through `data-config`. */
export interface VisualEditingConfig {
  zIndex?: number | string
  keepStegaOnCopy?: boolean
  /**
   * Opts into the experimental in-place refresh: stega text updates the moment a change
   * arrives and the page morphs instead of reloading. Off by default; the page then reloads on
   * every refresh, as it always has.
   */
  experimental_inPlaceRefresh?: boolean
}

/**
 * Boots Visual Editing for a plain Astro page. Returns a function that tears everything down.
 */
export function start(host: Element): () => void {
  // Nothing but visual-editing.astro writes data-config, from a VisualEditingConfig it typed.
  const config = JSON.parse(host.getAttribute('data-config') ?? '{}') as VisualEditingConfig
  const history = createBrowserHistoryAdapter()
  const runtime = createRuntime({inPlaceRefresh: config.experimental_inPlaceRefresh === true})
  const disable = enableVisualEditing({
    history,
    refresh: runtime.refresh,
    ...(config.zIndex !== undefined && {zIndex: config.zIndex}),
    ...(config.keepStegaOnCopy !== undefined && {keepStegaOnCopy: config.keepStegaOnCopy}),
  })
  return () => {
    disable()
    runtime.dispose()
    history.dispose()
  }
}
