import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'

import type {PartialDeep} from 'type-fest'
import type {ConfigEnv, PluginOption, ResolvedConfig, UserConfig} from 'vite'

import {normalizeStudioBasePath} from './studio-base-path'

const STUDIO_FIRST_LOAD_SUBPATH = './_dangerously_use_private_internals_that_do_not_follow_semver-1'

/**
 * Sanity Studio v7 exports `Studio` only from this entry and types the root export as `never`.
 * Earlier majors do not have the entry and export `Studio` from the root.
 */
export const STUDIO_FIRST_LOAD_ENTRY = `sanity/${STUDIO_FIRST_LOAD_SUBPATH.slice(2)}`

/**
 * The module that exports `Studio` for the `sanity` version installed in `projectRoot`. Looks in
 * `node_modules` directories like Vite does, since `require.resolve` also follows the `NODE_PATH`
 * that pnpm's bin shims point at its hidden hoist directory.
 */
export function resolveStudioEntry(projectRoot: string): string {
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    const manifestPath = path.join(dir, 'node_modules', 'sanity', 'package.json')
    if (existsSync(manifestPath)) {
      const {exports} = JSON.parse(readFileSync(manifestPath, 'utf8')) as {exports?: unknown}
      return exports && typeof exports === 'object' && STUDIO_FIRST_LOAD_SUBPATH in exports
        ? STUDIO_FIRST_LOAD_ENTRY
        : 'sanity'
    }
    if (path.dirname(dir) === dir) {
      return 'sanity'
    }
  }
}

/**
 * Lets Vite's dependency scan reach the embedded Studio (#435). The Studio route lives in
 * `@sanity/astro` and imports the project's `sanity.config` through the `sanity:studio` virtual
 * module, so the startup scan never sees `sanity`, its plugins, or the Studio's own imports. Vite
 * then finds them on the first `/admin` load, optimizes again and reloads the page, and chunks the
 * browser already asked for (or imports lazily later, like Sanity's `refractor` syntax
 * highlighting) answer `504 Outdated Optimize Dep`.
 */
export const STUDIO_OPTIMIZE_DEPS_ENTRIES = ['sanity.config.{js,jsx,mjs,mts,ts,tsx}']

/**
 * Imported where the scan cannot follow. `sanity:client` imports `@sanity/client` from the project
 * root, where it is installed as a peer dependency. The Studio route imports `history` from
 * `@sanity/astro`, so the nested form finds it when pnpm does not hoist it.
 */
export const STUDIO_OPTIMIZE_DEPS_INCLUDE = ['@sanity/client', '@sanity/astro > history']

/**
 * Vite 6 and older pre-bundle for `es2020`/`chrome87`, and esbuild refuses top-level await for
 * that target. `@sanity/vision` depends on `@sanity-labs/groq-wasm`, which awaits its WASM fetch
 * at the top level, so pre-bundling a `sanity.config` with `visionTool()` fails; since the scan
 * reaches `sanity.config` at startup, that failure takes every page's client modules down with
 * it. Vite 7 raised the target to browsers that support top-level await, and Vite 8 pre-bundles
 * with Rolldown and warns when `esbuildOptions` is set, so only older Vite gets the override.
 */
export const STUDIO_OPTIMIZE_DEPS_ESBUILD_OPTIONS = {supported: {'top-level-await': true}}

/**
 * Vite 7 is the first to call `config` hooks with a plugin context, so a missing `viteVersion`
 * means Vite 6 or older.
 */
export function preBundlesWithLegacyEsbuildTarget(viteVersion: string | undefined): boolean {
  const major = Number(viteVersion?.split('.')[0])
  return Number.isNaN(major) || major < 7
}

type ConfigHookContext = {meta?: {viteVersion?: string}}

