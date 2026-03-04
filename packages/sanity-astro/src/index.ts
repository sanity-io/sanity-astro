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

export default function sanityIntegration(
  integrationConfig: IntegrationOptions = {},
): AstroIntegration {
  const studioBasePath = integrationConfig.studioBasePath
  const normalizedStudioBasePath = studioBasePath
    ? normalizeStudioBasePath(studioBasePath)
    : undefined
  const clientConfig = integrationConfig
  delete clientConfig.studioBasePath

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
              vitePluginSanityStudio({
                studioBasePath: normalizedStudioBasePath,
              }),
            ],
          },
        })
        // only load this route if `studioBasePath` is set
        if (normalizedStudioBasePath) {
          const browserRoutePattern =
            normalizedStudioBasePath === '/'
              ? '/[...params]'
              : `${normalizedStudioBasePath}/[...params]`
          injectRoute({
            // @ts-expect-error
            entryPoint: '@sanity/astro/studio/studio-route.astro', // Astro <= 3
            entrypoint: '@sanity/astro/studio/studio-route.astro', // Astro > 3
            pattern: browserRoutePattern,
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

function normalizeStudioBasePath(path: string): string {
  const trimmedPath = path.trim()
  const withLeadingSlash = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  if (withLeadingSlash === '/') {
    return withLeadingSlash
  }
  return withLeadingSlash.replace(/\/+$/, '')
}
