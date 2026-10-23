import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {chromium, type ConsoleMessage} from 'playwright'
import {beforeAll, describe, expect, it} from 'vitest'

import {repoRoot, spawnAstro, startAstroDevServer} from './dev-server'

const appRoot = path.join(repoRoot, 'apps/example')

function runAstro(appDirectory: string, command: 'build'): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnAstro(appDirectory, [command])
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }
      reject(new Error(`astro ${command} exited with ${code}\n${output.slice(-4000)}`))
    })
  })
}

describe('astro build with @sanity/astro (apps/example, static output)', () => {
  let buildOutput = ''

  beforeAll(async () => {
    buildOutput = await runAstro('apps/example', 'build')
  })

  it('renders content fetched through sanity:client', async () => {
    const html = await readFile(path.join(appRoot, 'dist/index.html'), 'utf8')

    expect(buildOutput).toMatch(/\[build\] \d+ page\(s\) built/)
    expect(html).toMatch(/href="\/posts\/[^"]+"/)
  })

  it('prerenders the hash-router Studio route at studioBasePath', async () => {
    const html = await readFile(path.join(appRoot, 'dist/admin/index.html'), 'utf8')

    expect(html).toContain('<title>Sanity Studio</title>')
    expect(html).toContain('component-export="StudioComponentHash"')
  })

  // The prerendered /admin HTML can look right while the island fails to
  // hydrate (e.g. two `sanity` copies in the bundle throw "Duplicate
  // instances of context" and leave the page blank), so this drives the
  // built output in a real browser.
  it('hydrates the Studio island in the built /admin without duplicate sanity copies', async () => {
    const server = await startAstroDevServer({appDirectory: 'apps/example', command: 'preview'})
    const browser = await chromium.launch({headless: true})
    try {
      const page = await browser.newPage()
      const consoleErrors: string[] = []
      page.on('console', (message: ConsoleMessage) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('pageerror', (error) => consoleErrors.push(error.message))

      await page.goto(`${server.baseUrl}/admin`, {waitUntil: 'networkidle'})
      // The Studio shell replaces the island's prerendered children once it
      // mounts; an auth screen, workspace picker, or loading UI all count.
      await page.waitForFunction(
        () => {
          const island = document.querySelector('astro-island')
          return island !== null && island.childElementCount > 0
        },
        undefined,
        {timeout: 30_000},
      )

      const duplicateContextErrors = consoleErrors.filter((text) =>
        text.includes('Duplicate instances of context'),
      )
      expect(duplicateContextErrors).toEqual([])
    } finally {
      await browser.close()
      await server.stop()
    }
  })
})
