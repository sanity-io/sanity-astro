import type {ClientConfig} from '@sanity/client'
import type {AstroIntegration} from 'astro'

import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityModuleDedupe} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'
import {vitePluginSanityVisualEditingStandalone} from './vite-plugin-sanity-visual-editing-standalone'

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
   * Runs the `<VisualEditing />` overlays on `@sanity/visual-editing-standalone`
   * instead of `@sanity/visual-editing`. The standalone build bundles its own React,
   * React DOM and styled-components instead of using the project's copies. Requires
   * `@sanity/visual-editing-standalone` to be installed. With
   * `experimental_refreshStrategy="in-place"` the instant text step doesn't work in this
   * mode, because the standalone build doesn't export the optimistic document state it
   * reads. Defaults to `false`.
   */
  visualEditingStandalone?: boolean
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
    visualEditingStandalone = false,
    ...clientConfig
  } = options
  const normalizedStudioBasePath = normalizeStudioBasePath(studioBasePath)

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  return {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': ({config, injectScript, injectRoute, logger, updateConfig}) => {
        const studioRouterHistory = resolveStudioRouterHistory(
          requestedStudioRouterHistory,
          config?.output,
        )
        const vitePlugins = [
          ...(process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE
            ? []
            : [vitePluginSanityModuleDedupe()]),
          vitePluginSanityClient(
            {
              ...defaultClientConfig,
              ...clientConfig,
            },
            {logClientRequests},
          ),
          vitePluginSanityStudio({
            studioBasePath: normalizedStudioBasePath,
            studioRouterHistory,
          }),
          vitePluginSanityStudioHashRouter(),
          vitePluginSanityStudioChunkWarning(),
          ...(visualEditingStandalone ? [vitePluginSanityVisualEditingStandalone()] : []),
        ]

        if (
          visualEditingStandalone &&
          config?.integrations?.some((integration) => integration.name === '@astrojs/react')
        ) {
          logger?.warn(
            '`visualEditingStandalone` bundles its own copy of React. This project also uses `@astrojs/react`, so pages with Visual Editing load React twice.',
          )
        }

        updateConfig({
          vite: {
            plugins: vitePlugins,
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
      'astro:config:done': ({injectTypes}) => {
        if (!shouldInjectTypes) return
        injectTypes?.({
          filename: 'types.d.ts',
          content: '/// <reference types="@sanity/astro/module" />\n',
        })
      },
    },
  }
}
