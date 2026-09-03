import {spawn} from 'node:child_process'
import {readFile, rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {beforeAll, describe, expect, it} from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const appRoot = path.join(repoRoot, 'apps/example')

function runAstroBuild(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(cwd, 'node_modules/.bin/astro'), ['build'], {
      cwd,
      env: {...process.env, CI: 'true', NO_COLOR: '1'},
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }
      reject(new Error(`astro build exited with ${code}\n${output.slice(-4000)}`))
    })
  })
}

describe('astro build with @sanity/astro (apps/example, static output)', () => {
  let buildOutput = ''

  beforeAll(async () => {
    await rm(path.join(appRoot, 'dist'), {recursive: true, force: true})
    await rm(path.join(appRoot, '.astro'), {recursive: true, force: true})
    buildOutput = await runAstroBuild(appRoot)
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

  it('injects the virtual module types into .astro/', async () => {
    const injected = await readFile(
      path.join(appRoot, '.astro/integrations/_sanity_astro/types.d.ts'),
      'utf8',
    )
    const astroTypes = await readFile(path.join(appRoot, '.astro/types.d.ts'), 'utf8')

    expect(injected).toContain('/// <reference types="@sanity/astro/module" />')
    expect(astroTypes).toContain('integrations/_sanity_astro/types.d.ts')
  })
})
