import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'

import type {PluginOption, UserConfig} from 'vite'

/**
 * Dev-only Vite dedupe for embedded Studio + @astrojs/react islands (#406).
 *
 * Vite can load the same logical package through pre-bundled and direct paths even
 * when npm reports a single copy. The studio chunk-size warning plugin (apply: 'build')
 * is not involved in dev.
 *
 * Membership rule for SANITY_MODULE_DEDUPE: only packages that must be a single instance
 * per page belong here — React, its renderer, styled-components, and the Studio itself
 * (`sanity`). A regular dependency that other packages legitimately pin at a different
 * major does not belong, because `resolve.dedupe` forces everyone onto the root copy and
 * breaks that package's own subpath imports if they differ per major.
 *
 * `@sanity/ui` is the case that motivated this rule (#462): the project's `sanity` peer
 * range (`^3.99 || ^4 || ^5 || ^6`) spans `@sanity/ui` v2/v3/v4, while `@sanity/visual-editing`
 * pins its own major (v5 → `^3`, v6 → `^4`) with different subpath exports per major
 * (`./_visual-editing` only in v3; `./menu`, `./popover`, `./tooltip`, `./styles.css` only
 * in v4). Deduping it forces `@sanity/visual-editing`'s nested import onto whichever major
 * the project's `sanity` resolves, breaking the island in both directions regardless of
 * which side is newer.
 *
 * `resolve.dedupe` and `optimizeDeps.include` below are independent lists, not a pair:
 * `sanity` is deduped but not pre-bundled, and `react-is`/`react-compiler-runtime` are
 * pre-bundled but not deduped.
 */
export const SANITY_MODULE_DEDUPE = ['react', 'react-dom', 'styled-components', 'sanity'] as const

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
] as const

/**
 * Whether `dependency`'s package sits in a `node_modules` directory at or above `projectRoot`,
 * which is where Vite looks. Node's `require.resolve` also honours `NODE_PATH`, which pnpm's bin
 * shims point at the hidden `node_modules/.pnpm/node_modules` hoist directory, so on its own it
 * finds packages the project never installed: a React-free project then gets `styled-components`
 * aliased to whichever copy pnpm hoisted, built against a different React than the overlays.
 */
function isInstalledFrom(projectRoot: string, dependency: string): boolean {
  const segments = dependency.split('/')
  const packageName = dependency.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]!
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'node_modules', packageName, 'package.json'))) {
      return true
    }
    if (path.dirname(dir) === dir) {
      return false
    }
  }
}

function canResolveDependency(projectRoot: string, dependency: string): boolean {
  if (!isInstalledFrom(projectRoot, dependency)) {
    return false
  }
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'))
    require.resolve(dependency)
    return true
  } catch {
    return false
  }
}

function resolvePackageRoot(projectRoot: string, packageName: string): string | undefined {
  if (!isInstalledFrom(projectRoot, packageName)) {
    return undefined
  }
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
