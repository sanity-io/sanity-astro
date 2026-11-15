import {mkdtempSync, rmSync} from 'node:fs'
import Module, {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
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
  ) =>
    | {
        optimizeDeps?: {include?: string[]}
        resolve?: {dedupe?: string[]; alias?: unknown[]}
      }
    | undefined
}

describe('vitePluginSanityModuleDedupe', () => {
  it('applies only during dev serve (#406)', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    expect(plugin.apply).toBe('serve')
    expect(plugin.enforce).toBe('pre')
  })

  it('pins the dedupe list (see module docblock for the membership rule and the @sanity/ui exclusion)', () => {
    expect(SANITY_MODULE_DEDUPE).toEqual(['react', 'react-dom', 'styled-components', 'sanity'])
  })

  it('dedupes react, styled-components, and sanity when installed (#406)', () => {
    const plugin = vitePluginSanityModuleDedupe() as PluginLike
    const projectRoot = process.cwd()
    const config = plugin.config?.({root: projectRoot}, {command: 'serve', mode: 'development'})
    const dedupe = resolveSanityModuleDedupe(projectRoot)

    expect(config?.resolve?.dedupe).toEqual(dedupe)
    expect(dedupe).toEqual(SANITY_MODULE_DEDUPE)
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
    expect(
      resolved.every((dependency) => SANITY_OPTIMIZE_DEPS_CANDIDATES.includes(dependency as never)),
    ).toBe(true)
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

  it('ignores packages only NODE_PATH reaches, as pnpm bin shims set it to the hoist directory', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'sanity-astro-dedupe-'))
    const previousNodePath = process.env.NODE_PATH
    // Node reads NODE_PATH once at startup; `_initPaths` re-reads it.
    const nodeModule = Module as unknown as {_initPaths: () => void}
    process.env.NODE_PATH = path.resolve(process.cwd(), 'node_modules')
    nodeModule._initPaths()
    try {
      expect(createRequire(path.join(projectRoot, 'package.json')).resolve('react')).toBeTruthy()

      expect(resolveSanityModuleDedupe(projectRoot)).toEqual([])
      expect(resolveSanityOptimizeDeps(projectRoot)).toEqual([])
      expect(buildSanityModuleAliases(projectRoot)).toEqual([])
    } finally {
      if (previousNodePath === undefined) {
        delete process.env.NODE_PATH
      } else {
        process.env.NODE_PATH = previousNodePath
      }
      nodeModule._initPaths()
      rmSync(projectRoot, {recursive: true, force: true})
    }
  })
})
