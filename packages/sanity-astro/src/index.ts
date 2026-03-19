import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'
import type {ClientConfig} from '@sanity/client'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'

type VisualEditingOptions = {
  token?: string
  previewMode?: boolean | {enable?: string; disable?: string; cookie?: string}
}

type PreviewModeOptions = {
  enable: string
  disable: string
  cookie: string
}

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
  visualEditing?: 'draftMode' | 'disabled' | VisualEditingOptions
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

function resolvePreviewModeConfig(
  previewMode: VisualEditingOptions['previewMode'],
): PreviewModeOptions | false {
  if (previewMode === false) {
    return false
  }
  if (previewMode === true || previewMode === undefined) {
    return {
      enable: '/preview/enable',
      disable: '/preview/disable',
      cookie: '__sanity_preview',
    }
  }

  return {
    enable: previewMode.enable || '/preview/enable',
    disable: previewMode.disable || '/preview/disable',
    cookie: previewMode.cookie || '__sanity_preview',
  }
}
export default function sanityIntegration(
  integrationConfig: IntegrationOptions = {},
): AstroIntegration {
  const {
    studioBasePath,
    studioRouterHistory: inputStudioRouterHistory,
    visualEditing,
    ...clientConfig
  } = integrationConfig
  const normalizedStudioBasePath = normalizeStudioBasePath(studioBasePath)
  const visualEditingOptions: VisualEditingOptions | undefined =
    visualEditing === 'draftMode' ? {} : visualEditing === 'disabled' ? undefined : visualEditing
  // Keep backwards compatibility: no visualEditing config means no preview routes.
  const previewMode = visualEditingOptions
    ? resolvePreviewModeConfig(visualEditingOptions.previewMode)
    : false

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  return {
    name: '@sanity/astro',
    hooks: {
      'astro:config:setup': ({config, injectScript, injectRoute, updateConfig}) => {
        const studioRouterHistory = resolveStudioRouterHistory(
          inputStudioRouterHistory,
          config?.output,
        )
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
                studioRouterHistory,
              }),
              vitePluginSanityStudioHashRouter(),
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
        if (previewMode) {
          injectRoute({
            // @ts-expect-error
            entryPoint: '@sanity/astro/visual-editing/draft-mode-enable.ts', // Astro <= 3
            entrypoint: '@sanity/astro/visual-editing/draft-mode-enable.ts', // Astro > 3
            pattern: previewMode.enable,
            prerender: false,
          })
          injectRoute({
            // @ts-expect-error
            entryPoint: '@sanity/astro/visual-editing/draft-mode-disable.ts', // Astro <= 3
            entrypoint: '@sanity/astro/visual-editing/draft-mode-disable.ts', // Astro > 3
            pattern: previewMode.disable,
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
