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
  enforce?: 'pre' | 'post'
  config?: (
    config: unknown,
    env: {command: string; mode: string},
  ) => {
    optimizeDeps?: {include?: string[]}
    resolve?: {dedupe?: string[]; alias?: unknown[]}
  } | undefined
}

describe('vitePluginSanityModuleDedupe', () => {
  it('dedupes react, styled-components, sanity, and @sanity/ui when installed (#406)', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const config = plugin.config?.({}, {command: 'serve', mode: 'development'})
    const dedupe = resolveSanityModuleDedupe(process.cwd())

    expect(config?.resolve?.dedupe).toEqual(dedupe)
    expect(dedupe.every((dependency) => SANITY_MODULE_DEDUPE.includes(dependency as never))).toBe(
      true,
    )
    expect(plugin.enforce).toBe('pre')
  })

  it('only pre-bundles dependencies that resolve in the consuming project', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const config = plugin.config?.({}, {command: 'serve', mode: 'development'})
    const resolved = resolveSanityOptimizeDeps(process.cwd())

    expect(config?.optimizeDeps?.include).toEqual(resolved)
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.every((dependency) => SANITY_OPTIMIZE_DEPS_CANDIDATES.includes(dependency as never))).toBe(
      true,
    )
  })

  it('aliases consuming-project module roots for sanity and styled-components', () => {
    const alias = buildSanityModuleAliases(process.cwd())

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
