import type { AstroIntegration } from "astro";
import type { SanityClient, ClientConfig } from "@sanity/client";
import { vitePluginSanityInit } from "./vite-plugin-sanity-init";
import imageUrlBuilder from "@sanity/image-url";
import { ImageUrlBuilder } from "@sanity/image-url/lib/types/builder";

declare global {
  var sanityClientInstance: SanityClient;
}

export function useSanityClient(): SanityClient {
  if (!globalThis.sanityClientInstance) {
    console.error("sanityClientInstance has not been initialized correctly");
  }
  return globalThis.sanityClientInstance;
}

export function useSanityImageUrlBuilder(): ImageUrlBuilder {
  const builder = imageUrlBuilder(useSanityClient());
  return builder;
}

type IntegrationOptions = ClientConfig;

export default function sanityIntegration(
  options: IntegrationOptions
): AstroIntegration {
  const resolvedOptions = {
    useCdn: true,
    apiVersion: "v2021-03-25",
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
