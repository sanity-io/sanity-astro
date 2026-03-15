import type {AstroIntegration} from 'astro'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {vitePluginSanityLoadQuery} from './vite-plugin-sanity-load-query'
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
  visualEditing?: 'enabled' | VisualEditingOptions
}

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

function resolveRootDir(root: unknown): string | undefined {
  if (typeof root === 'string') {
    return root
  }
  if (root && typeof root === 'object') {
    const maybeRoot = root as {href?: string; pathname?: string}
    if (typeof maybeRoot.pathname === 'string') {
      return decodeURIComponent(maybeRoot.pathname)
    }
    if (typeof maybeRoot.href === 'string') {
      try {
        const parsed = new URL(maybeRoot.href)
        return parsed.protocol === 'file:'
          ? decodeURIComponent(parsed.pathname)
          : maybeRoot.href
      } catch {
        return maybeRoot.href
      }
    }
  }

  return undefined
}

async function readTokenFromDotEnv(
  rootDir: string,
  fileName: '.env.local' | '.env',
): Promise<string | undefined> {
  try {
    const importModule = new Function(
      'specifier',
      'return import(specifier)',
    ) as <T>(specifier: string) => Promise<T>
    const [fs, path] = await Promise.all([
      importModule<{readFile: (path: string, encoding: BufferEncoding) => Promise<string>}>(
        'node:fs/promises',
      ),
      importModule<{join: (...parts: string[]) => string}>('node:path'),
    ])
    const {readFile} = fs
    const {join} = path
    const envFilePath = join(rootDir, fileName)
    const envFileContents = await readFile(envFilePath, 'utf8')
    const tokenMatch = envFileContents.match(/^SANITY_API_READ_TOKEN=(.*)$/m)
    return tokenMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  } catch {
    return undefined
  }
}

async function resolveVisualEditingToken(
  explicitToken: string | undefined,
  rootDir: string | undefined,
): Promise<string | undefined> {
  if (explicitToken) {
    return explicitToken
  }
  if (process.env.SANITY_API_READ_TOKEN) {
    return process.env.SANITY_API_READ_TOKEN
  }
  if (!rootDir) {
    return undefined
  }

  const cwd = rootDir || process.cwd()
  return (
    (await readTokenFromDotEnv(cwd, '.env.local')) ||
    (await readTokenFromDotEnv(cwd, '.env'))
  )
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
  const visualEditingOptions: VisualEditingOptions | undefined =
    visualEditing === 'enabled' ? {} : visualEditing
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
      'astro:config:setup': async ({config, injectScript, injectRoute, updateConfig}) => {
        const rootDir = resolveRootDir(config?.root)
        const visualEditingToken = await resolveVisualEditingToken(
          visualEditingOptions?.token,
          rootDir,
        )
        const visualEditingConfig: SanityVisualEditingConfig = {
          previewMode,
          previewModeId: previewMode ? createPreviewModeId() : undefined,
          token: visualEditingToken,
        }

        updateConfig({
          vite: {
            optimizeDeps: {
              include: [
                'react/compiler-runtime',
              ],
            },
            plugins: [
              vitePluginSanityClient({
                ...defaultClientConfig,
                ...clientConfig,
              }),
              vitePluginSanityLoadQuery(),
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
