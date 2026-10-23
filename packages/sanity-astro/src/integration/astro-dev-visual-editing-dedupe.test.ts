import {existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {chromium, type ConsoleMessage, type Page} from 'playwright'
import {beforeAll, describe, expect, it} from 'vitest'

import {startAstroDevServer} from './dev-server'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function assertSanityAstroIsBuilt() {
  const distEntry = path.join(packageRoot, 'dist/index.mjs')
  if (!existsSync(distEntry)) {
    throw new Error(
      'Missing @sanity/astro build output. Run `pnpm --filter @sanity/astro build` before integration tests.',
    )
  }
}

function trackConsoleErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  return errors
}

// The esbuild pre-bundle failure and the browser-side fallout look like this (#462):
// `Missing "./menu" | "./popover" | "./tooltip" | "./styles.css" specifier in "@sanity/ui"
// package`, followed by `X is not exported by "@sanity/ui"` once the browser falls back to
// whatever the pre-bundle produced. Distinct from #406's duplicate-React-instance class
// (see duplicate-module-errors.ts), which this bug does not trigger.
function collectSanityUiSubpathErrors(consoleErrors: string[]) {
  return consoleErrors.filter(
    (message) =>
      message.includes('specifier in "@sanity/ui"') || message.includes('is not exported'),
  )
}

describe('astro dev <VisualEditing /> + @sanity/ui subpath regression (#462)', () => {
  beforeAll(() => {
    assertSanityAstroIsBuilt()
  })

  // apps/example keeps `@sanity/ui` as a devDependency (unused by its source) purely so
  // this fixture reproduces the bug under pnpm's workspace isolation: without a direct
  // dependency, `@sanity/ui` is unresolvable from this app at all, so the plugin's own
  // `canResolveDependency` guard would filter it out of `resolve.dedupe` regardless of
  // what SANITY_MODULE_DEDUPE contains, masking the bug this test exists to catch. A
  // typical consumer project installing with npm/yarn hoisting (or pnpm without strict
  // isolation) hits this bug without needing any such declaration -- #411 only needed
  // one here because this repo uses pnpm's strict mode.

  it('apps/example hydrates the visual-editing overlay without @sanity/ui subpath errors', async () => {
    const devServer = await startAstroDevServer({
      appDirectory: 'apps/example',
      env: {PUBLIC_SANITY_VISUAL_EDITING_ENABLED: 'true'},
    })
    const browser = await chromium.launch({headless: true})
    const page = await browser.newPage()

    try {
      // `VisualEditingComponent` renders through a React portal, so its own
      // `astro-island` stays `:empty` even on success -- the portal target
      // (`<sanity-visual-editing>`) is the real success signal, not the island.
      //
      // A cold optimizer cache lazily discovers `@sanity/visual-editing/react` and
      // `@sanity/client` on first load. Vite re-optimizes and tells the page to reload
      // itself over its HMR socket, and the pre-reload load can log a transient
      // `Invalid hook call` from two React chunks straddling that reload -- ordinary
      // Vite cold-start behavior, not this bug. Relying on that self-triggered reload
      // is flaky under CI-level resource contention, so force a second navigation
      // ourselves once the optimizer has had time to settle, then track errors only
      // from that point on.
      await page.goto(`${devServer.baseUrl}/`, {waitUntil: 'domcontentloaded'})
      await page.waitForTimeout(15_000)

      const consoleErrors = trackConsoleErrors(page)
      await page.goto(`${devServer.baseUrl}/`, {waitUntil: 'domcontentloaded'})
      await page.locator('sanity-visual-editing').waitFor({state: 'attached', timeout: 60_000})

      expect(collectSanityUiSubpathErrors(consoleErrors)).toEqual([])
    } finally {
      await page.close()
      await browser.close()
      await devServer.stop()
    }
  })
})
