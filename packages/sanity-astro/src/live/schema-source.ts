import {readdirSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {extname, join, relative, resolve, sep} from 'node:path'
import {pathToFileURL} from 'node:url'

import type {SchemaType} from 'groq-js'

import type {SchemaSource, StudioSchemaSource} from './options'

export interface SchemaLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface SchemaLoadContext {
  codegenDir: string
  allowStale: boolean
  logger: SchemaLogger
}

export interface LoadedSchema {
  schema: SchemaType
  stale: boolean
}

export type SchemaExtractor = (
  source: StudioSchemaSource,
  outputPath: string,
) => Promise<SchemaType>

const SCHEMA_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'])
const SCHEMA_EXTRACT_HINT =
  'run "npx sanity schema extract" and point live.schema at the generated schema.json.'

function fail(message: string): never {
  throw new Error(`[@sanity/astro] ${message}`)
}

function isSchemaEntry(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'type' in value &&
    (value.type === 'document' || value.type === 'type')
  )
}

function parseSchemaJson(text: string, path: string): SchemaType {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return fail(
      `${path} is not valid JSON (${error instanceof Error ? error.message : String(error)}). It must be produced by "sanity schema extract".`,
    )
  }
  if (!Array.isArray(parsed) || !parsed.every(isSchemaEntry)) {
    return fail(
      `${path} is not a Sanity schema: expected an array of document and type entries. It must be produced by "sanity schema extract".`,
    )
  }
  return parsed as SchemaType
}

async function readSchemaFile(path: string): Promise<SchemaType> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    return fail(
      `Could not read the Sanity schema at ${path} (${error instanceof Error ? error.message : String(error)}). It must be produced by "sanity schema extract".`,
    )
  }
  return parseSchemaJson(text, path)
}

interface ExtractEntry {
  entry: string
  sanityVersion: string
}

function resolveExtractEntry(source: StudioSchemaSource): ExtractEntry {
  const requireFromStudio = createRequire(join(source.studioRoot, 'noop.js'))
  let sanityPackagePath: string
  try {
    sanityPackagePath = requireFromStudio.resolve('sanity/package.json')
  } catch {
    return fail(
      `Could not find the "sanity" package next to ${source.configPath}. Install it there, or ${SCHEMA_EXTRACT_HINT}`,
    )
  }
  const sanityVersion = String(
    (requireFromStudio(sanityPackagePath) as {version?: unknown}).version ?? 'unknown',
  )
  try {
    const cliPackagePath = createRequire(sanityPackagePath).resolve('@sanity/cli/package.json')
    const entry = createRequire(cliPackagePath).resolve('@sanity/cli-build/_internal/extract')
    return {entry, sanityVersion}
  } catch {
    return needsNewerSanity(sanityVersion)
  }
}

function needsNewerSanity(sanityVersion: string): never {
  return fail(
    `Automatic schema extraction needs sanity 5.x or later (found ${sanityVersion}). Upgrade sanity, or ${SCHEMA_EXTRACT_HINT}`,
  )
}

interface RunSchemaExtraction {
  (options: {
    configPath: string
    enforceRequiredFields: boolean
    format: 'groq-type-nodes'
    outputPath: string
    workspace: string | undefined
  }): Promise<SchemaType>
}

function extractionFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  const validation =
    typeof error === 'object' && error !== null && 'validation' in error
      ? error.validation
      : undefined
  const details = Array.isArray(validation) ? `\n${JSON.stringify(validation, null, 2)}` : ''
  return fail(`Sanity schema extraction failed: ${message}${details}`)
}

// The extractor lives in the user's `sanity` install, so it cannot be a static import.
async function extractWithInstalledSanity(
  source: StudioSchemaSource,
  outputPath: string,
): Promise<SchemaType> {
  const {entry, sanityVersion} = resolveExtractEntry(source)
  const module: {runSchemaExtraction?: unknown} = await import(pathToFileURL(entry).href)
  if (typeof module.runSchemaExtraction !== 'function') {
    return needsNewerSanity(sanityVersion)
  }
  const runSchemaExtraction = module.runSchemaExtraction as RunSchemaExtraction
  try {
    return await runSchemaExtraction({
      configPath: source.configPath,
      enforceRequiredFields: source.enforceRequiredFields,
      format: 'groq-type-nodes',
      outputPath,
      workspace: source.workspace,
    })
  } catch (error) {
    return extractionFailure(error)
  }
}

async function readStaleSchema(
  outputPath: string,
  logger: SchemaLogger,
): Promise<SchemaType | undefined> {
  let text: string
  try {
    text = await readFile(outputPath, 'utf8')
  } catch {
    return undefined
  }
  try {
    return parseSchemaJson(text, outputPath)
  } catch (error) {
    logger.warn(
      `Ignoring the previously extracted schema: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
}

async function loadStudioSchema(
  source: StudioSchemaSource,
  ctx: SchemaLoadContext,
  extract: SchemaExtractor,
): Promise<LoadedSchema> {
  const outputPath = join(ctx.codegenDir, 'schema.json')
  if (ctx.allowStale) {
    const stale = await readStaleSchema(outputPath, ctx.logger)
    if (stale) {
      ctx.logger.info(
        `Using the previously extracted Sanity schema (${stale.length} types); re-extracting in the background`,
      )
      return {schema: stale, stale: true}
    }
  }
  ctx.logger.info(`Extracting Sanity schema from ${relative(process.cwd(), source.configPath)}...`)
  const started = performance.now()
  const schema = await extract(source, outputPath)
  ctx.logger.info(
    `Extracted Sanity schema (${schema.length} types) in ${Math.round(performance.now() - started)}ms`,
  )
  return {schema, stale: false}
}

export async function loadSchema(
  source: SchemaSource,
  ctx: SchemaLoadContext,
  extract: SchemaExtractor = extractWithInstalledSanity,
): Promise<LoadedSchema> {
  switch (source.kind) {
    case 'json':
      return {schema: await readSchemaFile(source.path), stale: false}
    case 'studio':
      return loadStudioSchema(source, ctx, extract)
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}

function schemaDirectories(studioRoot: string): string[] {
  try {
    return readdirSync(studioRoot, {withFileTypes: true})
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('schema'))
      .map((entry) => join(studioRoot, entry.name))
  } catch {
    return []
  }
}

export function schemaWatchTargets(source: SchemaSource): string[] {
  switch (source.kind) {
    case 'json':
      return [source.path]
    case 'studio':
      return [source.configPath, ...schemaDirectories(source.studioRoot), ...source.watchPaths]
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}

function isInside(parent: string, path: string): boolean {
  return path === parent || path.startsWith(`${parent}${sep}`)
}

function isSchemaDirectoryFile(studioRoot: string, path: string): boolean {
  if (!isInside(studioRoot, path) || !SCHEMA_FILE_EXTENSIONS.has(extname(path))) {
    return false
  }
  const [firstSegment, ...rest] = relative(studioRoot, path).split(sep)
  return rest.length > 0 && firstSegment.startsWith('schema')
}

export function isSchemaInput(source: SchemaSource, changedPath: string): boolean {
  const path = resolve(changedPath)
  if (path.split(sep).includes('node_modules')) {
    return false
  }
  switch (source.kind) {
    case 'json':
      return path === source.path
    case 'studio':
      return (
        path === source.configPath ||
        source.watchPaths.some((watched) => isInside(watched, path)) ||
        isSchemaDirectoryFile(source.studioRoot, path)
      )
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}
