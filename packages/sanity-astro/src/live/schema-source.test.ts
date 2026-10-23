import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import type {SchemaType} from 'groq-js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {JsonSchemaSource, StudioSchemaSource} from './options'
import {
  loadSchema,
  type SchemaExtractor,
  type SchemaLoadContext,
  schemaWatch,
} from './schema-source'

const fixturePath = fileURLToPath(new URL('./__fixtures__/movies-schema.json', import.meta.url))
const packageRoot = fileURLToPath(new URL('../..', import.meta.url))

const minimalSchema: SchemaType = [
  {type: 'document', name: 'movie', attributes: {}},
  {type: 'type', name: 'slug', value: {type: 'object', attributes: {}}},
]

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sanity-astro-schema-'))
})

afterEach(async () => {
  await rm(dir, {recursive: true, force: true})
})

function logger() {
  return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

function context(allowStale: boolean): SchemaLoadContext & {logger: ReturnType<typeof logger>} {
  return {codegenDir: join(dir, 'codegen'), allowStale, logger: logger()}
}

function studio(overrides: Partial<StudioSchemaSource> = {}): StudioSchemaSource {
  return {
    kind: 'studio',
    configPath: join(dir, 'studio', 'sanity.config.ts'),
    studioRoot: join(dir, 'studio'),
    enforceRequiredFields: false,
    watchPatterns: ['lib/**/*.ts'],
    ...overrides,
  }
}

function fakeExtractor(schema: SchemaType = minimalSchema) {
  return vi.fn<SchemaExtractor>(async (_source, outputPath) => {
    await mkdir(join(outputPath, '..'), {recursive: true})
    await writeFile(outputPath, JSON.stringify(schema))
    return schema
  })
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, JSON.stringify(value))
}

/**
 * A `sanity` install next to the studio config, resolving to `@sanity/cli` and, unless `cliBuild`
 * is false, to a stub of `@sanity/cli-build/_internal/extract` and the CLI's watcher module
 * (omitted when `defaultWatchPatterns` is false).
 */
async function fakeSanityInstall({
  sanity = '5.31.0',
  cli = '6.7.2',
  cliBuild = true,
  cliBuildVersion = '0.2.2',
  extractExport = true,
  defaultWatchPatterns = ['schemaTypes/movie.ts'],
}: {
  sanity?: string
  cli?: string
  cliBuild?: boolean
  cliBuildVersion?: string
  /** Whether `@sanity/cli-build` exports `./_internal/extract` (it does from 0.2.0 on). */
  extractExport?: boolean
  defaultWatchPatterns?: string[] | false
} = {}) {
  const modules = join(dir, 'studio', 'node_modules')
  await writeJson(join(modules, 'sanity', 'package.json'), {name: 'sanity', version: sanity})
  await writeJson(join(modules, '@sanity', 'cli', 'package.json'), {
    name: '@sanity/cli',
    version: cli,
    exports: {'./package.json': './package.json'},
  })
  if (!cliBuild) {
    return
  }
  if (defaultWatchPatterns) {
    const watcherModule = join(modules, '@sanity', 'cli', 'dist', 'actions', 'schema')
    await mkdir(watcherModule, {recursive: true})
    await writeFile(
      join(watcherModule, 'extractSchemaWatcher.js'),
      `export const DEFAULT_WATCH_PATTERNS = ${JSON.stringify(defaultWatchPatterns)}\n`,
    )
  }
  await writeJson(join(modules, '@sanity', 'cli-build', 'package.json'), {
    name: '@sanity/cli-build',
    version: cliBuildVersion,
    type: 'module',
    exports: {
      ...(extractExport ? {'./_internal/extract': './extract.js'} : {}),
      './package.json': './package.json',
    },
  })
  await writeFile(
    join(modules, '@sanity', 'cli-build', 'extract.js'),
    `
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, relative} from 'node:path'
export class SchemaExtractionError extends Error {
  constructor(message, validation) {
    super(message)
    this.name = 'SchemaExtractionError'
    this.validation = validation
  }
}
export async function runSchemaExtraction({outputPath}) {
  if (process.env.FAKE_EXTRACT_FAILS) {
    throw new SchemaExtractionError('Schema validation failed', [
      {path: [{kind: 'type', type: 'document', name: 'movie'}], problems: [{severity: 'error', message: 'Missing title'}]},
    ])
  }
  const schema = ${JSON.stringify(minimalSchema)}
  await mkdir(dirname(outputPath), {recursive: true})
  await writeFile(outputPath, JSON.stringify(schema))
  return schema
}
export function formatSchemaValidation(validation) {
  return validation.map((group) => '[' + group.path[0].name + '] ' + group.problems.map((p) => p.message).join(', ')).join('\\n')
}
export async function extractValidationFromSchemaError() {
  return undefined
}
export function createSchemaPatternMatcher(patterns) {
  return {isMatch: (filePath, workDir) => patterns.includes(relative(workDir, filePath))}
}
`,
  )
}

