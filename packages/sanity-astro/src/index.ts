import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import type {ClientConfig} from '@sanity/client'
import type {AstroIntegration, AstroIntegrationLogger, HookParameters} from 'astro'

import {type GeneratedLoaderModule, generateLoaderModule} from './live/generate'
import {type LivePlan, resolveLivePlan, type SanityLiveOptions} from './live/options'
import {isSchemaInput, loadSchema, schemaWatchTargets} from './live/schema-source'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import {SANITY_LOADER_MODULE_ID, vitePluginSanityLoader} from './vite-plugin-sanity-loader'
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

type IntegrationOptions = ClientConfig & {
  studioBasePath?: string
  studioRouterHistory?: 'browser' | 'hash'
  logClientRequests?: 'dev' | 'build' | 'always'
  live?: SanityLiveOptions
}

interface LiveState {
  plan: LivePlan
  codegenDir: string
  module: GeneratedLoaderModule
  typesFile: URL | undefined
  startedStale: boolean
}

interface LiveSetupContext {
  root: string
  command: string
  createCodegenDir: (() => URL) | undefined
  logger: AstroIntegrationLogger
}

type DevServer = HookParameters<'astro:server:setup'>['server']

const defaultClientConfig: ClientConfig = {
  apiVersion: 'v2023-08-24',
}

const SCHEMA_WATCH_EVENTS = new Set(['add', 'change', 'unlink'])
const SCHEMA_WATCH_DEBOUNCE_MS = 500

function resolveStudioRouterHistory(
  inputStudioRouterHistory: 'browser' | 'hash' | undefined,
  output: unknown,
): 'browser' | 'hash' {
  if (inputStudioRouterHistory === 'hash' || inputStudioRouterHistory === 'browser') {
    return inputStudioRouterHistory
  }

  return output === 'static' ? 'hash' : 'browser'
}

async function setupLive(options: SanityLiveOptions, ctx: LiveSetupContext): Promise<LiveState> {
  if (typeof ctx.createCodegenDir !== 'function') {
    throw new Error('[@sanity/astro] The live option requires Astro 6 or later')
  }
  const plan = resolveLivePlan(options, ctx.root)
  const codegenDir = fileURLToPath(ctx.createCodegenDir())
  const {schema, stale} = await loadSchema(plan.source, {
    codegenDir,
    allowStale: ctx.command === 'dev',
    logger: ctx.logger,
  })
  const module = generateLoaderModule(schema, plan)
  for (const warning of module.warnings) {
    ctx.logger.warn(warning)
  }
  return {plan, codegenDir, module, typesFile: undefined, startedStale: stale}
}

function watchSchema(state: LiveState, server: DevServer, logger: AstroIntegrationLogger): void {
  const {plan, codegenDir} = state
  for (const target of schemaWatchTargets(plan.source)) {
    server.watcher.add(target)
  }

  let running = false
  let pending = false
  const regenerate = async (): Promise<void> => {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      const {schema} = await loadSchema(plan.source, {codegenDir, allowStale: false, logger})
      const module = generateLoaderModule(schema, plan)
      if (module.fingerprint === state.module.fingerprint) {
        return
      }
      state.module = module
      for (const warning of module.warnings) {
        logger.warn(warning)
      }
      if (state.typesFile) {
        await writeFile(state.typesFile, module.types)
      }
      const loaderModule = server.moduleGraph.getModuleById(SANITY_LOADER_MODULE_ID)
      if (loaderModule) {
        server.moduleGraph.invalidateModule(loaderModule)
      }
      ;(server.hot ?? server.ws).send({type: 'full-reload'})
      logger.info(`Regenerated sanity:loader (${plan.loaders.length} loaders)`)
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error))
    } finally {
      running = false
      if (pending) {
        pending = false
        void regenerate()
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  server.watcher.on('all', (event, changedPath) => {
    if (!SCHEMA_WATCH_EVENTS.has(event) || !isSchemaInput(plan.source, changedPath)) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void regenerate(), SCHEMA_WATCH_DEBOUNCE_MS)
  })

  // Vite re-runs astro:server:setup on its own restarts (.env changes) with this same state, so the
  // flag is consumed to refresh the warm start exactly once.
  if (state.startedStale) {
    state.startedStale = false
    void regenerate()
  }
}

export default function sanityIntegration(
  integrationConfig: IntegrationOptions = {},
): AstroIntegration {
  const studioBasePath = integrationConfig.studioBasePath
  const normalizedStudioBasePath = normalizeStudioBasePath(studioBasePath)
  const inputStudioRouterHistory = integrationConfig.studioRouterHistory
  const logClientRequests = integrationConfig.logClientRequests
  const liveOptions = integrationConfig.live
  const clientConfig = integrationConfig
  delete clientConfig.studioBasePath
  delete clientConfig.studioRouterHistory
  delete clientConfig.logClientRequests
  delete clientConfig.live

  if (!!studioBasePath && studioBasePath.match(/https?:\/\//)) {
    throw new Error(
      "[@sanity/astro]: The `studioBasePath` option should be a relative URL. For example — `studioBasePath: '/admin'`",
    )
  }

  let live: LiveState | undefined

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
          inputStudioRouterHistory,
          config?.output,
        )
        if (liveOptions) {
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
          vitePluginSanityClient(
            {
              ...defaultClientConfig,
              ...clientConfig,
            },
            {logClientRequests},
          ),
          vitePluginSanityLoader({getSource: () => live?.module.runtime}),
          vitePluginSanityStudio({
            studioBasePath: normalizedStudioBasePath,
            studioRouterHistory,
          }),
          vitePluginSanityStudioHashRouter(),
          vitePluginSanityStudioChunkWarning(),
        ]

        updateConfig({
          vite: {
            plugins: vitePlugins,
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
      },
      'astro:config:done': async ({injectTypes}) => {
        if (live) {
          live.typesFile = injectTypes({
            filename: 'sanity-loader.d.ts',
            content: live.module.types,
          })
          // Astro only writes injected types during sync, which a config-triggered dev restart
          // skips, so the file is written here as well to keep the declarations current.
          await writeFile(live.typesFile, live.module.types)
        }
      },
      'astro:server:setup': ({server, logger}) => {
        if (live) {
          watchSchema(live, server, logger)
        }
      },
    },
  }
}
