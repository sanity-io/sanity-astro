import {existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type ConsoleMessage, type Page} from 'playwright'
import {beforeAll, describe, expect, it} from 'vitest'
import {startAstroDevServer} from './dev-server'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

type Fixture = {
  appDirectory: string
  studioPath: string
  hasReactIsland: boolean
}

const fixtures: Fixture[] = [
  {
    appDirectory: 'apps/example',
    studioPath: '/admin',
    hasReactIsland: true,
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
  },
  {
    appDirectory: 'apps/movies',
    studioPath: '/admin',
    hasReactIsland: false,
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
  const duplicateModuleErrors = consoleErrors.filter(
    (message) =>
      message.includes('Invalid hook call') ||
      message.includes("several instances of 'styled-components'") ||
      message.includes("reading 'v2'") ||
      message.includes('Duplicate instances of context'),
  )

  expect(duplicateModuleErrors).toEqual([])
}

async function assertReactHydration({
  page,
  baseUrl,
  studioPath,
  hasReactIsland,
  consoleErrors,
}: {
  page: Page
  baseUrl: string
  studioPath: string
  hasReactIsland: boolean
  consoleErrors: string[]
}) {
  if (hasReactIsland) {
    await page.goto(`${baseUrl}/`, {waitUntil: 'domcontentloaded'})
    await page.locator('marquee').waitFor({state: 'visible', timeout: 60_000})
    expect(await page.locator('astro-island:empty').count()).toBe(0)
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
          consoleErrors,
        })
      } finally {
        await page.close()
        await browser.close()
        await devServer.stop()
      }
    },
  )
})
