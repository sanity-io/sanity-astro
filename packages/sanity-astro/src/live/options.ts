import {dirname, extname, resolve} from 'node:path'

import {z} from 'astro/zod'

import {fail} from './errors'
import {camelCase, isIdentifier} from './naming'

/** The `sanityIntegration()` option that turns live loader generation on. */
export const LIVE_OPTION = 'experimental_live'

/** @experimental */
export type SanityLiveOrderBy = [field: string, direction: 'asc' | 'desc']

/** @experimental */
export interface SanityLiveLoaderConfig {
  /** The `_type` of the documents this loader serves. */
  type: string
  /** Extra GROQ filter, combined with the `_type` check using `&&`. */
  filter?: string
  /** GROQ projection body. Defaults to `...`. `_id` and `_updatedAt` are always included. */
  projection?: string
  orderBy?: SanityLiveOrderBy | SanityLiveOrderBy[]
  /**
   * Which field the id passed to `getLiveEntry` is compared with: `_id` (the default) or
   * `slug.current`.
   */
  entryBy?: 'id' | 'slug'
}

/** @experimental */
export interface SanityLiveSchemaOptions {
  /** A `schema.json` produced by `sanity schema extract`, or a `sanity.config.*` file to extract from. */
  path: string
  /** Studio workspace to extract when the config defines several. */
  workspace?: string
  enforceRequiredFields?: boolean
  /**
   * Extra glob patterns, relative to the directory of `path`, whose changes re-extract the schema
   * in dev. Same shape as `schemaExtraction.watchPatterns` in `sanity.cli.ts`.
   */
  watchPatterns?: string[]
}

/**
 * Value of the `experimental_live` integration option. The shape may change in minor releases
 * while the feature is experimental.
 * @experimental
 */
export interface SanityLiveOptions {
  schema: string | SanityLiveSchemaOptions
  loaders: Record<string, SanityLiveLoaderConfig>
}

export interface JsonSchemaSource {
  kind: 'json'
  path: string
}

export interface StudioSchemaSource {
  kind: 'studio'
  configPath: string
  studioRoot: string
  workspace?: string
  enforceRequiredFields: boolean
  watchPatterns: string[]
}

export type SchemaSource = JsonSchemaSource | StudioSchemaSource

export interface LoaderDefinition {
  key: string
  names: {loader: string; schema: string; type: string}
  documentType: string
  collectionQuery: string
  entryQuery: string
}

export interface LivePlan {
  source: SchemaSource
  loaders: LoaderDefinition[]
}

// Mirrors the config files `sanity schema extract` itself picks up.
const STUDIO_CONFIG_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs'])
const SYSTEM_FIELDS = '_id, _updatedAt'
const SCHEMA_OPTION = `${LIVE_OPTION}.schema`
const LOADERS_OPTION = `${LIVE_OPTION}.loaders`

const groq = z.string()
const orderBy = z.tuple([z.string().min(1), z.enum(['asc', 'desc'])])

const loaderSchema = z
  .object({
    type: z.string().regex(/\S/, 'must name a document type'),
    filter: groq.optional(),
    projection: groq.optional(),
    orderBy: z
      .union([orderBy, z.array(orderBy)], {
        message: "must be a [field, 'asc' | 'desc'] tuple or a list of them",
      })
      .optional(),
    entryBy: z.enum(['id', 'slug']).optional(),
  })
  .strict()

const loadersSchema = z.record(z.string(), loaderSchema).superRefine((loaders, ctx) => {
  const keys = Object.keys(loaders)
  if (keys.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'must define at least one loader, e.g. {movie: {type: "movie"}}',
    })
  }
  for (const key of keys) {
    if (!isIdentifier(camelCase(key))) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message:
          'cannot be turned into a JavaScript identifier. Use letters, digits and separators, starting with a letter.',
      })
    }
  }
})

const SCHEMA_SHAPE_MESSAGE =
  'must be a path to a schema.json or a sanity.config file, or an object with a `path`'

// The string shorthand is widened to `{path}` before validation, so problems inside the object
// form are reported at their own path instead of as a failed union.
const schemaOptionsSchema = z.preprocess(
  (value) => (typeof value === 'string' ? {path: value} : value),
  z
    .object(
      {
        path: z.string().min(1, 'must be a path to a schema.json or a sanity.config file'),
        workspace: z.string().optional(),
        enforceRequiredFields: z.boolean().optional(),
        watchPatterns: z.array(z.string()).optional(),
      },
      {error: (issue) => (issue.code === 'invalid_type' ? SCHEMA_SHAPE_MESSAGE : undefined)},
    )
    .strict(),
)

