import {createRequire} from 'node:module'
import path from 'node:path'
import type {PluginOption, UserConfig} from 'vite'

/**
 * Dev-only Vite dedupe for embedded Studio + @astrojs/react islands (#406).
 *
 * Vite can load the same logical package through pre-bundled and direct paths even
 * when npm reports a single copy. Pair resolve.dedupe with optimizeDeps.include.
 * The studio chunk-size warning plugin (apply: 'build') is not involved in dev.
 */
export const SANITY_MODULE_DEDUPE = [
  'react',
  'react-dom',
  'react-dom/client',
  'styled-components',
  'sanity',
  '@sanity/ui',
] as const

/**
 * Pre-bundle during dev alongside resolve.dedupe. Includes Sanity-adjacent CJS/deep
 * imports that Vite would otherwise discover lazily.
 */
export const SANITY_OPTIMIZE_DEPS_CANDIDATES = [
  'react',
  'react-dom',
  'react-dom/client',
  'react-compiler-runtime',
  'react-is',
  'styled-components',
  'lodash/startCase.js',
] as const

function canResolveDependency(projectRoot: string, dependency: string): boolean {
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'))
    require.resolve(dependency)
    return true
  } catch {
    return false
  }
}

function resolvePackageRoot(projectRoot: string, packageName: string): string | undefined {
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'))
    return require.resolve(`${packageName}/package.json`).replace(/\/package\.json$/, '')
  } catch {
    return undefined
  }
}

export function resolveSanityOptimizeDeps(projectRoot: string): string[] {
  return SANITY_OPTIMIZE_DEPS_CANDIDATES.filter((dependency) =>
    canResolveDependency(projectRoot, dependency),
  )
}

export function resolveSanityModuleDedupe(projectRoot: string): string[] {
  return SANITY_MODULE_DEDUPE.filter((dependency) => canResolveDependency(projectRoot, dependency))
}

export function buildSanityModuleAliases(projectRoot: string) {
  const aliases: Array<{find: RegExp; replacement: string}> = []

  const sanityPackageRoot = resolvePackageRoot(projectRoot, 'sanity')
  if (sanityPackageRoot) {
    aliases.push({
      // Only alias the root `sanity` entry so subpaths like `sanity/structure` still resolve.
      find: /^sanity$/,
      replacement: sanityPackageRoot,
    })
  }

  const styledComponentsRoot = resolvePackageRoot(projectRoot, 'styled-components')
  if (styledComponentsRoot) {
    aliases.push({
      find: /^styled-components$/,
      replacement: styledComponentsRoot,
    })
  }

  return aliases
}

export function vitePluginSanityModuleDedupe(): PluginOption {
  return {
    name: 'sanity:module-dedupe',
    apply: 'serve',
    enforce: 'pre',
    config(config: UserConfig) {
      const projectRoot = config.root ?? process.cwd()
      const alias = buildSanityModuleAliases(projectRoot)
      const optimizeDepsInclude = resolveSanityOptimizeDeps(projectRoot)
      const dedupe = resolveSanityModuleDedupe(projectRoot)

      return {
        optimizeDeps: {
          include: optimizeDepsInclude,
        },
        resolve: {
          dedupe,
          ...(alias.length > 0 ? {alias} : {}),
        },
      }
    },
  }
}
