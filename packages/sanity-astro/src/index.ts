import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import type {ClientConfig} from '@sanity/client'

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

export default function sanityIntegration({
  studioBasePath,
  ...clientConfig
}: IntegrationOptions): AstroIntegration {

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath:` and `stega { studioUrl: }` configs\n" +
      " should be a relative URL,  e.g. '/admin', when using the embedded Studio.\n" +
      " But if you are using a separate Studio, set `studioBasePath:` to an unquoted\n" +
      " JavaScript `undefined`, then set the full (http etc.) URL for this Studio\n" +
      " as the string for your config `stega { studioUrl: }` value."
    )
  }

  return {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': ({injectScript, injectRoute, updateConfig}) => {
        updateConfig({
          vite: {
            plugins: [
              vitePluginSanityClient({
                ...defaultClientConfig,
                ...clientConfig,
              }),
              vitePluginSanityStudio({studioBasePath}),
            ],
          },
        })
        // only load this route if `studioBasePath` is set
        if (studioBasePath) {
          injectRoute({
            // @ts-expect-error
            entryPoint: '@sanity/astro/studio/studio-route.astro', // Astro <= 3
            entrypoint: '@sanity/astro/studio/studio-route.astro', // Astro > 3
            pattern: `/${studioBasePath}/[...params]`,
            prerender: false,
          })
        }
        injectScript(
          'page-ssr',
          `
          import { sanityClient } from "sanity:client";
          globalThis.sanityClient = sanityClient;
          `,
        )
      },
    },
  }
}
