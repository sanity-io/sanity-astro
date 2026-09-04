import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import type {SchemaType} from 'groq-js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {JsonSchemaSource, StudioSchemaSource} from './options'
import {
  isSchemaInput,
  loadSchema,
  type SchemaExtractor,
  type SchemaLoadContext,
  schemaWatchTargets,
} from './schema-source'

const fixturePath = fileURLToPath(new URL('./__fixtures__/movies-schema.json', import.meta.url))

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
    watchPaths: [join(dir, 'shared')],
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

describe('isSchemaInput', () => {
  it('accepts schema files, the config file and watched paths', () => {
    const source = studio()
    expect(isSchemaInput(source, join(dir, 'studio', 'schemaTypes', 'movie.ts'))).toBe(true)
    expect(isSchemaInput(source, join(dir, 'studio', 'schemas', 'nested', 'deep.tsx'))).toBe(true)
    expect(isSchemaInput(source, join(dir, 'studio', 'sanity.config.ts'))).toBe(true)
    expect(isSchemaInput(source, join(dir, 'shared', 'fragments.ts'))).toBe(true)
    expect(isSchemaInput(source, join(dir, 'shared', 'data', 'countries.json'))).toBe(true)
  })

  it('rejects unrelated files', () => {
    const source = studio()
    expect(isSchemaInput(source, join(dir, 'studio', 'src', 'pages', 'index.astro'))).toBe(false)
    expect(isSchemaInput(source, join(dir, 'studio', 'node_modules', 'sanity', 'schema.js'))).toBe(
      false,
    )
    expect(
      isSchemaInput(source, join(dir, 'studio', 'schemaTypes', 'node_modules', 'x', 'index.ts')),
    ).toBe(false)
    expect(isSchemaInput(source, join(dir, 'studio', 'schemaTypes', 'notes.md'))).toBe(false)
    expect(isSchemaInput(source, join(dir, 'studio', 'schemaTypes'))).toBe(false)
    expect(isSchemaInput(source, join(dir, 'studio', 'schema.json'))).toBe(false)
    expect(isSchemaInput(source, join(dir, 'elsewhere', 'schemaTypes', 'movie.ts'))).toBe(false)
  })

  it('matches only the json file for json sources', () => {
    const json: JsonSchemaSource = {kind: 'json', path: join(dir, 'schema.json')}
    expect(isSchemaInput(json, join(dir, 'schema.json'))).toBe(true)
    expect(isSchemaInput(json, join(dir, 'other.json'))).toBe(false)
  })
})

describe('schemaWatchTargets', () => {
  it('lists the json file for json sources', () => {
    expect(schemaWatchTargets({kind: 'json', path: '/x/schema.json'})).toEqual(['/x/schema.json'])
  })

  it('lists the config file, existing schema directories and watch entries', async () => {
    await mkdir(join(dir, 'studio', 'schemaTypes'), {recursive: true})
    await mkdir(join(dir, 'studio', 'schemas'), {recursive: true})
    await mkdir(join(dir, 'studio', 'src'), {recursive: true})
    await writeFile(join(dir, 'studio', 'schema.json'), '[]')

    const targets = schemaWatchTargets(studio())

    expect(targets[0]).toBe(join(dir, 'studio', 'sanity.config.ts'))
    expect(targets.slice(1, 3).sort()).toEqual([
      join(dir, 'studio', 'schemaTypes'),
      join(dir, 'studio', 'schemas'),
    ])
    expect(targets[3]).toBe(join(dir, 'shared'))
    expect(targets).toHaveLength(4)
  })
})
