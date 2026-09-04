import {createHash} from 'node:crypto'

import type {SchemaType, TypeNode} from 'groq-js'

import type {LivePlan, LoaderDefinition} from './options'
import {
  collectInlineNames,
  emitTsType,
  emitZodSchema,
  evaluateCollectionElementType,
  indexSchema,
  type NameRef,
  normalizeSchema,
  type TypeIndex,
} from './type-node'

export interface GeneratedLoaderModule {
  runtime: string
  types: string
  fingerprint: string
  warnings: string[]
}

interface EvaluatedLoader {
  definition: LoaderDefinition
  element: TypeNode
}

interface NamedTypes {
  names: string[]
  tsRef: NameRef
  zodRef: NameRef
}

function fail(message: string): never {
  throw new Error(`[@sanity/astro] ${message}`)
}

function pascalCase(name: string): string {
  const joined = name
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment !== '')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')
  return /^[A-Za-z_]/.test(joined) ? joined : `_${joined}`
}

function assertDocumentTypes(plan: LivePlan, index: TypeIndex): void {
  const documentTypes = index.documentTypes()
  for (const loader of plan.loaders) {
    if (!documentTypes.includes(loader.documentType)) {
      fail(
        `Loader "${loader.key}" targets document type "${loader.documentType}" which is not in the schema. Known document types: ${[...documentTypes].sort().join(', ')}`,
      )
    }
  }
}

function evaluateLoaders(schema: SchemaType, plan: LivePlan): EvaluatedLoader[] {
  return plan.loaders.map((definition) => {
    try {
      return {
        definition,
        element: evaluateCollectionElementType(schema, definition.collectionQuery),
      }
    } catch (error) {
      return fail(
        `Loader "${definition.key}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}

function nameTypes(loaders: EvaluatedLoader[], index: TypeIndex): NamedTypes {
  const names: string[] = []
  for (const {element} of loaders) {
    for (const name of collectInlineNames(element, index)) {
      if (!names.includes(name)) {
        names.push(name)
      }
    }
  }
  const loaderTypeNames = new Set(loaders.map(({definition}) => definition.names.type))
  const taken = new Set(loaderTypeNames)
  const tsNames = new Map<string, string>()
  for (const name of names) {
    const base = pascalCase(name)
    let candidate = base
    for (let suffix = 2; taken.has(candidate); suffix += 1) {
      candidate = `${base}${suffix}`
    }
    taken.add(candidate)
    tsNames.set(name, candidate)
  }
  return {
    names,
    tsRef: (name) => tsNames.get(name),
    zodRef: (name) => {
      const tsName = tsNames.get(name)
      return tsName === undefined ? undefined : `${tsName}Type`
    },
  }
}

function isObjectLike(node: TypeNode): boolean {
  return (
    node.type === 'object' ||
    (node.type === 'union' && node.of.length > 0 && node.of.every(isObjectLike))
  )
}

function namedNodes(named: NamedTypes, index: TypeIndex): Array<[name: string, node: TypeNode]> {
  return named.names.flatMap((name) => {
    const node = index.get(name)
    return node ? [[name, node]] : []
  })
}

function sections(blocks: string[][]): string {
  return `${blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join('\n'))
    .join('\n\n')}\n`
}

function renderRuntime(loaders: EvaluatedLoader[], named: NamedTypes, index: TypeIndex): string {
  const header = [
    `import {z} from 'astro/zod'`,
    `import {createSanityLiveLoader} from '@sanity/astro/loader'`,
    `import {sanityClient} from 'sanity:client'`,
  ]
  const namedTypes = namedNodes(named, index).map(
    ([name, node]) =>
      `const ${named.zodRef(name)} = z.lazy(() => ${emitZodSchema(node, named.zodRef)})`,
  )
  const exports = loaders.map(({definition, element}) => {
    const schema = isObjectLike(element)
      ? emitZodSchema(element, named.zodRef)
      : 'z.record(z.string(), z.unknown())'
    return [
      `export const ${definition.names.schema} = ${schema}`,
      `export const ${definition.names.loader} = (options = {}) =>`,
      `  createSanityLiveLoader({`,
      `    name: ${JSON.stringify(definition.key)},`,
      `    collectionQuery: ${JSON.stringify(definition.collectionQuery)},`,
      `    entryQuery: ${JSON.stringify(definition.entryQuery)},`,
      `    client: options.client ?? sanityClient,`,
      `  })`,
    ]
  })
  return sections([header, namedTypes, ...exports])
}

function renderTypes(loaders: EvaluatedLoader[], named: NamedTypes, index: TypeIndex): string {
  const header = [
    `/// <reference types="@sanity/astro/module" />`,
    `declare module 'sanity:loader' {`,
    `  import type {LiveLoader} from 'astro/loaders'`,
    `  import type {z} from 'astro/zod'`,
    `  import type {`,
    `    SanityLiveCollectionFilter,`,
    `    SanityLiveEntryFilter,`,
    `    SanityLiveLoaderOptions,`,
    `  } from '@sanity/astro/loader'`,
  ]
  const namedTypes = namedNodes(named, index).map(
    ([name, node]) => `  export type ${named.tsRef(name)} = ${emitTsType(node, named.tsRef, '  ')}`,
  )
  const exports = loaders.map(({definition, element}) => {
    const {names, entryBy} = definition
    const type = isObjectLike(element)
      ? emitTsType(element, named.tsRef, '  ')
      : 'Record<string, unknown>'
    return [
      `  export type ${names.type} = ${type}`,
      `  export const ${names.schema}: z.ZodType<${names.type}>`,
      `  export const ${names.loader}: (`,
      `    options?: SanityLiveLoaderOptions,`,
      `  ) => LiveLoader<${names.type}, SanityLiveEntryFilter<'${entryBy}'>, SanityLiveCollectionFilter>`,
    ]
  })
  return `${sections([header, namedTypes, ...exports])}}\n`
}

export function generateLoaderModule(
  extractedSchema: SchemaType,
  plan: LivePlan,
): GeneratedLoaderModule {
  const schema = normalizeSchema(extractedSchema)
  const index = indexSchema(schema)
  assertDocumentTypes(plan, index)
  const loaders = evaluateLoaders(schema, plan)
  const named = nameTypes(loaders, index)
  const runtime = renderRuntime(loaders, named, index)
  const types = renderTypes(loaders, named, index)
  return {
    runtime,
    types,
    fingerprint: createHash('sha256').update(runtime).update('\0').update(types).digest('hex'),
    warnings: loaders
      .filter(({element}) => !isObjectLike(element))
      .map(
        ({definition, element}) =>
          `Loader "${definition.key}" evaluates to "${element.type}" instead of an object; its entries are typed as Record<string, unknown>.`,
      ),
  }
}
