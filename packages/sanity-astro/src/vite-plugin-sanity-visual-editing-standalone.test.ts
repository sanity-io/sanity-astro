import path from 'node:path'

import {describe, expect, it, vi} from 'vitest'

import {
  ENABLE_VISUAL_EDITING_SPECIFIER,
  isVisualEditingClient,
  STANDALONE_STYLES_PERSIST_ID,
  standaloneModuleSource,
  VIRTUAL_STANDALONE_ID,
  vitePluginSanityVisualEditingStandalone,
} from './vite-plugin-sanity-visual-editing-standalone'

const clientPath = '/project/node_modules/@sanity/astro/dist/visual-editing/client.ts'

function setup(resolved: Record<string, string | null> = {}) {
  const plugin = vitePluginSanityVisualEditingStandalone()
  const resolve = vi.fn(async (id: string, importer: string) => {
    const key = `${id}|${importer}`
    return key in resolved && resolved[key] ? {id: resolved[key]} : null
  })
  ;(plugin.configResolved as (config: {root: string}) => void)({root: '/project'})
  const resolveId = (id: string, importer?: string) =>
    (plugin.resolveId as (this: unknown, id: string, importer?: string) => unknown).call(
      {resolve},
      id,
      importer,
    )
  const load = (id: string) => (plugin.load as (id: string) => unknown)(id)
  return {resolveId, load, resolve}
}

describe('vitePluginSanityVisualEditingStandalone', () => {
  it('recognises the visual editing client as importer', () => {
    expect(isVisualEditingClient(clientPath)).toBe(true)
    expect(isVisualEditingClient('C:\\project\\dist\\visual-editing\\client.js')).toBe(true)
    expect(isVisualEditingClient(`${clientPath}?v=123`)).toBe(true)
    expect(isVisualEditingClient('/project/src/client.ts')).toBe(false)
    expect(isVisualEditingClient(undefined)).toBe(false)
  })

  it('redirects the client import of enableVisualEditing to the standalone module', async () => {
    const {resolveId} = setup()
    expect(await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)).toBe(VIRTUAL_STANDALONE_ID)
  })

  it('leaves other importers of @sanity/visual-editing alone', async () => {
    const {resolveId} = setup()
    expect(await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, '/project/src/page.ts')).toBeNull()
    expect(await resolveId('@sanity/visual-editing/react', clientPath)).toBeNull()
  })

  it('loads a module that injects the standalone styles with a morph-persist attribute', () => {
    const {load} = setup()
    expect(load(VIRTUAL_STANDALONE_ID)).toBe(standaloneModuleSource)
    expect(standaloneModuleSource).toContain(
      "import href from '@sanity/visual-editing-standalone/styles.css?url'",
    )
    expect(standaloneModuleSource).toContain(
      `link.setAttribute('data-astro-transition-persist', '${STANDALONE_STYLES_PERSIST_ID}')`,
    )
    expect(standaloneModuleSource).toContain(
      "export {enableVisualEditing} from '@sanity/visual-editing-standalone'",
    )
    expect(load('/project/src/other.ts')).toBeNull()
  })

  it('resolves the standalone package from the project first', async () => {
    const {resolveId} = setup({
      [`@sanity/visual-editing-standalone|${path.join('/project', 'package.json')}`]:
        '/project/standalone.js',
    })
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    expect(await resolveId('@sanity/visual-editing-standalone', VIRTUAL_STANDALONE_ID)).toEqual({
      id: '/project/standalone.js',
    })
  })

  it('falls back to resolving the standalone package from the client', async () => {
    const {resolveId} = setup({
      [`@sanity/visual-editing-standalone/styles.css?url|${clientPath}`]: '/astro/styles.css?url',
    })
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    expect(
      await resolveId('@sanity/visual-editing-standalone/styles.css?url', VIRTUAL_STANDALONE_ID),
    ).toEqual({id: '/astro/styles.css?url'})
  })

  it('throws an install hint when the standalone package is missing', async () => {
    const {resolveId} = setup()
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    await expect(
      resolveId('@sanity/visual-editing-standalone', VIRTUAL_STANDALONE_ID),
    ).rejects.toThrow('npm install @sanity/visual-editing-standalone')
  })
})
