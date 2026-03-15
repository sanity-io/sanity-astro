import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {
  type SanityVisualEditingConfig,
  vitePluginSanityVisualEditing,
} from './vite-plugin-sanity-visual-editing'
import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'
import {vitePluginSanityStudioHashRouter} from './vite-plugin-sanity-studio-hash-router'
import type {ClientConfig} from '@sanity/client'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'
import {resolvePreviewModeConfig} from './visual-editing/draft-mode'

type VisualEditingOptions = {
  token?: string
  previewMode?: boolean | {enable?: string; disable?: string; cookie?: string}
}

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
  visualEditing?: VisualEditingOptions
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

function createPreviewModeId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `sanity-preview-${Math.random().toString(36).slice(2)}`
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
  const studioRouterHistory = inputStudioRouterHistory === 'hash' ? 'hash' : 'browser'
  // Keep backwards compatibility: no visualEditing config means no preview routes.
  const previewMode = visualEditing ? resolvePreviewModeConfig(visualEditing.previewMode) : false
  const visualEditingToken = visualEditing?.token || process.env.SANITY_API_READ_TOKEN
  const visualEditingConfig: SanityVisualEditingConfig = {
    previewMode,
    previewModeId: previewMode ? createPreviewModeId() : undefined,
    token: visualEditingToken,
  }

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
              vitePluginSanityVisualEditing(visualEditingConfig),
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
