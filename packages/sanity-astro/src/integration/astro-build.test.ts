import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {beforeAll, describe, expect, it} from 'vitest'

import {repoRoot, spawnAstro} from './dev-server'

const appRoot = path.join(repoRoot, 'apps/example')
const optedInAppRoot = path.join(repoRoot, 'apps/minimal')

function runAstro(appDirectory: string, command: 'build' | 'sync'): Promise<string> {
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

  it('leaves .astro/ types alone while injectTypes is off (the default)', async () => {
    const astroTypes = await readFile(path.join(appRoot, '.astro/types.d.ts'), 'utf8')

    expect(astroTypes).not.toContain('_sanity_astro')
  })
})

describe('astro sync with injectTypes: true (apps/minimal)', () => {
  beforeAll(async () => {
    await runAstro('apps/minimal', 'sync')
  })

  it('injects the virtual module types into .astro/', async () => {
    const injected = await readFile(
      path.join(optedInAppRoot, '.astro/integrations/_sanity_astro/types.d.ts'),
      'utf8',
    )
    const astroTypes = await readFile(path.join(optedInAppRoot, '.astro/types.d.ts'), 'utf8')

    expect(injected).toContain('/// <reference types="@sanity/astro/module" />')
    expect(astroTypes).toContain('integrations/_sanity_astro/types.d.ts')
  })
})
