import {existsSync, realpathSync} from 'node:fs'
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
 * Splits a bare specifier into its package name and an optional subpath, respecting
 * scoped package names (`@sanity/ui` is the package; `react-dom/client` has subpath
 * `client`).
 */
function parseSpecifier(specifier: string): {packageName: string; subpath: string} {
  const segments = specifier.split('/')
  const packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  const subpath = specifier.slice(packageName.length).replace(/^\//, '')
  return {packageName, subpath}
}

/**
 * Walks `node_modules` directories upward from `baseDir` looking for `packageName`,
 * the same way Node's CommonJS resolver (and Vite's own resolver) locate a package
 * when `NODE_PATH` isn't involved.
 *
 * This deliberately never consults `NODE_PATH`. pnpm's bin shims export
 * `NODE_PATH=.../.pnpm/node_modules` (its flat virtual-store hoist directory), which
 * `require.resolve` honors but Vite's resolver never does. A package that only lives in
 * that hoist directory (not reachable by walking node_modules from the project root)
 * would resolve via `require.resolve` while still failing when Vite actually tries to
 * pre-bundle it, producing a false "resolvable" result (see the #449 review discussion).
 */
function findPackageDir(baseDir: string, packageName: string): string | undefined {
  let dir = baseDir
  while (true) {
    const candidate = path.join(dir, 'node_modules', packageName)
    if (existsSync(path.join(candidate, 'package.json'))) {
      try {
        return realpathSync(candidate)
      } catch {
        return candidate
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

function canResolveDependency(projectRoot: string, dependency: string): boolean {
  const {packageName, subpath} = parseSpecifier(dependency)
  const packageDir = findPackageDir(projectRoot, packageName)
  if (!packageDir) {
    return false
  }

  if (!subpath) {
    return true
  }

  // The known candidates with subpaths (e.g. `react-dom/client`) resolve to a flat
  // file at the package root, so a file-existence check is enough without
  // reimplementing package.json `exports` map resolution.
  return (
    existsSync(path.join(packageDir, subpath)) || existsSync(path.join(packageDir, `${subpath}.js`))
  )
}

function resolvePackageRoot(projectRoot: string, packageName: string): string | undefined {
  return findPackageDir(projectRoot, packageName)
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
