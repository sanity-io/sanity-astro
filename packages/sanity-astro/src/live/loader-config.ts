export type LiveLoaderOrderDirection = 'asc' | 'desc'

export interface LiveLoaderConfig {
  type: string
  projection?: string
  orderBy?: [field: string, direction: LiveLoaderOrderDirection]
}

export type LiveLoadersConfig = Record<string, LiveLoaderConfig>

export interface ResolvedLiveLoaderConfig {
  collectionName: string
  collectionQuery: string
  entryQuery: string
}

export function resolveLiveLoaderConfigs(loaders: LiveLoadersConfig | undefined): Record<string, ResolvedLiveLoaderConfig> {
  if (!loaders) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(loaders).map(([loaderName, config]) => [loaderName, buildLoaderConfig(loaderName, config)]),
  )
}

export function createSanityLoaderVirtualModuleSource(loaders: LiveLoadersConfig | undefined): string {
  const resolvedLoaders = resolveLiveLoaderConfigs(loaders)
  const configsByName = JSON.stringify(resolvedLoaders, null, 2)
  const exportLines = Object.keys(resolvedLoaders)
    .map((loaderName) => {
      const exportName = createLoaderExportName(loaderName)
      return `export const ${exportName} = (options) => sanityLiveLoader({...loaderConfigs[${JSON.stringify(loaderName)}], ...options})`
    })
    .join('\n')

  return `
import {sanityLiveLoader} from "@sanity/astro/live-loader";

const loaderConfigs = ${configsByName};

${exportLines}
`
}

export function createSanityLoaderTypeDeclaration(loaders: LiveLoadersConfig | undefined): string {
  const loaderNames = Object.keys(resolveLiveLoaderConfigs(loaders))
  if (loaderNames.length === 0) {
    return `declare module 'sanity:loader' {}`
  }

  const declarations = loaderNames
    .map((loaderName) => {
      const exportName = createLoaderExportName(loaderName)
      return `  export const ${exportName}: (
    options: Omit<
      import('@sanity/astro/live-loader').SanityLiveLoaderOptions<Record<string, unknown>>,
      'collectionName' | 'collectionQuery' | 'entryQuery'
    >,
  ) => import('astro/loaders').LiveLoader<
    Record<string, unknown>,
    import('@sanity/astro/live-loader').SanityLiveEntryFilter,
    import('@sanity/astro/live-loader').SanityLiveCollectionFilter
  >`
    })
    .join('\n')

  return `declare module 'sanity:loader' {\n${declarations}\n}\n`
}

function buildLoaderConfig(loaderName: string, config: LiveLoaderConfig): ResolvedLiveLoaderConfig {
  const documentType = config.type.trim()
  if (!documentType) {
    throw new Error(`Sanity live loader "${loaderName}" requires a non-empty "type" option.`)
  }

  const projection = config.projection?.trim() || '...'
  const orderBy = buildOrderByClause(loaderName, config.orderBy)

  return {
    collectionName: loaderName,
    collectionQuery: `*[_type == "${documentType}"]${orderBy}{${projection}}`,
    entryQuery: `*[_type == "${documentType}" && _id == $id][0]{${projection}}`,
  }
}

function buildOrderByClause(loaderName: string, orderBy: LiveLoaderConfig['orderBy']): string {
  if (!orderBy) {
    return ''
  }

  const [field, direction] = orderBy
  const normalizedField = field.trim()
  if (!normalizedField) {
    throw new Error(`Sanity live loader "${loaderName}" has an invalid "orderBy" field.`)
  }

  return ` | order(${normalizedField} ${direction})`
}

function createLoaderExportName(loaderName: string): string {
  const segments = loaderName
    .split(/[^A-Za-z0-9]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const baseName = segments
    .map((segment, index) =>
      index === 0 ? segment.charAt(0).toLowerCase() + segment.slice(1) : capitalize(segment),
    )
    .join('')

  const normalizedBaseName = baseName || 'sanity'
  const safeBaseName = normalizedBaseName.match(/^[A-Za-z_$]/) ? normalizedBaseName : `loader${capitalize(normalizedBaseName)}`

  return `${safeBaseName}Loader`
}

function capitalize(value: string): string {
  if (!value) {
    return value
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}
