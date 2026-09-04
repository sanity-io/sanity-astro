import {enableVisualEditing} from '@sanity/visual-editing/enable-visual-editing'

import type {RefreshStrategy} from './refresh.js'
import {createRuntime} from './runtime.js'

/** Serializable options the `.astro` component hands to the browser through `data-config`. */
export interface VisualEditingConfig {
  zIndex?: number | string
  keepStegaOnCopy?: boolean
  refresh?: RefreshStrategy
}

const REFRESH_STRATEGIES: ReadonlySet<RefreshStrategy> = new Set(['morph', 'reload'])

export function parseConfig(raw: string | null): VisualEditingConfig {
  if (!raw) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }
  const {zIndex, keepStegaOnCopy, refresh} = parsed as Record<string, unknown>
  return {
    zIndex: typeof zIndex === 'number' || typeof zIndex === 'string' ? zIndex : undefined,
    keepStegaOnCopy: typeof keepStegaOnCopy === 'boolean' ? keepStegaOnCopy : undefined,
    refresh: REFRESH_STRATEGIES.has(refresh as RefreshStrategy)
      ? (refresh as RefreshStrategy)
      : undefined,
  }
}

/**
 * Boots Visual Editing for a plain Astro page. Returns a function that tears everything down.
 */
export function start(host: Element): () => void {
  const config = parseConfig(host.getAttribute('data-config'))
  const runtime = createRuntime(config.refresh ?? 'morph')
  const disable = enableVisualEditing({
    history: runtime.history,
    refresh: runtime.refresh,
    zIndex: config.zIndex,
    keepStegaOnCopy: config.keepStegaOnCopy,
  })
  return () => {
    disable()
    runtime.dispose()
  }
}
