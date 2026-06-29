import path from 'node:path'
import {describe, expect, it} from 'vitest'
import {
  buildSanityModuleAliases,
  resolveSanityModuleDedupe,
  resolveSanityOptimizeDeps,
  SANITY_MODULE_DEDUPE,
  SANITY_OPTIMIZE_DEPS_CANDIDATES,
  vitePluginSanityModuleDedupe,
} from './vite-plugin-sanity-module-dedupe'

type PluginLike = {
  apply?: string
  enforce?: 'pre' | 'post'
  config?: (
    config: {root?: string},
    env: {command: string; mode: string},
  ) => {
    optimizeDeps?: {include?: string[]}
    resolve?: {dedupe?: string[]; alias?: unknown[]}
  } | undefined
}

describe('vitePluginSanityModuleDedupe', () => {
  it('applies only during dev serve (#406)', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    expect(plugin.apply).toBe('serve')
    expect(plugin.enforce).toBe('pre')
  })

  it('dedupes react, styled-components, sanity, and @sanity/ui when installed (#406)', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const projectRoot = process.cwd()
    const config = plugin.config?.({root: projectRoot}, {command: 'serve', mode: 'development'})
    const dedupe = resolveSanityModuleDedupe(projectRoot)

    expect(config?.resolve?.dedupe).toEqual(dedupe)
    expect(dedupe.every((dependency) => SANITY_MODULE_DEDUPE.includes(dependency as never))).toBe(
      true,
    )
  })

  it('resolves dependencies from config.root instead of process.cwd()', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const projectRoot = path.resolve(process.cwd(), 'packages/sanity-astro')
    const config = plugin.config?.({root: projectRoot}, {command: 'serve', mode: 'development'})

    expect(config?.resolve?.dedupe).toEqual(resolveSanityModuleDedupe(projectRoot))
    expect(config?.optimizeDeps?.include).toEqual(resolveSanityOptimizeDeps(projectRoot))
  })

  it('only pre-bundles dependencies that resolve in the consuming project', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const projectRoot = process.cwd()
    const config = plugin.config?.({root: projectRoot}, {command: 'serve', mode: 'development'})
    const resolved = resolveSanityOptimizeDeps(projectRoot)

    expect(config?.optimizeDeps?.include).toEqual(resolved)
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.every((dependency) => SANITY_OPTIMIZE_DEPS_CANDIDATES.includes(dependency as never))).toBe(
      true,
    )
  })

  it('aliases consuming-project module roots for sanity and styled-components', () => {
    const projectRoot = process.cwd()
    const alias = buildSanityModuleAliases(projectRoot)

    expect(alias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({find: /^sanity$/}),
        expect.objectContaining({find: /^styled-components$/}),
      ]),
    )

    for (const entry of alias) {
      expect(path.isAbsolute(entry.replacement)).toBe(true)
    }
  })
})