describe('loadSchema with a json source', () => {
  it('reads and validates an extracted schema', async () => {
    const source: JsonSchemaSource = {kind: 'json', path: fixturePath}
    const loaded = await loadSchema(source, context(true))
    expect(loaded.stale).toBe(false)
    expect(loaded.schema.length).toBe(23)
  })

  it('names the path when the file is missing', async () => {
    const path = join(dir, 'missing.json')
    await expect(loadSchema({kind: 'json', path}, context(false))).rejects.toThrow(
      `[@sanity/astro] Could not read the Sanity schema at ${path}`,
    )
  })

  it('rejects files that are not extracted schemas', async () => {
    const notArray = join(dir, 'object.json')
    await writeFile(notArray, '{"movie": {}}')
    await expect(loadSchema({kind: 'json', path: notArray}, context(false))).rejects.toThrow(
      `[@sanity/astro] ${notArray} is not a Sanity schema: expected an array of document and type entries. It must be produced by "sanity schema extract".`,
    )

    const badEntries = join(dir, 'entries.json')
    await writeFile(badEntries, '[{"type": "widget", "name": "x"}]')
    await expect(loadSchema({kind: 'json', path: badEntries}, context(false))).rejects.toThrow(
      /is not a Sanity schema/,
    )

    const invalid = join(dir, 'invalid.json')
    await writeFile(invalid, '{oops')
    await expect(loadSchema({kind: 'json', path: invalid}, context(false))).rejects.toThrow(
      /is not valid JSON/,
    )
  })
})

describe('loadSchema with a studio source', () => {
  it('extracts into <codegenDir>/schema.json and logs timings', async () => {
    const extract = fakeExtractor()
    const ctx = context(false)

    const loaded = await loadSchema(studio(), ctx, extract)

    expect(loaded).toEqual({schema: minimalSchema, stale: false})
    expect(extract).toHaveBeenCalledTimes(1)
    expect(extract.mock.calls[0][1]).toBe(join(ctx.codegenDir, 'schema.json'))
    expect(ctx.logger.info.mock.calls[0][0]).toMatch(
      /^Extracting Sanity schema from .*sanity\.config\.ts\.\.\.$/,
    )
    expect(ctx.logger.info.mock.calls[1][0]).toMatch(
      /^Extracted Sanity schema \(2 types\) in \d+ms$/,
    )
  })

  it('reuses a previous extraction when allowed and skips the extractor', async () => {
    const ctx = context(true)
    await mkdir(ctx.codegenDir, {recursive: true})
    await writeFile(join(ctx.codegenDir, 'schema.json'), JSON.stringify(minimalSchema))
    const extract = fakeExtractor()

    const loaded = await loadSchema(studio(), ctx, extract)

    expect(loaded).toEqual({schema: minimalSchema, stale: true})
    expect(extract).not.toHaveBeenCalled()
    expect(ctx.logger.info).toHaveBeenCalledWith(
      'Using the previously extracted Sanity schema (2 types); re-extracting in the background',
    )
  })

  it('always extracts when previous results are not allowed', async () => {
    const ctx = context(false)
    await mkdir(ctx.codegenDir, {recursive: true})
    await writeFile(join(ctx.codegenDir, 'schema.json'), JSON.stringify(minimalSchema))
    const extract = fakeExtractor([{type: 'document', name: 'fresh', attributes: {}}])

    const loaded = await loadSchema(studio(), ctx, extract)

    expect(extract).toHaveBeenCalledTimes(1)
    expect(loaded.stale).toBe(false)
    expect(loaded.schema[0].name).toBe('fresh')
  })

  it('extracts when previous results are allowed but none exist', async () => {
    const extract = fakeExtractor()
    const ctx = context(true)
    const loaded = await loadSchema(studio(), ctx, extract)
    expect(extract).toHaveBeenCalledTimes(1)
    expect(loaded.stale).toBe(false)
    expect(await readFile(join(ctx.codegenDir, 'schema.json'), 'utf8')).toBe(
      JSON.stringify(minimalSchema),
    )
  })

  it('ignores a corrupt previous extraction with a warning', async () => {
    const ctx = context(true)
    await mkdir(ctx.codegenDir, {recursive: true})
    await writeFile(join(ctx.codegenDir, 'schema.json'), '{"not": "a schema"}')
    const extract = fakeExtractor()

    const loaded = await loadSchema(studio(), ctx, extract)

    expect(loaded.stale).toBe(false)
    expect(extract).toHaveBeenCalledTimes(1)
    expect(ctx.logger.warn.mock.calls[0][0]).toMatch(/^Ignoring the previously extracted schema: /)
  })

  it('propagates extractor errors', async () => {
    const extract = vi.fn<SchemaExtractor>(async () => {
      throw new Error('[@sanity/astro] Sanity schema extraction failed: boom')
    })
    await expect(loadSchema(studio(), context(false), extract)).rejects.toThrow(
      '[@sanity/astro] Sanity schema extraction failed: boom',
    )
  })
})

