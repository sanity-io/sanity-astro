import type { DeepPartial } from "astro/dist/type-utils";
import type { PluginOption } from "vite";

export function vitePluginSanityStudio(resolvedOptions: {
  studioBasePath?: string;
}) {
  const virtualModuleId = "sanity:studio";
  const resolvedVirtualModuleId = virtualModuleId;

  return {
    name: "sanity:studio",
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    async load(id: string) {
      if (id === virtualModuleId) {
        const studioConfig = await this.resolve("/sanity.config");
        if (!studioConfig) {
          throw new Error(
            "[@sanity/astro]: Sanity Studio requires a `sanity.config.ts|js` file in your project root.",
          );
        }
        if (!resolvedOptions.studioBasePath) {
          throw new Error(
            "[@sanity/astro]: The `studioBasePath` option is required in `astro.config.mjs`. For example — `studioBasePath: '/admin'`",
          );
        }
        return `
        import studioConfig from "${studioConfig.id}";

        if (studioConfig.basePath) {
          if (studioConfig.basePath !== "/${resolvedOptions.studioBasePath}") {
            console.warn(
              "[@sanity/astro]: This integration ignores the basePath setting in sanity.config.ts|js. To set the basePath for Sanity Studio, use the studioBasePath option in astro.config.mjs and remove it from sanity.config.ts.");
          }
        }

        export const config = {
          ...studioConfig,
          // override basePath from sanity.config.ts|js with plugin setting
          basePath: "${resolvedOptions.studioBasePath}",
        }
        `;
      }
      return null;
    },
  } satisfies DeepPartial<PluginOption>;
}
