import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Runs an app's own `astro sync` so `.astro/` reflects that app's integration options. */
function astroSync(appDirectory: string): Promise<string> {
  const appRoot = path.resolve(repoRoot, appDirectory)
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(appRoot, 'node_modules', '.bin', 'astro'), ['sync'], {
      cwd: appRoot,
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
      reject(new Error(`astro sync exited with ${code}\n${output.slice(-4000)}`))
    })
  })
}

describe('injectTypes through astro sync', () => {
  it('leaves .astro/ alone while injectTypes is off (the default, apps/example)', async () => {
    await astroSync('apps/example')
    const astroTypes = await readFile(path.join(repoRoot, 'apps/example/.astro/types.d.ts'), 'utf8')

    expect(astroTypes).not.toContain('_sanity_astro')
  })

  it('registers the virtual module declarations when opted in (apps/minimal)', async () => {
    await astroSync('apps/minimal')
    const appRoot = path.join(repoRoot, 'apps/minimal')
    const injected = await readFile(
      path.join(appRoot, '.astro/integrations/_sanity_astro/types.d.ts'),
      'utf8',
    )
    const astroTypes = await readFile(path.join(appRoot, '.astro/types.d.ts'), 'utf8')

    expect(injected).toContain('/// <reference types="@sanity/astro/module" />')
    expect(astroTypes).toContain('integrations/_sanity_astro/types.d.ts')
  })
})
