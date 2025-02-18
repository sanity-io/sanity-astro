import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'
import type {ClientConfig} from '@sanity/client'

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

export default function sanityIntegration(
  integrationConfig: IntegrationOptions = {},
): AstroIntegration {
  const studioBasePath = integrationConfig.studioBasePath
  const studioRouterHistory = integrationConfig.studioRouterHistory === 'hash' ? 'hash' : 'browser'
  const clientConfig = integrationConfig
  delete clientConfig.studioBasePath
  delete clientConfig.studioRouterHistory

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  return {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': ({injectScript, injectRoute, updateConfig}) => {
        updateConfig({
          vite: {
            optimizeDeps: {
              include: [
                'react-compiler-runtime',
                'react-is',
                'styled-components',
                'lodash/startCase.js',
              ],
            },
            plugins: [
              vitePluginSanityClient({
                ...defaultClientConfig,
                ...clientConfig,
              }),
              vitePluginSanityStudio({studioBasePath}),
              vitePluginSanityStudioHashRouter(),
            ],
          },
        })
        // only load this route if `studioBasePath` is set
        if (studioBasePath) {
          // If the studio router history is set to hash, we can load a studio route that doesn't need a server adapter
          if (studioRouterHistory === 'hash') {
            injectRoute({
              // @ts-expect-error
              entryPoint: '@sanity/astro/studio/studio-route-hash.astro', // Astro <= 3
              entrypoint: '@sanity/astro/studio/studio-route-hash.astro', // Astro > 3
              pattern: `/${studioBasePath}`,
              prerender: true,
            })
          } else {
            injectRoute({
              // @ts-expect-error
              entryPoint: '@sanity/astro/studio/studio-route.astro', // Astro <= 3
              entrypoint: '@sanity/astro/studio/studio-route.astro', // Astro > 3
              pattern: `/${studioBasePath}/[...params]`,
              prerender: false,
            })
          }
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
