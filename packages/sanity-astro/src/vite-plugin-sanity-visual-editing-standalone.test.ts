import {describe, expect, it, vi} from 'vitest'

import {
  ENABLE_VISUAL_EDITING_SPECIFIER,
  isStandalonePackageModule,
  isVisualEditingClient,
  OPTIMISTIC_PACKAGE,
  shareOptimisticActorWithLiveText,
  STANDALONE_PACKAGE,
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
  const transform = (code: string, id: string) =>
    (plugin.transform as (code: string, id: string) => unknown)(code, id)
  const config = () => (plugin.config as () => unknown)()
  return {resolveId, load, resolve, transform, config}
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

  it('loads a module that imports the standalone styles and re-exports enableVisualEditing', () => {
    const {load} = setup()
    expect(load(VIRTUAL_STANDALONE_ID)).toBe(standaloneModuleSource)
    expect(standaloneModuleSource).toContain(
      "import '@sanity/visual-editing-standalone/styles.css'",
    )
    expect(standaloneModuleSource).toContain(
      "export {enableVisualEditing} from '@sanity/visual-editing-standalone'",
    )
    expect(load('/project/src/other.ts')).toBeNull()
  })

  it('resolves the standalone package from the project first', async () => {
    const {resolveId} = setup({
      '@sanity/visual-editing-standalone|/project/package.json': '/project/standalone.js',
    })
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    expect(await resolveId('@sanity/visual-editing-standalone', VIRTUAL_STANDALONE_ID)).toEqual({
      id: '/project/standalone.js',
    })
  })

  it('falls back to resolving the standalone package from the client', async () => {
    const {resolveId} = setup({
      [`@sanity/visual-editing-standalone/styles.css|${clientPath}`]: '/astro/styles.css',
    })
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    expect(
      await resolveId('@sanity/visual-editing-standalone/styles.css', VIRTUAL_STANDALONE_ID),
    ).toEqual({id: '/astro/styles.css'})
  })

  it('throws an install hint when the standalone package is missing', async () => {
    const {resolveId} = setup()
    await resolveId(ENABLE_VISUAL_EDITING_SPECIFIER, clientPath)
    await expect(
      resolveId('@sanity/visual-editing-standalone', VIRTUAL_STANDALONE_ID),
    ).rejects.toThrow('npm install @sanity/visual-editing-standalone')
  })

  it('excludes the standalone package from optimizeDeps so transform can run', () => {
    const {config} = setup()
    expect(config()).toEqual({
      optimizeDeps: {exclude: [STANDALONE_PACKAGE]},
    })
  })

  it('recognises published standalone package paths', () => {
    expect(
      isStandalonePackageModule(
        '/project/node_modules/@sanity/visual-editing-standalone/dist/renderVisualEditing.js',
      ),
    ).toBe(true)
    expect(
      isStandalonePackageModule(
        'C:\\project\\node_modules\\@sanity\\visual-editing-standalone\\dist\\chunk.js',
      ),
    ).toBe(true)
    expect(isStandalonePackageModule('/project/src/visual-editing/client.ts')).toBe(false)
  })
})

describe('shareOptimisticActorWithLiveText', () => {
  it('mirrors the minified setActor hand-off onto the shared optimistic actor', () => {
    const input =
      'fetch(`visual-editing/features`,void 0,{signal:r.signal,suppressWarnings:!0}).then(e=>{e.features.optimistic&&zi(n)}).catch(DH)'
    const next = shareOptimisticActorWithLiveText(input)
    expect(next).toContain(
      `import {setActor as __sanityAstroShareOptimisticActor} from '${OPTIMISTIC_PACKAGE}'`,
    )
    expect(next).toContain('e.features.optimistic&&(zi(n),__sanityAstroShareOptimisticActor(n))')
  })

  it('leaves unrelated modules alone', () => {
    expect(shareOptimisticActorWithLiveText('export const x = 1')).toBeNull()
    expect(shareOptimisticActorWithLiveText('features.optimistic')).toBeNull()
  })

  it('is idempotent when the shared call is already present', () => {
    const once = shareOptimisticActorWithLiveText('e.features.optimistic&&zi(n)')
    expect(once).not.toBeNull()
    expect(shareOptimisticActorWithLiveText(once!)).toBeNull()
  })

  it('transforms standalone package modules through the Vite plugin', () => {
    const {transform} = setup()
    const id = '/project/node_modules/@sanity/visual-editing-standalone/dist/renderVisualEditing.js'
    expect(transform('e.features.optimistic&&zi(n)', id)).toEqual({
      code: shareOptimisticActorWithLiveText('e.features.optimistic&&zi(n)'),
      map: null,
    })
    expect(transform('e.features.optimistic&&zi(n)', '/project/src/other.js')).toBeNull()
  })
})