describe('loadSchema with the installed sanity', () => {
  it('points at the schema.json workflow when sanity is not installed next to the config', async () => {
    await expect(loadSchema(studio(), context(false))).rejects.toThrow(
      /Could not find the "sanity" package next to .*sanity\.config\.ts\. Install it there, or run "npx sanity schema extract"/,
    )
  })

  it('names both installed versions when the extraction API is missing', async () => {
    const floor =
      '[@sanity/astro] Automatic schema extraction needs sanity 5.29 or later (@sanity/cli 6.7 or later); found sanity 5.10.0 with @sanity/cli 6.6.0. Upgrade sanity, or run "npx sanity schema extract"'
    await fakeSanityInstall({sanity: '5.10.0', cli: '6.6.0', cliBuild: false})
    await expect(loadSchema(studio(), context(false))).rejects.toThrow(floor)

    await fakeSanityInstall({
      sanity: '5.10.0',
      cli: '6.6.0',
      cliBuildVersion: '0.1.5',
      extractExport: false,
    })
    await expect(loadSchema(studio(), context(false))).rejects.toThrow(floor)
  })

  it('runs the extraction exported by the installed @sanity/cli-build', async () => {
    await fakeSanityInstall()
    const ctx = context(false)
    const loaded = await loadSchema(studio(), ctx)
    expect(loaded).toEqual({schema: minimalSchema, stale: false})
    expect(await readFile(join(ctx.codegenDir, 'schema.json'), 'utf8')).toBe(
      JSON.stringify(minimalSchema),
    )
  })

  it('formats validation problems the way sanity schema extract does', async () => {
    await fakeSanityInstall()
    vi.stubEnv('FAKE_EXTRACT_FAILS', '1')
    try {
      await expect(loadSchema(studio(), context(false))).rejects.toThrow(
        '[@sanity/astro] Sanity schema extraction failed: Schema validation failed\n[movie] Missing title',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('schemaWatch', () => {
  it('watches only the json file for json sources', async () => {
    const path = join(dir, 'schema.json')
    const watch = await schemaWatch({kind: 'json', path})
    expect(watch.roots).toEqual([path])
    expect(watch.isInput(path)).toBe(true)
    expect(watch.isInput(join(dir, 'other.json'))).toBe(false)
  })

  it('combines the CLI default patterns with the user patterns and matches through the CLI matcher', async () => {
    await fakeSanityInstall({defaultWatchPatterns: ['schemaTypes/movie.ts']})
    const source = studio({watchPatterns: ['lib/shared.ts', '../shared/**/*.ts']})

    const watch = await schemaWatch(source)

    expect(watch.roots).toEqual([source.studioRoot, resolve(source.studioRoot, '../shared')])
    expect(watch.isInput(join(source.studioRoot, 'schemaTypes', 'movie.ts'))).toBe(true)
    expect(watch.isInput(join(source.studioRoot, 'lib', 'shared.ts'))).toBe(true)
    expect(watch.isInput(source.configPath)).toBe(true)
    expect(watch.isInput(join(source.studioRoot, 'schemaTypes', 'person.ts'))).toBe(false)
  })

  it('fails loudly when the installed CLI does not define its default patterns', async () => {
    await fakeSanityInstall({defaultWatchPatterns: false})
    await expect(schemaWatch(studio())).rejects.toThrow(
      /Could not load the schema watch patterns of @sanity\/cli 6\.7\.2 from .*extractSchemaWatcher\.js/,
    )
  })

  it('uses the real patterns and matcher of the sanity install next to the config', async () => {
    const source = studio({
      configPath: join(packageRoot, 'sanity.config.ts'),
      studioRoot: packageRoot,
      watchPatterns: ['../shared/**/*.ts'],
    })

    const watch = await schemaWatch(source)

    expect(watch.roots).toEqual([packageRoot, resolve(packageRoot, '../shared')])
    for (const path of [
      'sanity.config.ts',
      'schemaTypes/movie.ts',
      'schemas/nested/deep.tsx',
      '../shared/fragments.ts',
    ]) {
      expect(watch.isInput(join(packageRoot, path)), path).toBe(true)
    }
    for (const path of [
      'schemaTypes/notes.md',
      'schema.json',
      'src/pages/index.astro',
      '../shared/data/countries.json',
      'node_modules/sanity/schema.js',
    ]) {
      expect(watch.isInput(join(packageRoot, path)), path).toBe(false)
    }
  })
})
