import type { AstroIntegration } from "astro";
import type { SanityClient, ClientConfig } from "@sanity/client";
import { vitePluginSanityInit } from "./vite-plugin-sanity-init";
import { vitePluginSanityStudio } from "./vite-plugin-sanity-studio";
declare global {
  var sanityClientInstance: SanityClient;
}

export function useSanityClient(): SanityClient {
  if (!globalThis.sanityClientInstance) {
    console.error(
      "[@sanity/astro]: sanityClientInstance has not been initialized correctly",
    );
  }
  return globalThis.sanityClientInstance;
}

export type IntegrationOptions = ClientConfig & {
  studioBasePath?: string;
};

const defaultOptions: IntegrationOptions = {
  apiVersion: "v2021-03-25",
};
export default function sanityIntegration(
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
      }) => {
        updateConfig({
          vite: {
            plugins: [
              vitePluginSanityInit(resolvedOptions),
              vitePluginSanityStudio(resolvedOptions, config),
            ],
          },
        });
        injectRoute({
          entryPoint: "@sanity/astro/studio/studio-route.astro",
          pattern: `/${resolvedOptions.studioBasePath}/[...params]`,
          prerender: false,
        });
        injectScript(
          "page-ssr",
          `
          import { sanityClientInstance } from "virtual:sanity-init";
          globalThis.sanityClientInstance = sanityClientInstance;
          `,
        );
      },
    },
  };
}
