import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join, relative, resolve, sep} from 'node:path'
import {pathToFileURL} from 'node:url'

import type {SchemaType} from 'groq-js'

import {fail} from './errors'
import {LIVE_OPTION, type SchemaSource, type StudioSchemaSource} from './options'
import {findInstalledPackage, hasExport} from './packages'

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

/** Which files re-extract the schema in dev, and where the dev server watcher has to attach. */
export interface SchemaWatch {
  roots: string[]
  isInput(path: string): boolean
}

export type SchemaExtractor = (
  source: StudioSchemaSource,
  outputPath: string,
) => Promise<SchemaType>

/** What the `sanity` install next to the studio config provides. Replaced by fakes in tests. */
export interface SchemaTools {
  extract: SchemaExtractor
  watch(source: StudioSchemaSource): Promise<SchemaWatch>
}

const SANITY_FLOOR = 'sanity 5.29 or later (@sanity/cli 6.7 or later)'
const SCHEMA_EXTRACT_HINT = `run "npx sanity schema extract" and point ${LIVE_OPTION}.schema at the generated schema.json.`
const EXTRACT_SUBPATH = '_internal/extract'
// `sanity schema extract --watch` defines its default patterns in this module but does not export
// them from the package, so they are loaded from the file itself rather than copied here.
const CLI_WATCHER_MODULE = ['dist', 'actions', 'schema', 'extractSchemaWatcher.js']
const GLOB_SEGMENT = /[*?[\]{}()!]/

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

interface InstalledVersions {
  sanity: string
  cli: string | undefined
}

interface InstalledSanity {
  /** Resolved `@sanity/cli-build/_internal/extract` entry. */
  extractEntry: string
  /** Real directory of the `@sanity/cli` package `sanity` depends on. */
  cliDir: string
  versions: InstalledVersions
}

interface SchemaValidationProblem {
  severity: string
  message: string
}

interface SchemaValidationGroup {
  path: unknown[]
  problems: SchemaValidationProblem[]
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

/** The parts of `@sanity/cli-build/_internal/extract` this file uses, all optional for older versions. */
interface ExtractModule {
  runSchemaExtraction?: RunSchemaExtraction
  SchemaExtractionError?: abstract new (...args: never[]) => {validation?: unknown}
  extractValidationFromSchemaError?: (error: unknown, workDir: string) => Promise<unknown>
  formatSchemaValidation?: (validation: SchemaValidationGroup[]) => string
  createSchemaPatternMatcher?: (patterns: string[]) => {
    isMatch(filePath: string, workDir: string): boolean
  }
}

function needsNewerSanity(versions: InstalledVersions): never {
  const found = versions.cli
    ? `sanity ${versions.sanity} with @sanity/cli ${versions.cli}`
    : `sanity ${versions.sanity} without @sanity/cli`
  return fail(
    `Automatic schema extraction needs ${SANITY_FLOOR}; found ${found}. Upgrade sanity, or ${SCHEMA_EXTRACT_HINT}`,
  )
}

// Follows the dependency chain `sanity` -> `@sanity/cli` -> `@sanity/cli-build` from the studio,
// so the extractor is the one `sanity schema extract` would run there.
function resolveInstalledSanity(source: StudioSchemaSource): InstalledSanity {
  const sanity = findInstalledPackage('sanity', source.studioRoot)
  if (!sanity) {
    return fail(
      `Could not find the "sanity" package next to ${source.configPath}. Install it there, or ${SCHEMA_EXTRACT_HINT}`,
    )
  }
  const cli = findInstalledPackage('@sanity/cli', sanity.dir)
  const versions = {sanity: sanity.version, cli: cli?.version}
  if (!cli) {
    return needsNewerSanity(versions)
  }
  const cliBuild = findInstalledPackage('@sanity/cli-build', cli.dir)
  if (!cliBuild || !hasExport(cliBuild, `./${EXTRACT_SUBPATH}`)) {
    return needsNewerSanity(versions)
  }
  // A package can resolve its own exports by name, which applies the `exports` conditions without
  // searching anywhere else.
  const extractEntry = createRequire(join(cliBuild.dir, 'package.json')).resolve(
    `@sanity/cli-build/${EXTRACT_SUBPATH}`,
  )
  return {extractEntry, cliDir: cli.dir, versions}
}

// The extractor lives in the user's `sanity` install, so it cannot be a static import.
async function importExtractModule(installed: InstalledSanity): Promise<ExtractModule> {
  return import(pathToFileURL(installed.extractEntry).href)
}

async function schemaValidation(
  error: unknown,
  module: ExtractModule,
  workDir: string,
): Promise<SchemaValidationGroup[] | undefined> {
  let validation: unknown
  if (module.SchemaExtractionError && error instanceof module.SchemaExtractionError) {
    validation = error.validation
  } else if (typeof module.extractValidationFromSchemaError === 'function') {
    try {
      validation = await module.extractValidationFromSchemaError(error, workDir)
    } catch {
      return undefined
    }
  }
  return Array.isArray(validation) && validation.length > 0
    ? (validation as SchemaValidationGroup[])
    : undefined
}

async function extractionFailure(
  error: unknown,
  module: ExtractModule,
  workDir: string,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error)
  const validation = await schemaValidation(error, module, workDir)
  const details =
    validation && typeof module.formatSchemaValidation === 'function'
      ? `\n${module.formatSchemaValidation(validation)}`
      : ''
  return fail(`Sanity schema extraction failed: ${message}${details}`)
}

