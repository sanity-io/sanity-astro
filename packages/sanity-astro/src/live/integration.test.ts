import {EventEmitter} from 'node:events'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import type {AstroIntegrationLogger} from 'astro'
import type {SchemaType} from 'groq-js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {SANITY_LOADER_MODULE_ID} from '../vite-plugin-sanity-loader'
import {generateLoaderModule} from './generate'
import {type LiveState, SCHEMA_WATCH_DEBOUNCE_MS, setupLive, watchSchema} from './integration'
import {resolveLivePlan, type SanityLiveOptions} from './options'
import type {SchemaExtractor, SchemaTools} from './schema-source'

function movieSchema(titleType: 'string' | 'number'): SchemaType {
  return [
    {
      type: 'document',
      name: 'movie',
      attributes: {
        _id: {type: 'objectAttribute', value: {type: 'string'}},
        _type: {type: 'objectAttribute', value: {type: 'string', value: 'movie'}},
        _updatedAt: {type: 'objectAttribute', value: {type: 'string'}},
        title: {type: 'objectAttribute', value: {type: titleType}},
      },
    },
  ]
}

const schemaPath = '/app/schema.json'
const plan = resolveLivePlan(
  {schema: schemaPath, loaders: {movie: {type: 'movie', projection: 'title'}}},
  '/app',
)

function fakeLogger() {
  return {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()}
}

type FakeLogger = ReturnType<typeof fakeLogger>

function asLogger(logger: FakeLogger): AstroIntegrationLogger {
  return logger as unknown as AstroIntegrationLogger
}

function fakeServer() {
  const watcher = Object.assign(new EventEmitter(), {add: vi.fn()})
  const loaderModule = {id: SANITY_LOADER_MODULE_ID}
  const server = {
    watcher,
    moduleGraph: {
      getModuleById: vi.fn((id: string) =>
        id === SANITY_LOADER_MODULE_ID ? loaderModule : undefined,
      ),
      invalidateModule: vi.fn(),
    },
    hot: {send: vi.fn()},
  }
  return {
    server,
    loaderModule,
    change: (path: string, event = 'change') => watcher.emit('all', event, path),
  }
}

function liveState(overrides: Partial<LiveState> = {}): LiveState {
  return {
    plan,
    module: generateLoaderModule(movieSchema('string'), plan),
    typesFile: undefined,
    reload: vi.fn(async () => movieSchema('string')),
    refresh: undefined,
    watch: async () => ({roots: [schemaPath], isInput: (path) => path === schemaPath}),
    ...overrides,
  }
}

async function debounce() {
  await vi.advanceTimersByTimeAsync(SCHEMA_WATCH_DEBOUNCE_MS)
}

