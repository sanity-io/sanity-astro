import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityLoader} from './vite-plugin-sanity-loader'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'
import type {ClientConfig} from '@sanity/client'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'
import {createSanityLoaderTypeDeclaration, type LiveLoadersConfig} from './live/loader-config'

type LiveSchemaOptions = {
  output?: string
  input?: string
  names?: string[]
}

type LegacyLiveLoaderOptions = {
  schema?: LiveSchemaOptions
}

type LiveOptions = {
  schema?: LiveSchemaOptions
  loaders?: LiveLoadersConfig
}

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
  logClientRequests?: 'dev' | 'build' | 'always'
  live?: LiveOptions
  liveLoader?: LegacyLiveLoaderOptions
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

function resolveStudioRouterHistory(
  inputStudioRouterHistory: 'browser' | 'hash' | undefined,
  output: unknown,
): 'browser' | 'hash' {
  if (inputStudioRouterHistory === 'hash' || inputStudioRouterHistory === 'browser') {
    return inputStudioRouterHistory
  }

  return output === 'static' ? 'hash' : 'browser'
}

export default function sanityIntegration(
  integrationConfig: IntegrationOptions = {},
): AstroIntegration {
  const live = normalizeLiveOptions(integrationConfig.live, integrationConfig.liveLoader)
  const studioBasePath = integrationConfig.studioBasePath
  const normalizedStudioBasePath = normalizeStudioBasePath(studioBasePath)
  const inputStudioRouterHistory = integrationConfig.studioRouterHistory
  const logClientRequests = integrationConfig.logClientRequests
  let sanityLoaderTypes = createSanityLoaderTypeDeclaration(live.loaders)
  const sanityLoaderTypesFilename = 'sanity-loader.d.ts'
  let liveOptionsForScripts: LiveOptions = live
  const clientConfig = integrationConfig
  delete clientConfig.studioBasePath
  delete clientConfig.studioRouterHistory
  delete clientConfig.logClientRequests
  delete clientConfig.live
  delete clientConfig.liveLoader

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  const integration: AstroIntegration & {
    __sanityAstroOptions?: {
      live?: LiveOptions
      liveLoader?: LegacyLiveLoaderOptions
    }
  } = {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': ({config, createCodegenDir, injectScript, injectRoute, updateConfig}) => {
        const codegenDir = createCodegenDir()
        if (!live.schema?.output) {
          const defaultSchemaOutput = new URL('sanity-live-schemas.generated.ts', codegenDir).pathname
          liveOptionsForScripts = {
            ...live,
            schema: {
              ...(live.schema ?? {}),
              output: defaultSchemaOutput,
            },
          }
        }

        sanityLoaderTypes = createSanityLoaderTypeDeclaration(liveOptionsForScripts.loaders)

        const studioRouterHistory = resolveStudioRouterHistory(
          inputStudioRouterHistory,
          config?.output,
        )
        updateConfig({
          vite: {
            optimizeDeps: {
              include: [
                'react-dom',
                'react-dom/client',
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
              }, {logClientRequests}),
              vitePluginSanityLoader(live.loaders),
              vitePluginSanityStudio({
                studioBasePath: normalizedStudioBasePath,
                studioRouterHistory,
              }),
              vitePluginSanityStudioHashRouter(),
              vitePluginSanityStudioChunkWarning(),
            ],
          },
        })
        // only load this route if `studioBasePath` is set
        const pattern = studioRoutePattern(normalizedStudioBasePath, studioRouterHistory)
        if (pattern) {
          // If the studio router history is set to hash, we can load a studio route that doesn't need a server adapter
          if (studioRouterHistory === 'hash') {
            injectRoute({
              // @ts-expect-error
              entryPoint: '@sanity/astro/studio/studio-route-hash.astro', // Astro <= 3
              entrypoint: '@sanity/astro/studio/studio-route-hash.astro', // Astro > 3
              pattern,
              prerender: true,
            })
          } else {
            injectRoute({
              // @ts-expect-error
              entryPoint: '@sanity/astro/studio/studio-route.astro', // Astro <= 3
              entrypoint: '@sanity/astro/studio/studio-route.astro', // Astro > 3
              pattern,
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

        integration.__sanityAstroOptions = {
          live: liveOptionsForScripts,
          liveLoader: {
            schema: liveOptionsForScripts.schema,
          },
        }
      },
      'astro:config:done': ({injectTypes}) => {
        injectTypes({
          filename: sanityLoaderTypesFilename,
          content: sanityLoaderTypes,
        })
      },
    },
  }

  integration.__sanityAstroOptions = {
    live,
    liveLoader: {
      schema: live.schema,
    },
  }

  return integration
}

function normalizeLiveOptions(live: LiveOptions | undefined, legacyLiveLoader: LegacyLiveLoaderOptions | undefined): LiveOptions {
  return {
    ...(live ?? {}),
    schema: live?.schema ?? legacyLiveLoader?.schema,
  }
}
