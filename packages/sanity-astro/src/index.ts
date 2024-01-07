import type { AstroIntegration } from "astro";
import { vitePluginSanityClient } from "./vite-plugin-sanity-client";
import { vitePluginSanityStudio } from "./vite-plugin-sanity-studio";
import type { ClientConfig } from "@sanity/client";

// declaring these here will cause them to appear in unified dist/types/index.d.ts
// importing the module.d.ts containing them would not, unreasonably....
declare module "sanity:client" {
  export const sanityClient: import("@sanity/client").SanityClient;
}

declare module "sanity:studio" {
  export const studioConfig: import("sanity").Config;
}

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string;
};

const defaultOptions: IntegrationOptions = {
  apiVersion: "v2023-08-24",
};

export function sanityIntegration(
  options: IntegrationOptions,
): AstroIntegration {
  const resolvedOptions = {
    ...defaultOptions,
    ...options,
  };
  return {
    name: "@sanity/astro",
    hooks: {
      "astro:config:setup": ({
        injectScript,
        injectRoute,
        updateConfig,
        config,
        logger,
      }) => {
        updateConfig({
          vite: {
            plugins: [
              vitePluginSanityClient(resolvedOptions),
              vitePluginSanityStudio(resolvedOptions, config),
            ],
          },
        });
        // only load this route if `studioBasePath` is set
        if (resolvedOptions.studioBasePath) {
          injectRoute({
            entryPoint: "@sanity/astro/studio/studio-route.astro", // Astro <= 3
            entrypoint: "@sanity/astro/studio/studio-route.astro", // Astro > 3
            pattern: `/${resolvedOptions.studioBasePath}/[...params]`,
            prerender: false,
          });
        }
        injectScript(
          "page-ssr",
          `
          import { sanityClient } from "sanity:client";
          globalThis.sanityClient = sanityClient;
          `,
        );
      },
    },
  };
}
