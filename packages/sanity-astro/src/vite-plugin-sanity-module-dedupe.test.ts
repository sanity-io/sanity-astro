import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire, Module} from 'node:module'
import os from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  buildSanityModuleAliases,
  resolveSanityModuleDedupe,
  resolveSanityOptimizeDeps,
  SANITY_MODULE_DEDUPE,
  SANITY_OPTIMIZE_DEPS_CANDIDATES,
  vitePluginSanityModuleDedupe,
} from './vite-plugin-sanity-module-dedupe'

// Node's internal `Module._initPaths` recomputes `Module.globalPaths` from
// `process.env.NODE_PATH`. It's undocumented, but it's the only way to make a
// mid-test `NODE_PATH` mutation observable to `require.resolve` within the same
// process, which is what this suite needs to reproduce pnpm's bin-shim behavior.
const reinitModulePaths = () => (Module as unknown as {_initPaths: () => void})._initPaths()

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
})

describe('resolveSanityOptimizeDeps under a pnpm-style NODE_PATH leak', () => {
  const originalNodePath = process.env.NODE_PATH
  let tmpDir: string | undefined

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, {recursive: true, force: true})
      tmpDir = undefined
    }
    process.env.NODE_PATH = originalNodePath
    reinitModulePaths()
  })

  it('does not report a dependency as resolvable when it is only reachable via NODE_PATH (#449 regression)', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sanity-astro-nodepath-'))

    // An isolated project root with no trace of `react-is` anywhere a real directory
    // walk (project root -> ancestors) would find it.
    const projectRoot = path.join(tmpDir, 'project')
    mkdirSync(path.join(projectRoot, 'node_modules'), {recursive: true})
    writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({name: 'fixture'}))

    // pnpm's flat virtual-store hoist dir (`.pnpm/node_modules`), which its bin shims
    // point `NODE_PATH` at. `react-is` lives only here, never under a real
    // `node_modules` a project-root walk would reach - this is exactly the layout
    // that made `react-is` and `react-compiler-runtime` falsely "resolvable" on
    // every `astro dev` in pnpm projects.
    const hoistDir = path.join(tmpDir, 'pnpm-hoist')
    const hoistedPackageDir = path.join(hoistDir, 'react-is')
    mkdirSync(hoistedPackageDir, {recursive: true})
    writeFileSync(
      path.join(hoistedPackageDir, 'package.json'),
      JSON.stringify({name: 'react-is', version: '0.0.0-fixture', main: 'index.js'}),
    )
    writeFileSync(path.join(hoistedPackageDir, 'index.js'), 'module.exports = {}')

    expect(existsSync(path.join(projectRoot, 'node_modules', 'react-is'))).toBe(false)

    process.env.NODE_PATH = hoistDir
    reinitModulePaths()

    // Sanity-check the fixture actually reproduces the leak: Node's own resolver
    // (what the pre-fix implementation relied on via `require.resolve`) must find
    // the package through NODE_PATH, or this test would pass for the wrong reason.
    const nodeRequire = createRequire(path.join(projectRoot, 'package.json'))
    expect(() => nodeRequire.resolve('react-is')).not.toThrow()

    // The guard must resolve the way Vite does - by walking node_modules from the
    // project root - and ignore the NODE_PATH-only copy entirely.
    expect(resolveSanityOptimizeDeps(projectRoot)).not.toContain('react-is')
  })
})