// The exported interfaces stay the public types on purpose: `z.input<>` would make the emitted
// declarations depend on whichever zod version the consumer's Astro ships, and zod's inferred
// types also need `strictNullChecks`, which `astro/tsconfigs/base` leaves off.
const liveOptionsSchema = z.object({schema: schemaOptionsSchema, loaders: loadersSchema}).strict()

function formatIssues(issues: ReadonlyArray<{path: ReadonlyArray<PropertyKey>; message: string}>) {
  return issues
    .map((issue) => `${[LIVE_OPTION, ...issue.path.map(String)].join('.')}: ${issue.message}`)
    .join('\n')
}

function resolveSchemaSource(schema: SanityLiveOptions['schema'], root: string): SchemaSource {
  const options = typeof schema === 'string' ? {path: schema} : schema
  const path = resolve(root, options.path)
  const extension = extname(path)
  if (extension === '.json') {
    return {kind: 'json', path}
  }
  if (STUDIO_CONFIG_EXTENSIONS.has(extension)) {
    return {
      kind: 'studio',
      configPath: path,
      studioRoot: dirname(path),
      ...(options.workspace === undefined ? {} : {workspace: options.workspace}),
      enforceRequiredFields: options.enforceRequiredFields === true,
      watchPatterns: options.watchPatterns ?? [],
    }
  }
  return fail(
    `${SCHEMA_OPTION} "${options.path}" must end in .json (a schema extracted with "sanity schema extract") or be a sanity.config file (.js, .jsx, .ts, .tsx, .mjs).`,
  )
}

function loaderNames(key: string): LoaderDefinition['names'] {
  const identifier = camelCase(key)
  return {
    loader: `${identifier}Loader`,
    schema: `${identifier}Schema`,
    type: identifier.charAt(0).toUpperCase() + identifier.slice(1),
  }
}

// Astro normalizes `getLiveEntry(collection, 'some-id')` to `{id: 'some-id'}`, so both modes bind
// `$id` and only the compared field differs.
function entryCondition(entryBy: NonNullable<SanityLiveLoaderConfig['entryBy']>): string {
  switch (entryBy) {
    case 'id':
      return '_id == $id'
    case 'slug':
      return 'slug.current == $id'
    default: {
      const exhaustive: never = entryBy
      return exhaustive
    }
  }
}

function isOrderBy(value: SanityLiveOrderBy | SanityLiveOrderBy[]): value is SanityLiveOrderBy {
  return typeof value[0] === 'string'
}

function resolveLoader(key: string, config: SanityLiveLoaderConfig): LoaderDefinition {
  const documentType = config.type.trim()
  const filter = config.filter?.trim() ?? ''
  const projection = config.projection?.trim() ?? ''
  const orderBy =
    config.orderBy === undefined
      ? []
      : isOrderBy(config.orderBy)
        ? [config.orderBy]
        : config.orderBy
  const body = `{${projection || '...'}, ${SYSTEM_FIELDS}}`
  const filterClause = filter ? ` && (${filter})` : ''
  const order = orderBy.length
    ? ` | order(${orderBy.map(([field, direction]) => `${field} ${direction}`).join(', ')})`
    : ''
  return {
    key,
    names: loaderNames(key),
    documentType,
    collectionQuery: `*[_type == "${documentType}"${filterClause}]${order} ${body}`,
    entryQuery: `*[_type == "${documentType}"${filterClause} && ${entryCondition(config.entryBy ?? 'id')}][0] ${body}`,
  }
}

function assertUniqueNames(loaders: LoaderDefinition[]): void {
  const owners = new Map<string, string>()
  for (const {key, names} of loaders) {
    const owner = owners.get(names.loader)
    if (owner !== undefined) {
      fail(
        `${LOADERS_OPTION} keys "${owner}" and "${key}" both generate the export "${names.loader}". Rename one of them.`,
      )
    }
    owners.set(names.loader, key)
  }
}

export function resolveLivePlan(live: SanityLiveOptions, root: string): LivePlan {
  const parsed = liveOptionsSchema.safeParse(live)
  if (!parsed.success) {
    return fail(formatIssues(parsed.error.issues))
  }
  // Validation only: nothing is stripped or converted that the code below would depend on.
  const source = resolveSchemaSource(live.schema, root)
  const loaders = Object.entries(live.loaders).map(([key, config]) => resolveLoader(key, config))
  assertUniqueNames(loaders)
  return {source, loaders}
}
