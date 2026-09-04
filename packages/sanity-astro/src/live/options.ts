import {dirname, extname, resolve} from 'node:path'

export type SanityLiveOrderBy = [field: string, direction: 'asc' | 'desc']

export interface SanityLiveLoaderConfig {
  /** The `_type` of the documents this loader serves. */
  type: string
  /** Extra GROQ filter, combined with the `_type` check using `&&`. */
  filter?: string
  /** GROQ projection body. Defaults to `...`. `_id` and `_updatedAt` are always included. */
  projection?: string
  orderBy?: SanityLiveOrderBy | SanityLiveOrderBy[]
  /** Which field `getLiveEntry` matches on. `slug` compares `slug.current`. Defaults to `id`. */
  entryBy?: 'id' | 'slug'
}

export interface SanityLiveSchemaOptions {
  /** A `schema.json` produced by `sanity schema extract`, or a `sanity.config.*` file to extract from. */
  path: string
  /** Studio workspace to extract when the config defines several. */
  workspace?: string
  enforceRequiredFields?: boolean
  /** Extra files or directories whose changes trigger re-extraction in dev. */
  watch?: string[]
}

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
  watchPaths: string[]
}

export type SchemaSource = JsonSchemaSource | StudioSchemaSource

export type EntryBy = 'id' | 'slug'

export interface LoaderDefinition {
  key: string
  names: {loader: string; schema: string; type: string}
  documentType: string
  entryBy: EntryBy
  collectionQuery: string
  entryQuery: string
}

export interface LivePlan {
  source: SchemaSource
  loaders: LoaderDefinition[]
}

const STUDIO_CONFIG_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'])
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const SYSTEM_FIELDS = '_id, _updatedAt'

function fail(message: string): never {
  throw new Error(`[@sanity/astro] ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveSchemaSource(
  schema: string | SanityLiveSchemaOptions | undefined,
  root: string,
): SchemaSource {
  const options = typeof schema === 'string' ? {path: schema} : schema
  if (!isRecord(options) || typeof options.path !== 'string' || options.path.trim() === '') {
    return fail(
      'live.schema must be a path to a schema.json or a sanity.config file, or an object with a `path`.',
    )
  }
  const path = resolve(root, options.path)
  const extension = extname(path)
  if (extension === '.json') {
    return {kind: 'json', path}
  }
  if (STUDIO_CONFIG_EXTENSIONS.has(extension)) {
    const watch = options.watch ?? []
    if (!Array.isArray(watch) || watch.some((entry) => typeof entry !== 'string')) {
      return fail('live.schema.watch must be an array of paths.')
    }
    return {
      kind: 'studio',
      configPath: path,
      studioRoot: dirname(path),
      ...(options.workspace === undefined ? {} : {workspace: options.workspace}),
      enforceRequiredFields: options.enforceRequiredFields === true,
      watchPaths: watch.map((entry) => resolve(root, entry)),
    }
  }
  return fail(
    `live.schema "${options.path}" must end in .json (a schema extracted with "sanity schema extract") or be a sanity.config file (.ts, .tsx, .js, .jsx, .mjs, .mts).`,
  )
}

function camelCase(key: string): string {
  const segments = key.split(/[^A-Za-z0-9]+/).filter((segment) => segment !== '')
  return segments
    .map((segment, index) =>
      index === 0
        ? segment.charAt(0).toLowerCase() + segment.slice(1)
        : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join('')
}

function loaderNames(key: string): LoaderDefinition['names'] {
  const identifier = camelCase(key)
  if (!IDENTIFIER.test(identifier)) {
    return fail(
      `live.loaders key "${key}" cannot be turned into a JavaScript identifier. Use letters, digits and separators, starting with a letter.`,
    )
  }
  return {
    loader: `${identifier}Loader`,
    schema: `${identifier}Schema`,
    type: identifier.charAt(0).toUpperCase() + identifier.slice(1),
  }
}

function isOrderBy(value: unknown): value is SanityLiveOrderBy {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    value[0].trim() !== '' &&
    (value[1] === 'asc' || value[1] === 'desc')
  )
}

function normalizeOrderBy(key: string, orderBy: unknown): SanityLiveOrderBy[] {
  if (orderBy === undefined) {
    return []
  }
  const entries = Array.isArray(orderBy) && orderBy.every(Array.isArray) ? orderBy : [orderBy]
  return entries.map((entry) =>
    isOrderBy(entry)
      ? entry
      : fail(
          `live.loaders.${key}.orderBy must be a [field, 'asc' | 'desc'] tuple or a list of them.`,
        ),
  )
}

function resolveEntryBy(key: string, entryBy: unknown): EntryBy {
  if (entryBy === undefined || entryBy === 'id') {
    return 'id'
  }
  if (entryBy === 'slug') {
    return 'slug'
  }
  return fail(`live.loaders.${key}.entryBy must be 'id' or 'slug'.`)
}

function entryCondition(entryBy: EntryBy): string {
  switch (entryBy) {
    case 'id':
      return '_id == $id'
    case 'slug':
      return 'slug.current == $slug'
    default: {
      const exhaustive: never = entryBy
      return exhaustive
    }
  }
}

function optionalGroq(key: string, option: string, value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value !== 'string') {
    return fail(`live.loaders.${key}.${option} must be a GROQ string.`)
  }
  return value.trim()
}

function resolveLoader(key: string, config: unknown): LoaderDefinition {
  if (!isRecord(config)) {
    return fail(`live.loaders.${key} must be an object with at least a \`type\`.`)
  }
  const {type} = config
  if (typeof type !== 'string' || type.trim() === '') {
    return fail(`live.loaders.${key}.type is required and must name a document type.`)
  }
  const filter = optionalGroq(key, 'filter', config.filter)
  const projection = optionalGroq(key, 'projection', config.projection)
  const entryBy = resolveEntryBy(key, config.entryBy)
  const orderBy = normalizeOrderBy(key, config.orderBy)
  const documentType = type.trim()
  const body = `{${projection || '...'}, ${SYSTEM_FIELDS}}`
  const filterClause = filter ? ` && (${filter})` : ''
  const order = orderBy.length
    ? ` | order(${orderBy.map(([field, direction]) => `${field} ${direction}`).join(', ')})`
    : ''
  return {
    key,
    names: loaderNames(key),
    documentType,
    entryBy,
    collectionQuery: `*[_type == "${documentType}"${filterClause}]${order} ${body}`,
    entryQuery: `*[_type == "${documentType}"${filterClause} && ${entryCondition(entryBy)}][0] ${body}`,
  }
}

function assertUniqueNames(loaders: LoaderDefinition[]): void {
  const owners = new Map<string, string>()
  for (const {key, names} of loaders) {
    const owner = owners.get(names.loader)
    if (owner !== undefined) {
      fail(
        `live.loaders keys "${owner}" and "${key}" both generate the export "${names.loader}". Rename one of them.`,
      )
    }
    owners.set(names.loader, key)
  }
}

export function resolveLivePlan(live: SanityLiveOptions, root: string): LivePlan {
  if (!isRecord(live)) {
    return fail('The `live` option must be an object with `schema` and `loaders`.')
  }
  const source = resolveSchemaSource(live.schema, root)
  if (!isRecord(live.loaders) || Object.keys(live.loaders).length === 0) {
    return fail('live.loaders must define at least one loader, e.g. {movie: {type: "movie"}}.')
  }
  const loaders = Object.entries(live.loaders).map(([key, config]) => resolveLoader(key, config))
  assertUniqueNames(loaders)
  return {source, loaders}
}
