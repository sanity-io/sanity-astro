import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import type {AstroIntegrationLogger, HookParameters} from 'astro'
import type {SchemaType} from 'groq-js'

import {SANITY_LOADER_MODULE_ID} from '../vite-plugin-sanity-loader'
import {fail} from './errors'
import {type GeneratedLoaderModule, generateLoaderModule, sameLoaderModule} from './generate'
import {LIVE_OPTION, type LivePlan, resolveLivePlan, type SanityLiveOptions} from './options'
import {findInstalledPackage} from './packages'
import {
  installedSanity,
  loadSchema,
  type SchemaTools,
  type SchemaWatch,
  schemaWatch,
} from './schema-source'

export interface LiveState {
  plan: LivePlan
  module: GeneratedLoaderModule
  /** Set by `astro:config:done`; rewritten whenever the module changes in dev. */
  typesFile: URL | undefined
  /** Re-reads or re-extracts the schema. */
  reload: () => Promise<SchemaType>
  /**
   * Background re-extraction started by a warm dev start, applied by `watchSchema` the first time
   * it runs and then cleared.
   */
  refresh: Promise<SchemaType> | undefined
  watch: () => Promise<SchemaWatch>
}

export interface LiveSetupContext {
  root: string
  command: HookParameters<'astro:config:setup'>['command']
  createCodegenDir: () => URL
  logger: AstroIntegrationLogger
}

/** The part of Vite's dev server the schema watcher uses. */
export interface LiveDevServer {
  watcher: {
    add(path: string): unknown
    on(event: 'all', listener: (event: string, path: string) => void): unknown
  }
  moduleGraph: {
    getModuleById(id: string): object | undefined
    invalidateModule(module: object): void
  }
  hot: {send(payload: {type: 'full-reload'}): void}
}

const MIN_ASTRO_MAJOR = 6
const SCHEMA_WATCH_EVENTS = new Set(['add', 'change', 'unlink'])
export const SCHEMA_WATCH_DEBOUNCE_MS = 500

// Live collections exist from Astro 6 on; the hooks themselves look the same on Astro 5.
function assertAstroVersion(root: string): void {
  const astro = findInstalledPackage('astro', root)
  if (!astro) {
    return
  }
  const major = Number.parseInt(astro.version, 10)
  if (Number.isFinite(major) && major < MIN_ASTRO_MAJOR) {
    fail(
      `The \`${LIVE_OPTION}\` option requires Astro ${MIN_ASTRO_MAJOR} or later (found astro ${astro.version})`,
    )
  }
}

function logWarnings(logger: AstroIntegrationLogger, module: GeneratedLoaderModule): void {
  for (const warning of module.warnings) {
    logger.warn(warning)
  }
}

export async function setupLive(
  options: SanityLiveOptions,
  ctx: LiveSetupContext,
  tools: SchemaTools = installedSanity,
): Promise<LiveState> {
  assertAstroVersion(ctx.root)
  const plan = resolveLivePlan(options, ctx.root)
  const codegenDir = fileURLToPath(ctx.createCodegenDir())
  const load = (allowStale: boolean) =>
    loadSchema(plan.source, {codegenDir, allowStale, logger: ctx.logger}, tools.extract)
  let {schema, stale} = await load(ctx.command === 'dev')
  let module: GeneratedLoaderModule
  try {
    module = generateLoaderModule(schema, plan)
  } catch (error) {
    // Warm-start cache can predate a new/renamed loader type; extract fresh instead of aborting.
    if (!stale) {
      throw error
    }
    ctx.logger.warn(
      `Previously extracted schema is incompatible with the current loaders; extracting a fresh schema`,
    )
    ;({schema, stale} = await load(false))
    module = generateLoaderModule(schema, plan)
  }
  logWarnings(ctx.logger, module)
  const reload = () => load(false).then((loaded) => loaded.schema)
  const refresh = stale ? reload() : undefined
  // Reported when applied; without this a dev server that never reaches astro:server:setup
  // would crash on an unhandled rejection instead.
  refresh?.catch(() => undefined)
  return {
    plan,
    module,
    typesFile: undefined,
    reload,
    refresh,
    watch: () => schemaWatch(plan.source, tools),
  }
}

export async function watchSchema(
  state: LiveState,
  server: LiveDevServer,
  logger: AstroIntegrationLogger,
): Promise<void> {
  let running = false
  let pending = false
  const apply = async (load: () => Promise<SchemaType>): Promise<void> => {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      const module = generateLoaderModule(await load(), state.plan)
      if (sameLoaderModule(module, state.module)) {
        return
      }
      state.module = module
      logWarnings(logger, module)
      if (state.typesFile) {
        await writeFile(state.typesFile, module.types)
      }
      const loaderModule = server.moduleGraph.getModuleById(SANITY_LOADER_MODULE_ID)
      if (loaderModule) {
        server.moduleGraph.invalidateModule(loaderModule)
      }
      server.hot.send({type: 'full-reload'})
      logger.info(`Regenerated sanity:loader (${state.plan.loaders.length} loaders)`)
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error))
    } finally {
      running = false
      if (pending) {
        pending = false
        void apply(state.reload)
      }
    }
  }

  // Vite restarts that re-run astro:server:setup with the same state must not apply the warm-start
  // refresh again, so it is taken off the state before anything awaits.
  const {refresh} = state
  state.refresh = undefined
  if (refresh) {
    void apply(() => refresh)
  }

  let watch: SchemaWatch
  try {
    watch = await state.watch()
  } catch (error) {
    logger.warn(
      `Schema changes will not be watched: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }
  for (const root of watch.roots) {
    server.watcher.add(root)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  server.watcher.on('all', (event, path) => {
    if (!SCHEMA_WATCH_EVENTS.has(event) || !watch.isInput(path)) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void apply(state.reload), SCHEMA_WATCH_DEBOUNCE_MS)
  })
}