export function vitePluginSanityStudio(resolvedOptions: {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
}) {
  const virtualModuleId = 'sanity:studio'
  const resolvedVirtualModuleId = virtualModuleId
  let projectRoot = process.cwd()

  return {
    name: 'sanity:studio',
    config(this: ConfigHookContext | undefined, config: UserConfig, {command}: ConfigEnv) {
      if (command !== 'serve' || !resolvedOptions.studioBasePath) {
        return
      }
      // The dependency scan never sees the virtual module's `Studio` import.
      const studioEntry = resolveStudioEntry(config.root ?? process.cwd())
      return {
        optimizeDeps: {
          entries: STUDIO_OPTIMIZE_DEPS_ENTRIES,
          include:
            studioEntry === STUDIO_FIRST_LOAD_ENTRY
              ? [...STUDIO_OPTIMIZE_DEPS_INCLUDE, studioEntry]
              : STUDIO_OPTIMIZE_DEPS_INCLUDE,
          ...(preBundlesWithLegacyEsbuildTarget(this?.meta?.viteVersion)
            ? {esbuildOptions: STUDIO_OPTIMIZE_DEPS_ESBUILD_OPTIONS}
            : {}),
        },
      }
    },
    configResolved(config: ResolvedConfig) {
      projectRoot = config.root
    },
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      return null
    },
    async load(id: string) {
      if (id === virtualModuleId) {
        const studioConfig = await this.resolve('/sanity.config')
        if (!studioConfig) {
          throw new Error(
            '[@sanity/astro]: Sanity Studio requires a `sanity.config.ts|js` file in your project root.',
          )
        }
        if (!resolvedOptions.studioBasePath) {
          throw new Error(
            "[@sanity/astro]: The `studioBasePath` option is required in `astro.config.mjs`. For example — `studioBasePath: '/admin'`",
          )
        }
        const studioBasePath = normalizeStudioBasePath(resolvedOptions.studioBasePath)
        if (!studioBasePath) {
          throw new Error(
            "[@sanity/astro]: The `studioBasePath` option cannot be empty. For example — `studioBasePath: '/admin'`",
          )
        }
        const studioRouterHistory =
          resolvedOptions.studioRouterHistory === 'hash' ? 'hash' : 'browser'
        return `
        import studioConfig from "${studioConfig.id}";
        export {Studio} from "${resolveStudioEntry(projectRoot)}";

        const embeddedStudioBasePath = "${studioBasePath}";
        const historyMode = "${studioRouterHistory}";
        const hashWorkspaceRootPath = "/";
        const browserWorkspaceRootPath = embeddedStudioBasePath;

        function toWorkspaceSlug(name, index) {
          const normalizedName = typeof name === "string" ? name.trim() : "";
          const candidate = (normalizedName || "workspace-" + (index + 1))
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          return candidate || "workspace-" + (index + 1);
        }

        function createWorkspaceBasePath(workspace, index, isSingleWorkspace) {
          const workspaceSlug = toWorkspaceSlug(workspace?.name, index);

          if (historyMode === "hash") {
            return isSingleWorkspace ? hashWorkspaceRootPath : "/" + workspaceSlug;
          }

          if (browserWorkspaceRootPath === "/") {
            return isSingleWorkspace ? browserWorkspaceRootPath : "/" + workspaceSlug;
          }

          return isSingleWorkspace
            ? browserWorkspaceRootPath
            : browserWorkspaceRootPath + "/" + workspaceSlug;
        }

        function warnAboutBasePathOverride() {
          console.warn(
            "[@sanity/astro]: This integration ignores the basePath setting in sanity.config.ts|js. To set the embedded Studio path, use the studioBasePath option in astro.config.mjs and remove basePath from sanity.config.ts.",
          );
        }

        if (Array.isArray(studioConfig)) {
          if (studioConfig.some((workspace) => !!workspace?.basePath)) {
            warnAboutBasePathOverride();
          }
        } else if (studioConfig?.basePath) {
          const expectedBasePath = historyMode === "hash" ? hashWorkspaceRootPath : browserWorkspaceRootPath;
          if (studioConfig.basePath !== expectedBasePath) {
            warnAboutBasePathOverride();
          }
        }

        export const config = Array.isArray(studioConfig)
          ? studioConfig.map((workspace, index, allWorkspaces) => ({
              ...workspace,
              // The integration owns workspace paths to keep Studio embedded under one Astro route.
              basePath: createWorkspaceBasePath(workspace, index, allWorkspaces.length === 1),
            }))
          : {
              ...studioConfig,
              // Override basePath from sanity.config.ts|js with integration settings.
              basePath: createWorkspaceBasePath(studioConfig, 0, true),
            };

        `
      }
      return null
    },
  } satisfies PartialDeep<PluginOption>
}
