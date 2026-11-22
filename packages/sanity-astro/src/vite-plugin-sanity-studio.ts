import type {PartialDeep} from 'type-fest'
import type {ConfigEnv, PluginOption, UserConfig} from 'vite'

import {normalizeStudioBasePath} from './studio-base-path'

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

export function vitePluginSanityStudio(resolvedOptions: {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
}) {
  const virtualModuleId = 'sanity:studio'
  const resolvedVirtualModuleId = virtualModuleId

  return {
    name: 'sanity:studio',
    config(_config: UserConfig, {command}: ConfigEnv) {
      if (command !== 'serve' || !resolvedOptions.studioBasePath) {
        return
      }
      return {
        optimizeDeps: {
          entries: STUDIO_OPTIMIZE_DEPS_ENTRIES,
          include: STUDIO_OPTIMIZE_DEPS_INCLUDE,
        },
      }
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
