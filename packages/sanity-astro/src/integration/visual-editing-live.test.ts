import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {createClient} from '@sanity/client'
import {
  type Browser,
  chromium,
  type ConsoleMessage,
  type Frame,
  type Locator,
  type Page,
} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import {assertSanityAstroIsBuilt} from './built'
import {type DevServerHandle, startAstroDevServer} from './dev-server'
import {serveStandIn, type StandInServer} from './presentation-stand-in/serve'

declare global {
  interface Window {
    __marker?: number
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const sanity = createClient({
  projectId: '4j2qnyob',
  dataset: 'production',
  apiVersion: '2025-01-01',
  useCdn: false,
})

const STEGA_CHARACTERS = /[\u200B-\u200F\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/gu
const IGNORED_CONSOLE_ERRORS = ['Outdated Optimize Dep', 'React DevTools']

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

const relevantErrors = (errors: string[]) =>
  errors.filter((error) => !IGNORED_CONSOLE_ERRORS.some((ignored) => error.includes(ignored)))

const logLength = (page: Page) => page.evaluate(() => window.standIn.log.length)

const waitForMessage = (page: Page, type: string, since = 0) =>
  page.waitForFunction(
    ([wanted, from]) => window.standIn.log.slice(from).some((entry) => entry.type === wanted),
    [type, since] as const,
    {timeout: 30_000},
  )

/** Published ids the overlay asked the stand-in to fetch, i.e. the documents it found on the page. */
const observedDocumentIds = async (page: Page) => {
  const requested = await page.evaluate(() =>
    window.standIn.log
      .filter((entry) => entry.type === 'visual-editing/fetch-snapshot')
      .map((entry) => (entry.data as {documentId: string}).documentId),
  )
  return [...new Set(requested.filter((id) => !id.startsWith('drafts.')))].toSorted()
}

const placeMarker = (frame: Frame) => frame.evaluate(() => (window.__marker = Math.random()))
const readMarker = (frame: Frame) => frame.evaluate(() => window.__marker)

const stegaFree = async (locator: Locator) =>
  ((await locator.textContent()) ?? '').replace(STEGA_CHARACTERS, '')

async function sampleText(locator: Locator, durationMs: number): Promise<string[]> {
  const seen: string[] = []
  const until = Date.now() + durationMs
  while (Date.now() < until) {
    const text = await stegaFree(locator)
    if (seen[seen.length - 1] !== text) {
      seen.push(text)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return seen
}

describe.sequential('Visual Editing live preview in the React-free apps/minimal', () => {
  let devServer: DevServerHandle
  let standIn: StandInServer
  let browser: Browser
  let page: Page
  let frame: Frame
  let consoleErrors: string[]

  beforeAll(async () => {
    assertSanityAstroIsBuilt()
    devServer = await startAstroDevServer({
      appDirectory: 'apps/minimal',
      env: {PUBLIC_SANITY_VISUAL_EDITING_ENABLED: 'true', SANITY_API_READ_TOKEN: ''},
    })
    standIn = await serveStandIn()
    browser = await chromium.launch({headless: true})
    page = await browser.newPage({viewport: {width: 900, height: 420}})
    consoleErrors = trackConsoleErrors(page)
    await page.exposeFunction('fetchSnapshot', (documentId: string) =>
      sanity.getDocument(documentId),
    )
    await page.goto(standIn.pageUrl(`${devServer.baseUrl}/`))
    await page.waitForFunction(() => window.standIn?.status === 'connected', undefined, {
      timeout: 60_000,
    })
    frame = page.mainFrame().childFrames()[0]
  })

  afterAll(async () => {
    await browser?.close()
    await standIn?.stop()
    await devServer?.stop()
  })

  it('mounts the overlay without React', async () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, 'apps/minimal/package.json'), 'utf8'),
    ) as {dependencies?: Record<string, string>; devDependencies?: Record<string, string>}
    const declared = Object.keys({...manifest.dependencies, ...manifest.devDependencies})

    expect(declared, 'apps/minimal must not depend on React').not.toContain('react')
    expect(declared, 'apps/minimal must not use the React integration').not.toContain(
      '@astrojs/react',
    )
    expect(await frame.locator('sanity-visual-editing').count(), 'overlay host').toBe(1)
    expect(await frame.locator('astro-island').count(), 'hydrated islands').toBe(0)
    expect(relevantErrors(consoleErrors)).toEqual([])
  })

  it('connects to Presentation and observes every movie rendered on the page', async () => {
    expect(await page.evaluate(() => window.standIn.status)).toBe('connected')

    const movieIds = await sanity.fetch<string[]>('*[_type == "movie"]._id')
    expect(movieIds.length, 'the demo dataset has movies').toBeGreaterThan(0)

    await expect
      .poll(() => observedDocumentIds(page), {timeout: 30_000})
      .toEqual(movieIds.toSorted())
  })

  it('refreshes in place without navigating or losing the scroll position', async () => {
    const marker = await placeMarker(frame)
    await frame.evaluate(() => window.scrollTo(0, 300))
    const scrollY = await frame.evaluate(() => window.scrollY)
    expect(scrollY, 'the 900x420 viewport must make the movie list scroll').toBe(300)

    const since = await logLength(page)
    await page.evaluate(() => window.standIn.refresh())
    await waitForMessage(page, 'visual-editing/refreshed', since)

    expect(await readMarker(frame), 'window state survives the refresh').toBe(marker)
    expect(await frame.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1)
    expect(await frame.evaluate(() => window.scrollY)).toBe(scrollY)
    expect(await frame.locator('sanity-visual-editing').count(), 'overlay host').toBe(1)
  })

  it('patches stega text from the mutation stream and keeps it through the morph', async () => {
    const movie = await sanity.fetch<{_id: string; title: string}>(
      '*[_type == "movie"] | order(releaseDate desc)[0]{_id, title}',
    )
    const title = frame.locator('ol > li').first().locator('.title')
    expect(await stegaFree(title), 'the first row is the newest movie').toBe(movie.title)
    await expect.poll(() => observedDocumentIds(page), {timeout: 30_000}).toContain(movie._id)

    const marker = await placeMarker(frame)
    const nextTitle = `${movie.title} (live ${Date.now()})`
    await page.evaluate(([id, next]) => window.standIn.mutate(id, 'title', next), [
      movie._id,
      nextTitle,
    ] as const)

    await expect.poll(() => stegaFree(title), {timeout: 3_000, interval: 50}).toBe(nextTitle)
    // Literal text beside the expression puts the value mid-node, which the patcher has to
    // locate by its stega payload rather than by comparing the whole node.
    const prefixed = frame.locator('.newest')
    await expect
      .poll(() => stegaFree(prefixed), {timeout: 3_000, interval: 50})
      .toBe(`Newest release: ${nextTitle}`)
    expect(await readMarker(frame), 'the text patch must not navigate').toBe(marker)
    expect(
      await sampleText(title, 5_000),
      'the morph that follows must not revert the patched title',
    ).toEqual([nextTitle])
    expect(relevantErrors(consoleErrors)).toEqual([])
  })
})
