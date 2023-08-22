import type { Plugin } from "vite";

export function vitePluginSanityStudio(resolvedOptions, config): Plugin {
  if (config.output !== "hybrid") {
    throw new Error(
      "[@sanity/astro]: Sanity Studio requires `output: 'hybrid'` in your Astro config"
    );
  }

  if (!resolvedOptions.studioBasePath) {
    throw new Error(
      "The `studioBasePath` option is required in `astro.config.mjs`. For example — `studioBasePath: '/admin'`"
    );
  }
  const virtualModuleId = "virtual:sanity-studio";
  const resolvedVirtualModuleId = virtualModuleId;

  return {
    name: "vite-plugin-sanity-studio",
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    async load(id: string) {
      if (id === "virtual:sanity-studio") {
        const studioConfig = await this.resolve("/sanity.config");
        if (!studioConfig) {
          console.error(
            "[@sanity/astro]: Sanity Studio requires a `sanity.config.ts|js` file in your project root."
          );
          return null;
        }
        return `
        import config from "${studioConfig.id}";
        if (config.basePath) {
          if (config.basePath !== "/${resolvedOptions.studioBasePath}") {
            console.warn(
              "[@sanity/astro]: This integration ignores the basePath setting in sanity.config.ts|js. To set the basePath for Sanity Studio, use the studioBasePath option in astro.config.mjs and remove it from sanity.config.ts.");
          }
        }

        export default {
          ...config,
          // override basePath from sanity.config.ts|js with plugin setting
          basePath: "/${resolvedOptions.studioBasePath}",
        }`;
      }
      return null;
    },
  };
}