describe('watchSchema', () => {
  let logger: FakeLogger

  beforeEach(() => {
    vi.useFakeTimers()
    logger = fakeLogger()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('attaches the watcher to the schema roots', async () => {
    const {server} = fakeServer()
    await watchSchema(liveState(), server, asLogger(logger))
    expect(server.watcher.add).toHaveBeenCalledWith(schemaPath)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('regenerates once after the debounce, invalidates sanity:loader and reloads the page', async () => {
    const {server, loaderModule, change} = fakeServer()
    const state = liveState({reload: vi.fn(async () => movieSchema('number'))})
    await watchSchema(state, server, asLogger(logger))

    change(schemaPath)
    change(schemaPath)
    await vi.advanceTimersByTimeAsync(SCHEMA_WATCH_DEBOUNCE_MS - 1)
    change(schemaPath)
    await vi.advanceTimersByTimeAsync(SCHEMA_WATCH_DEBOUNCE_MS - 1)
    expect(state.reload).not.toHaveBeenCalled()

    await debounce()
    await vi.waitFor(() => expect(server.hot.send).toHaveBeenCalledTimes(1))

    expect(state.reload).toHaveBeenCalledTimes(1)
    expect(state.module.types).toContain('title: number;')
    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(loaderModule)
    expect(server.hot.send).toHaveBeenCalledWith({type: 'full-reload'})
    expect(logger.info).toHaveBeenCalledWith('Regenerated sanity:loader (1 loaders)')
  })

  it('rewrites the injected types file when the module changes', async () => {
    vi.useRealTimers()
    const dir = await mkdtemp(join(tmpdir(), 'sanity-astro-live-'))
    try {
      const typesPath = join(dir, 'sanity-loader.d.ts')
      const {server} = fakeServer()
      const state = liveState({
        typesFile: pathToFileURL(typesPath),
        refresh: Promise.resolve(movieSchema('number')),
      })
      await watchSchema(state, server, asLogger(logger))
      await vi.waitFor(() => expect(server.hot.send).toHaveBeenCalledTimes(1))
      expect(await readFile(typesPath, 'utf8')).toBe(state.module.types)
      expect(state.module.types).toContain('title: number;')
    } finally {
      await rm(dir, {recursive: true, force: true})
    }
  })

  it('ignores files outside the schema inputs and non-content events', async () => {
    const {server, change} = fakeServer()
    const state = liveState()
    await watchSchema(state, server, asLogger(logger))

    change('/app/src/pages/index.astro')
    change(schemaPath, 'addDir')
    await debounce()
    await debounce()

    expect(state.reload).not.toHaveBeenCalled()
    expect(server.hot.send).not.toHaveBeenCalled()
  })

  it('coalesces changes that arrive during a regeneration into one more run', async () => {
    const {server, change} = fakeServer()
    let release!: () => void
    const slow = new Promise<SchemaType>((resolve) => {
      release = () => resolve(movieSchema('number'))
    })
    const reload = vi
      .fn<() => Promise<SchemaType>>()
      .mockReturnValueOnce(slow)
      .mockResolvedValue(movieSchema('string'))
    const state = liveState({reload})
    await watchSchema(state, server, asLogger(logger))

    change(schemaPath)
    await debounce()
    expect(reload).toHaveBeenCalledTimes(1)

    change(schemaPath)
    await debounce()
    change(schemaPath)
    await debounce()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(server.hot.send).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(server.hot.send).toHaveBeenCalledTimes(2))
    expect(reload).toHaveBeenCalledTimes(2)
    expect(state.module.types).toContain('title: string;')

    await debounce()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload the page when the regenerated module is unchanged', async () => {
    const {server, change} = fakeServer()
    const state = liveState()
    await watchSchema(state, server, asLogger(logger))

    change(schemaPath)
    await debounce()
    await vi.waitFor(() => expect(state.reload).toHaveBeenCalledTimes(1))
    await debounce()

    expect(server.moduleGraph.invalidateModule).not.toHaveBeenCalled()
    expect(server.hot.send).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('keeps the previous module and logs the error when a reload fails', async () => {
    const {server, change} = fakeServer()
    const reload = vi
      .fn<() => Promise<SchemaType>>()
      .mockRejectedValueOnce(new Error('[@sanity/astro] Sanity schema extraction failed: boom'))
      .mockResolvedValue(movieSchema('number'))
    const state = liveState({reload})
    const before = state.module
    await watchSchema(state, server, asLogger(logger))

    change(schemaPath)
    await debounce()
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        '[@sanity/astro] Sanity schema extraction failed: boom',
      ),
    )
    expect(state.module).toBe(before)
    expect(server.hot.send).not.toHaveBeenCalled()

    change(schemaPath)
    await debounce()
    await vi.waitFor(() => expect(server.hot.send).toHaveBeenCalledTimes(1))
    expect(state.module.types).toContain('title: number;')
  })

  it('applies the warm-start refresh exactly once across server setups', async () => {
    const first = fakeServer()
    const state = liveState({refresh: Promise.resolve(movieSchema('number'))})

    await watchSchema(state, first.server, asLogger(logger))
    await vi.waitFor(() => expect(first.server.hot.send).toHaveBeenCalledTimes(1))
    expect(state.refresh).toBeUndefined()
    expect(state.module.types).toContain('title: number;')

    const second = fakeServer()
    await watchSchema(state, second.server, asLogger(logger))
    await debounce()

    expect(second.server.watcher.add).toHaveBeenCalledWith(schemaPath)
    expect(second.server.hot.send).not.toHaveBeenCalled()
    expect(state.reload).not.toHaveBeenCalled()
  })

  it('reports a failed warm-start refresh and keeps serving the previous schema', async () => {
    const {server} = fakeServer()
    const refresh = Promise.reject(
      new Error('[@sanity/astro] Sanity schema extraction failed: nope'),
    )
    refresh.catch(() => undefined)
    const state = liveState({refresh})
    const before = state.module

    await watchSchema(state, server, asLogger(logger))
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        '[@sanity/astro] Sanity schema extraction failed: nope',
      ),
    )
    expect(state.module).toBe(before)
    expect(server.hot.send).not.toHaveBeenCalled()
  })

  it('warns and skips watching when the watch rule cannot be resolved', async () => {
    const {server, change} = fakeServer()
    const state = liveState({
      watch: async () => {
        throw new Error(
          '[@sanity/astro] Could not load the schema watch patterns of @sanity/cli 9.0.0',
        )
      },
    })

    await watchSchema(state, server, asLogger(logger))
    change(schemaPath)
    await debounce()

    expect(logger.warn).toHaveBeenCalledWith(
      'Schema changes will not be watched: [@sanity/astro] Could not load the schema watch patterns of @sanity/cli 9.0.0',
    )
    expect(server.watcher.add).not.toHaveBeenCalled()
    expect(state.reload).not.toHaveBeenCalled()
  })
})

describe('setupLive', () => {
  let dir: string
  let logger: FakeLogger

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sanity-astro-setup-'))
    logger = fakeLogger()
  })

  afterEach(async () => {
    await rm(dir, {recursive: true, force: true})
  })

  function options(): SanityLiveOptions {
    return {
      schema: './studio/sanity.config.ts',
      loaders: {movie: {type: 'movie', projection: 'title'}},
    }
  }

  function tools(extract: SchemaExtractor): SchemaTools {
    return {extract, watch: async () => ({roots: [], isInput: () => false})}
  }

  function extractor(schema: SchemaType) {
    return vi.fn<SchemaExtractor>(async (_source, outputPath) => {
      await mkdir(join(outputPath, '..'), {recursive: true})
      await writeFile(outputPath, JSON.stringify(schema))
      return schema
    })
  }

  function context(command: 'dev' | 'build' | 'sync') {
    return {
      root: dir,
      command,
      createCodegenDir: () => pathToFileURL(`${join(dir, 'codegen')}/`),
      logger: asLogger(logger),
    }
  }

  async function writeAstroVersion(version: string) {
    const astroDir = join(dir, 'node_modules', 'astro')
    await mkdir(astroDir, {recursive: true})
    await writeFile(join(astroDir, 'package.json'), JSON.stringify({name: 'astro', version}))
  }

  it('extracts and generates the module on build', async () => {
    const extract = extractor(movieSchema('string'))
    const state = await setupLive(options(), context('build'), tools(extract))

    expect(extract).toHaveBeenCalledTimes(1)
    expect(extract.mock.calls[0][1]).toBe(join(dir, 'codegen', 'schema.json'))
    expect(state.refresh).toBeUndefined()
    expect(state.module.runtime).toContain('export const movieLoader = (options = {}) =>')
    expect(state.module.types).toContain('title: string;')
    expect(state.plan.loaders[0].key).toBe('movie')
  })

  it('starts from the previous extraction in dev and refreshes in the background', async () => {
    await mkdir(join(dir, 'codegen'), {recursive: true})
    await writeFile(join(dir, 'codegen', 'schema.json'), JSON.stringify(movieSchema('string')))
    const extract = extractor(movieSchema('number'))

    const state = await setupLive(options(), context('dev'), tools(extract))

    expect(state.module.types).toContain('title: string;')
    expect(state.refresh).toBeDefined()
    expect(await state.refresh).toEqual(movieSchema('number'))
    expect(extract).toHaveBeenCalledTimes(1)
    expect(await state.reload()).toEqual(movieSchema('number'))
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('requires Astro 6 or later', async () => {
    await writeAstroVersion('5.11.1')
    await expect(
      setupLive(options(), context('build'), tools(extractor(movieSchema('string')))),
    ).rejects.toThrow(
      '[@sanity/astro] The `experimental_live` option requires Astro 6 or later (found astro 5.11.1)',
    )

    await writeAstroVersion('6.0.0')
    await expect(
      setupLive(options(), context('build'), tools(extractor(movieSchema('string')))),
    ).resolves.toBeDefined()
  })
})
