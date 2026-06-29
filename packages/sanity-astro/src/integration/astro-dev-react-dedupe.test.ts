import {existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type ConsoleMessage, type Page} from 'playwright'
import {beforeAll, describe, expect, it} from 'vitest'
import {startAstroDevServer} from './dev-server'
import {collectDuplicateModuleErrors} from './duplicate-module-errors'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

type Fixture = {
  appDirectory: string
  studioPath: string
  hasReactIsland: boolean
  loadStudio?: boolean
}

const fixtures: Fixture[] = [
  {
    appDirectory: 'apps/example',
    studioPath: '/admin',
    hasReactIsland: true,
    loadStudio: false,
  },
  {
    appDirectory: 'apps/example-ssr',
    studioPath: '/admin',
    hasReactIsland: true,
  },
  {
    appDirectory: 'apps/example-latest',
    studioPath: '/admin',
    hasReactIsland: true,
    loadStudio: false,
  },
  {
    appDirectory: 'apps/movies',
    studioPath: '/admin',
    hasReactIsland: false,
    loadStudio: false,
  },
]

function assertSanityAstroIsBuilt() {
  const distEntry = path.join(packageRoot, 'dist/sanity-astro.mjs')
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

function assertNoDuplicateModuleErrors(consoleErrors: string[]) {
  expect(collectDuplicateModuleErrors(consoleErrors)).toEqual([])
}

async function assertReactHydration({
  page,
  baseUrl,
  studioPath,
  hasReactIsland,
  loadStudio = true,
  consoleErrors,
}: {
  page: Page
  baseUrl: string
  studioPath: string
  hasReactIsland: boolean
  loadStudio?: boolean
  consoleErrors: string[]
}) {
  if (hasReactIsland) {
    await page.goto(`${baseUrl}/`, {waitUntil: 'domcontentloaded'})
    await page.locator('marquee').waitFor({state: 'visible', timeout: 60_000})
    expect(await page.locator('astro-island:empty').count()).toBe(0)
  }

  if (!loadStudio) {
    if (!hasReactIsland) {
      await page.goto(`${baseUrl}/`, {waitUntil: 'domcontentloaded'})
    }
    assertNoDuplicateModuleErrors(consoleErrors)
    return
  }

  await page.goto(`${baseUrl}${studioPath}`, {waitUntil: 'domcontentloaded'})
  await page
    .locator('[data-ui="AstroStudioLayout"]')
    .waitFor({state: 'attached', timeout: 120_000})

  expect(await page.locator('astro-island:empty').count()).toBe(0)
  assertNoDuplicateModuleErrors(consoleErrors)
}

describe.sequential('astro dev duplicate React regression (#406)', () => {
  beforeAll(() => {
    assertSanityAstroIsBuilt()
  })

  it.each(fixtures)(
    '$appDirectory hydrates react islands and embedded studio without duplicate module errors',
    async (fixture) => {
      const devServer = await startAstroDevServer({appDirectory: fixture.appDirectory})
      const browser = await chromium.launch({headless: true})
      const page = await browser.newPage()
      const consoleErrors = trackConsoleErrors(page)

      try {
        await assertReactHydration({
          page,
          baseUrl: devServer.baseUrl,
          studioPath: fixture.studioPath,
          hasReactIsland: fixture.hasReactIsland,
          loadStudio: fixture.loadStudio,
          consoleErrors,
        })
      } finally {
        await page.close()
        await browser.close()
        await devServer.stop()
      }
    },
  )

  it('reproduces duplicate module errors when module dedupe is disabled (negative control)', async () => {
    const devServer = await startAstroDevServer({
      appDirectory: 'apps/example',
      disableModuleDedupe: true,
    })
    const browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    const consoleErrors = trackConsoleErrors(page)

    try {
      await page.goto(`${devServer.baseUrl}/`, {waitUntil: 'domcontentloaded'})
      await page.locator('marquee').waitFor({state: 'visible', timeout: 60_000})
      await page.goto(`${devServer.baseUrl}/admin`, {waitUntil: 'domcontentloaded'})

      const duplicateModuleErrors = collectDuplicateModuleErrors(consoleErrors)
      const emptyIslands = await page.locator('astro-island:empty').count()

      expect(duplicateModuleErrors.length + emptyIslands).toBeGreaterThan(0)
    } finally {
      await page.close()
      await browser.close()
      await devServer.stop()
    }
  })
})
