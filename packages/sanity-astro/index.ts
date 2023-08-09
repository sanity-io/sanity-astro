import type { AstroIntegration } from "astro";
import type { SanityClient, ClientConfig } from "@sanity/client";
import { vitePluginSanityInit } from "./vite-plugin-sanity-init";
declare global {
  var sanityClientInstance: SanityClient;
}

export function useSanityClient(): SanityClient {
  if (!globalThis.sanityClientInstance) {
    console.error("sanityClientInstance has not been initialized correctly");
  }
  return globalThis.sanityClientInstance;
}

export type IntegrationOptions = ClientConfig;

const defaultOptions: IntegrationOptions = {
  apiVersion: "v2021-03-25",
}

export function sanityIntegration(
  options: IntegrationOptions
): AstroIntegration {
  const resolvedOptions = {
    ...defaultOptions,
    ...options,
  };
  return {
    name: "@sanity/astro",
    hooks: {
      "astro:config:setup": ({ injectScript, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [vitePluginSanityInit(resolvedOptions)],
          },
        });

        injectScript(
          "page-ssr",
          `
          import { sanityClientInstance } from "virtual:sanity-init";
          globalThis.sanityClientInstance = sanityClientInstance;
          `
        );
      },
    },
  };
}

// export * from "./types";
