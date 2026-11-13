import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import type {ClientConfig} from '@sanity/client'
import type {AstroIntegration, AstroUserConfig} from 'astro'

import {CLIENT_TYPES_FILENAME, generateClientTypes} from './client-types'
import {type LiveState, setupLive, watchSchema} from './live/integration'
import type {SanityLiveOptions} from './live/options'
import {type NamedClientConfig, resolveClientConfigs} from './resolve-clients'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityLoader} from './vite-plugin-sanity-loader'
import {vitePluginSanityModuleDedupe} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'

export type {
  SanityLiveLoaderConfig,
  SanityLiveOptions,
  SanityLiveOrderBy,
  SanityLiveSchemaOptions,
} from './live/options'

// The plugin factories return Vite's `PluginOption` from this package's copy of Vite, which can
// differ from the copy Astro's config types reference. Passing the array to `updateConfig` as is
// crashes TypeScript 5.9 while it reports the mismatch, so it is typed as Astro's own option.
type AstroVitePlugins = NonNullable<NonNullable<AstroUserConfig['vite']>['plugins']>

export type {NamedClientConfig}

export type StudioRouterHistory = 'browser' | 'hash'
export type LogClientRequests = 'dev' | 'build' | 'always'

export type IntegrationOptions = ClientConfig & {
  /**
   * Mounts Sanity Studio at this path, for example `/admin`. Requires a
   * `sanity.config.ts|js` in the project root. Leave unset to skip the Studio route.
   */
  studioBasePath?: string
  /**
   * `browser` history needs a server adapter, `hash` history works on static output.
   * Defaults to `hash` for `output: 'static'` and `browser` otherwise.
   */
  studioRouterHistory?: StudioRouterHistory
  /**
   * Logs every `sanityClient.fetch` and `sanityClient.request` on the server with
   * its duration, query and calling file.
   */
  logClientRequests?: LogClientRequests
  /**
   * Registers the `sanity:client` and `sanity:studio` type declarations through
   * Astro's `injectTypes` (Astro 4.14 and later), so `env.d.ts` needs no
   * `/// <reference types="@sanity/astro/module" />`. Off by default; the manual
   * reference keeps working either way.
   */
  injectTypes?: boolean
  /**
   * Named Sanity clients. `clients.default` is exported from `sanity:client` as `sanityClient`,
   * every client is available through `getClient(name)`.
   * Top-level client options can be used instead of `clients.default`, but not together with it.
   */
  clients?: Record<string, NamedClientConfig>
  /**
   * Generates typed live loaders, Zod schemas and the `sanity:loader` module from your Sanity
   * schema for Astro live collections. Nothing runs unless this is set.
   * @experimental The option name and shape may change in minor releases.
   */
  experimental_live?: SanityLiveOptions
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

const studioRoutes = {
  hash: {
    entrypoint: '@sanity/astro/studio/studio-route-hash.astro',
    prerender: true,
  },
  browser: {
    entrypoint: '@sanity/astro/studio/studio-route.astro',
    prerender: false,
  },
} as const satisfies Record<StudioRouterHistory, {entrypoint: string; prerender: boolean}>

function resolveStudioRouterHistory(
  requested: StudioRouterHistory | undefined,
  output: unknown,
): StudioRouterHistory {
  if (requested === 'hash' || requested === 'browser') {
    return requested
  }

  return output === 'static' ? 'hash' : 'browser'
}

export default function sanityIntegration(options: IntegrationOptions = {}): AstroIntegration {
  const {
    studioBasePath,
    studioRouterHistory: requestedStudioRouterHistory,
    logClientRequests,
    injectTypes: shouldInjectTypes = false,
    clients,
    experimental_live: liveOptions,
    ...clientConfig
  } = options
  const normalizedStudioBasePath = normalizeStudioBasePath(studioBasePath)

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  const resolvedClients = resolveClientConfigs({
    clientConfig,
    clients,
    defaults: defaultClientConfig,
  })

  let live: LiveState | undefined

  // With `experimental_live` unset the integration registers the same hooks and Vite plugins as
  // before the option existed.
  const liveHooks: AstroIntegration['hooks'] = liveOptions
    ? {
        'astro:server:setup': async ({server, logger}) => {
          if (live) {
            await watchSchema(live, server, logger)
          }
        },
      }
    : {}

  return {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': async ({
        config,
        command,
        injectScript,
        injectRoute,
        updateConfig,
        createCodegenDir,
        logger,
      }) => {
        const studioRouterHistory = resolveStudioRouterHistory(
          requestedStudioRouterHistory,
          config?.output,
        )
        // `astro preview` runs this hook too but serves the built output, so it never imports
        // `sanity:loader` and does not need an extraction.
        if (liveOptions && command !== 'preview') {
          live = await setupLive(liveOptions, {
            root: fileURLToPath(config.root),
            command,
            createCodegenDir,
            logger,
          })
        }
        const vitePlugins = [
          ...(process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE
            ? []
            : [vitePluginSanityModuleDedupe()]),
          vitePluginSanityClient(resolvedClients, {logClientRequests}),
          ...(live ? [vitePluginSanityLoader(live)] : []),
          vitePluginSanityStudio({
            studioBasePath: normalizedStudioBasePath,
            studioRouterHistory,
          }),
          vitePluginSanityStudioHashRouter(),
          vitePluginSanityStudioChunkWarning(),
        ]

        updateConfig({
          vite: {
            plugins: vitePlugins as AstroVitePlugins,
          },
        })

        const pattern = studioRoutePattern(normalizedStudioBasePath, studioRouterHistory)
        if (pattern) {
          const route = studioRoutes[studioRouterHistory]
          injectRoute({
            // @ts-expect-error -- `entryPoint` is the Astro <= 3 spelling
            entryPoint: route.entrypoint,
            entrypoint: route.entrypoint,
            pattern,
            prerender: route.prerender,
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
      // `injectTypes` arrived in Astro 4.14; older versions keep using the manual
      // `/// <reference types="@sanity/astro/module" />` even when opted in.
      'astro:config:done': async ({injectTypes}) => {
        if (typeof injectTypes !== 'function') return
        if (shouldInjectTypes) {
          injectTypes({
            filename: 'types.d.ts',
            content: '/// <reference types="@sanity/astro/module" />\n',
          })
        }
        // Only projects that set `clients` get generated client types. Injecting them into
        // every project would pull `module.d.ts` in automatically and change type-checking
        // for single-client setups.
        if (clients !== undefined) {
          injectTypes({
            filename: CLIENT_TYPES_FILENAME,
            content: generateClientTypes(resolvedClients),
          })
        }
        if (!live) {
          return
        }
        live.typesFile = injectTypes({
          filename: 'sanity-loader.d.ts',
          content: live.module.types,
        })
        // Astro only writes injected types during sync, which a config-triggered dev restart
        // skips, so the file is written here as well to keep the declarations current.
        await writeFile(live.typesFile, live.module.types)
      },
      ...liveHooks,
    },
  }
}