async function extractWithInstalledSanity(
  source: StudioSchemaSource,
  outputPath: string,
): Promise<SchemaType> {
  const installed = resolveInstalledSanity(source)
  const module = await importExtractModule(installed)
  if (typeof module.runSchemaExtraction !== 'function') {
    return needsNewerSanity(installed.versions)
  }
  try {
    return await module.runSchemaExtraction({
      configPath: source.configPath,
      enforceRequiredFields: source.enforceRequiredFields,
      format: 'groq-type-nodes',
      outputPath,
      workspace: source.workspace,
    })
  } catch (error) {
    return extractionFailure(error, module, source.studioRoot)
  }
}

async function importDefaultWatchPatterns(installed: InstalledSanity): Promise<string[]> {
  const modulePath = join(installed.cliDir, ...CLI_WATCHER_MODULE)
  let module: {DEFAULT_WATCH_PATTERNS?: unknown}
  try {
    module = await import(pathToFileURL(modulePath).href)
  } catch (error) {
    return fail(
      `Could not load the schema watch patterns of @sanity/cli ${installed.versions.cli} from ${modulePath} (${error instanceof Error ? error.message : String(error)}).`,
    )
  }
  const patterns = module.DEFAULT_WATCH_PATTERNS
  if (!Array.isArray(patterns) || !patterns.every((pattern) => typeof pattern === 'string')) {
    return fail(
      `@sanity/cli ${installed.versions.cli} does not define DEFAULT_WATCH_PATTERNS in ${modulePath}.`,
    )
  }
  return patterns
}

/** The leading glob-free part of a pattern: where a watcher has to attach to see its matches. */
function globBase(pattern: string): string {
  const base: string[] = []
  for (const segment of pattern.split('/')) {
    if (GLOB_SEGMENT.test(segment)) {
      break
    }
    base.push(segment)
  }
  return base.join('/')
}

/** Drops paths that are already inside another path of the list. */
function outermost(paths: string[]): string[] {
  const unique = [...new Set(paths)]
  return unique.filter(
    (path) => !unique.some((other) => other !== path && path.startsWith(other + sep)),
  )
}

async function watchWithInstalledSanity(source: StudioSchemaSource): Promise<SchemaWatch> {
  const installed = resolveInstalledSanity(source)
  const module = await importExtractModule(installed)
  if (typeof module.createSchemaPatternMatcher !== 'function') {
    return needsNewerSanity(installed.versions)
  }
  const patterns = [...(await importDefaultWatchPatterns(installed)), ...source.watchPatterns]
  const {isMatch} = module.createSchemaPatternMatcher(patterns)
  const roots = outermost([
    source.studioRoot,
    ...source.watchPatterns.map((pattern) => resolve(source.studioRoot, globBase(pattern))),
  ])
  return {
    roots,
    // The config file is matched by path too: the CLI patterns only cover `sanity.config.*`.
    isInput: (path) => {
      const absolute = resolve(path)
      return absolute === source.configPath || isMatch(absolute, source.studioRoot)
    },
  }
}

export const installedSanity: SchemaTools = {
  extract: extractWithInstalledSanity,
  watch: watchWithInstalledSanity,
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
  extract: SchemaExtractor = installedSanity.extract,
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

export async function schemaWatch(
  source: SchemaSource,
  tools: SchemaTools = installedSanity,
): Promise<SchemaWatch> {
  switch (source.kind) {
    case 'json':
      return {roots: [source.path], isInput: (path) => resolve(path) === source.path}
    case 'studio':
      return tools.watch(source)
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}
