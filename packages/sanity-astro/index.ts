import type { AstroIntegration } from "astro";
import type { SanityClient, ClientConfig } from "@sanity/client";
import type { Config } from "sanity";
import { vitePluginSanityClient } from "./vite-plugin-sanity-client";
import { vitePluginSanityStudio } from "./vite-plugin-sanity-studio";

declare module "sanity:client" {
  // eslint-disable-next-line
  export const sanityClient: SanityClient;
}

declare module "sanity:studio" {
  // eslint-disable-next-line
  export const studioConfig: Config;
}

export type IntegrationOptions = ClientConfig & {
  studioBasePath?: string;
};

const defaultOptions: IntegrationOptions = {
  apiVersion: "v2023-08-24",
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
            entryPoint: "@sanity/astro/studio/studio-route.astro",
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
