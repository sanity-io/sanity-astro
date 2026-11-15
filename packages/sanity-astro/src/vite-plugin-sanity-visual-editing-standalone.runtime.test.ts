// @vitest-environment jsdom
import {describe, expect, it, vi} from 'vitest'

import {
  STANDALONE_PACKAGE,
  STANDALONE_STYLE_PERSIST_ID,
  standaloneModuleSource,
} from './vite-plugin-sanity-visual-editing-standalone'

/**
 * Executes the generated virtual module for real, with its two bare imports (the standalone
 * package's CSS and its `enableVisualEditing`) swapped for inline `data:` modules. This is what
 * actually regresses when the stylesheet insertion moves back to top-level module code: these
 * tests exercise the module's behaviour across repeated `enableVisualEditing` calls, which a
 * substring assertion on `standaloneModuleSource` cannot.
 */
async function loadStandaloneModule(enableVisualEditingStub: (...args: unknown[]) => unknown) {
  // Generated source wraps these specifiers in single quotes, and `encodeURIComponent` leaves
  // `'` unescaped, so these two stub modules must not contain one themselves or it would close
  // that outer quote early.
  const cssModuleUrl = `data:text/javascript,${encodeURIComponent(
    `export default ".sanity-visual-editing-standalone { all: initial }"`,
  )}`
  const packageModuleUrl = `data:text/javascript,${encodeURIComponent(
    `export function enableVisualEditing(...args) { return globalThis.__standaloneEnableVisualEditingStub(...args) }`,
  )}`
  // Bridges the stub into the inline `data:` module above, which cannot close over test scope.
  ;(globalThis as Record<string, unknown>).__standaloneEnableVisualEditingStub =
    enableVisualEditingStub
  const source = standaloneModuleSource
    .replace(`${STANDALONE_PACKAGE}/styles.css?inline`, cssModuleUrl)
    .replace(`'${STANDALONE_PACKAGE}'`, `'${packageModuleUrl}'`)
  return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`)
}

function persistedStyle() {
  return document.head.querySelector(
    `style[data-astro-transition-persist="${STANDALONE_STYLE_PERSIST_ID}"]`,
  )
}

describe('standalone module stylesheet persistence', () => {
  it('inserts the tagged stylesheet the first time enableVisualEditing runs', async () => {
    const stub = vi.fn(() => () => {})
    const {enableVisualEditing} = await loadStandaloneModule(stub)

    expect(persistedStyle()).toBeNull()
    enableVisualEditing({})
    expect(persistedStyle()).not.toBeNull()
    expect(persistedStyle()?.textContent).toContain('sanity-visual-editing-standalone')
  })

  it('re-inserts the stylesheet on a later call once ClientRouter has dropped it', async () => {
    const stub = vi.fn(() => () => {})
    const {enableVisualEditing} = await loadStandaloneModule(stub)

    enableVisualEditing({})
    expect(persistedStyle()).not.toBeNull()

    // Simulates Astro's <ClientRouter /> swapping the head: the incoming page's markup has no
    // matching data-astro-transition-persist node, so the old one is dropped rather than kept.
    persistedStyle()?.remove()
    expect(persistedStyle()).toBeNull()

    // `bootstrap.ts` restarts overlays from `astro:page-load` by calling `enableVisualEditing`
    // again, without re-evaluating this module's top-level code.
    enableVisualEditing({})
    expect(persistedStyle()).not.toBeNull()
  })

  it('does not insert a second stylesheet when one is already present', async () => {
    const stub = vi.fn(() => () => {})
    const {enableVisualEditing} = await loadStandaloneModule(stub)

    enableVisualEditing({})
    enableVisualEditing({})
    expect(document.head.querySelectorAll('style').length).toBe(1)
  })

  it('still forwards arguments to and returns the result of the real enableVisualEditing', async () => {
    const stop = () => {}
    const stub = vi.fn(() => stop)
    const {enableVisualEditing} = await loadStandaloneModule(stub)

    const options = {history: {}, refresh: () => {}}
    const result = enableVisualEditing(options)

    expect(stub).toHaveBeenCalledWith(options)
    expect(result).toBe(stop)
  })
})
