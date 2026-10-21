/** The element `visual-editing.astro` renders when Visual Editing is enabled. */
export const HOST_TAG = 'sanity-astro-visual-editing'

type ClientModule = {start: (host: Element) => () => void}

export interface BootstrapOptions {
  /** Loads the client lazily, so a page with Visual Editing off never fetches the overlays. */
  load?: () => Promise<ClientModule>
  document?: Document
}

/**
 * Starts Visual Editing on the page's host element and keeps it alive across Astro's
 * `<ClientRouter />`, which swaps the body without re-running this module: the client is
 * rebound on every `astro:page-load` and torn down before each `astro:before-swap`.
 */
export function install(options: BootstrapOptions = {}): () => void {
  const {load = () => import('./client.js'), document: doc = document} = options
  let host: Element | null = null
  let stop: (() => void) | undefined
  // Bumped whenever the host changes, so a load that finishes for a stale host does nothing.
  let generation = 0

  const teardown = () => {
    stop?.()
    stop = undefined
    host = null
    generation++
  }

  const boot = async () => {
    const next = doc.querySelector(HOST_TAG)
    if (next === host) {
      return
    }
    teardown()
    if (!next) {
      return
    }
    host = next
    const mine = generation
    try {
      const {start} = await load()
      if (generation === mine) {
        stop = start(next)
      }
    } catch (error) {
      console.error('[@sanity/astro] Failed to start Visual Editing', error)
    }
  }

  const onPageLoad = () => void boot()
  doc.addEventListener('astro:page-load', onPageLoad)
  doc.addEventListener('astro:before-swap', teardown)
  void boot()

  return () => {
    doc.removeEventListener('astro:page-load', onPageLoad)
    doc.removeEventListener('astro:before-swap', teardown)
    teardown()
  }
}
