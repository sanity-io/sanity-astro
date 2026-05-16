#!/usr/bin/env node

import {readFile, unlink, writeFile} from 'node:fs/promises'
import {dirname, relative, resolve} from 'node:path'
import {mkdir} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {pathToFileURL} from 'node:url'

const cwd = process.cwd()
const args = parseArgs(process.argv.slice(2))
const sanityAstroOptions = await loadSanityAstroOptions({
  cwd,
  explicitConfigPath: args.astroConfig,
})
const sanityCliOptions = await loadSanityCliOptions({cwd})
const liveLoaders = sanityAstroOptions?.live?.loaders
const schemaOptions = sanityAstroOptions?.live?.schema ?? sanityAstroOptions?.liveLoader?.schema
const outputPath = resolve(
  cwd,
  args.output ?? schemaOptions?.output ?? './.astro/sanity-live-schemas.generated.ts',
)
const explicitInput = args.input ?? schemaOptions?.input
const inputPath = explicitInput
  ? await resolveConfiguredInputPath(explicitInput)
  : liveLoaders
    ? await generateTypesFromLiveLoaders({
        liveLoaders,
        sanityCliOptions,
      })
    : await generateTypesFromConfiguredTypegen({sanityCliOptions})

await mkdir(dirname(outputPath), {recursive: true})
await runTsToZod({
  input: inputPath,
  output: outputPath,
})

let generated = await readFile(outputPath, 'utf8')
generated = generated.replaceAll(`from "zod"`, `from 'astro/zod'`).replaceAll(`from 'zod'`, `from 'astro/zod'`)
generated = generated.replace(
  /\nconst sanityClientSanityQueriesSchema = /g,
  '\nexport const sanityClientSanityQueriesSchema = ',
)

const header = `/**
 * This file is generated from Sanity typegen output.
 * Regenerate with: pnpm sanity:live:schemas
 */

`

await writeFile(outputPath, `${header}${generated}`)

function parseArgs(values) {
  const parsed = {}

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--input') {
      parsed.input = values[index + 1]
      index += 1
      continue
    }

    if (value === '--output') {
      parsed.output = values[index + 1]
      index += 1
      continue
    }

    if (value === '--names') {
      parsed.names = values[index + 1]
      index += 1
      continue
    }

    if (value === '--astroConfig') {
      parsed.astroConfig = values[index + 1]
      index += 1
    }
  }

  return parsed
}

async function runTsToZod({input, output}) {
  const inputForCli = normalizeCliPath(relative(cwd, input))
  const outputForCli = normalizeCliPath(relative(cwd, output))

  await runCommand('pnpm', ['exec', 'ts-to-zod', inputForCli, outputForCli, '--skipValidation'], {
    cwd,
  })
}

async function runCommand(command, args, options) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`Command failed (${command} ${args.join(' ')}), exit code ${code ?? 1}`))
    })

    child.on('error', rejectPromise)
  })
}

function normalizeCliPath(pathValue) {
  if (pathValue.startsWith('.')) {
    return pathValue
  }

  return `./${pathValue}`
}

function isSanityConfigPath(pathValue) {
  return /sanity\.config\.(ts|js|mjs|cjs)$/.test(pathValue)
}

async function resolveConfiguredInputPath(configuredInput) {
  const configuredInputPath = resolve(cwd, configuredInput)
  if (isSanityConfigPath(configuredInputPath)) {
    return generateTypesFromSanityConfig(configuredInputPath)
  }

  return configuredInputPath
}

async function generateTypesFromLiveLoaders({liveLoaders, sanityCliOptions}) {
  const generatedQueryFilePath = resolve(cwd, 'src/sanity.live-loader.queries.generated.ts')
  const generatedTypesPath = resolve(cwd, sanityCliOptions?.typegen?.path ?? './sanity.types.ts')
  const generatedQueryFile = createLiveLoaderTypegenQueryFile(liveLoaders)

  await mkdir(dirname(generatedQueryFilePath), {recursive: true})
  await writeFile(generatedQueryFilePath, generatedQueryFile)
  try {
    await runCommand('pnpm', ['exec', 'sanity', 'typegen', 'generate'], {cwd})
  } finally {
    try {
      await unlink(generatedQueryFilePath)
    } catch {
      // noop
    }
  }

  return generatedTypesPath
}

async function generateTypesFromConfiguredTypegen({sanityCliOptions}) {
  const generatedTypesPath = resolve(cwd, sanityCliOptions?.typegen?.path ?? './sanity.types.ts')
  await runCommand('pnpm', ['exec', 'sanity', 'typegen', 'generate'], {cwd})
  return generatedTypesPath
}

function createLiveLoaderTypegenQueryFile(liveLoaders) {
  const lines = ['import {defineQuery} from "groq"', '']
  const loaders = Object.entries(liveLoaders)

  for (const [loaderName, loaderConfig] of loaders) {
    const collectionQuery = buildLiveLoaderCollectionQuery(loaderName, loaderConfig)
    const entryQuery = buildLiveLoaderEntryQuery(loaderName, loaderConfig)
    const baseName = createLoaderQuerySymbolName(loaderName)
    const symbolPrefix = '__sanityLiveLoader'

    lines.push(`export const ${symbolPrefix}${baseName}CollectionQuery = defineQuery(${JSON.stringify(collectionQuery)})`)
    lines.push(`export const ${symbolPrefix}${baseName}EntryQuery = defineQuery(${JSON.stringify(entryQuery)})`)
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

function buildLiveLoaderCollectionQuery(loaderName, loaderConfig) {
  const documentType = normalizeLoaderType(loaderName, loaderConfig?.type)
  const projection = normalizeProjection(loaderConfig?.projection)
  const orderBy = normalizeOrderBy(loaderName, loaderConfig?.orderBy)
  return `*[_type == "${documentType}"]${orderBy}{${projection}}`
}

function buildLiveLoaderEntryQuery(loaderName, loaderConfig) {
  const documentType = normalizeLoaderType(loaderName, loaderConfig?.type)
  const projection = normalizeProjection(loaderConfig?.projection)
  return `*[_type == "${documentType}" && _id == $id][0]{${projection}}`
}

function normalizeLoaderType(loaderName, type) {
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Error(`Sanity live loader "${loaderName}" requires a non-empty "type" option.`)
  }

  return type.trim()
}

function normalizeProjection(projection) {
  if (typeof projection !== 'string') {
    return '...'
  }

  const normalized = projection.trim()
  return normalized.length > 0 ? normalized : '...'
}

function normalizeOrderBy(loaderName, orderBy) {
  if (!Array.isArray(orderBy) || orderBy.length !== 2) {
    return ''
  }

  const [field, direction] = orderBy
  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new Error(`Sanity live loader "${loaderName}" has an invalid "orderBy" field.`)
  }

  if (direction !== 'asc' && direction !== 'desc') {
    throw new Error(`Sanity live loader "${loaderName}" has an invalid "orderBy" direction.`)
  }

  return ` | order(${field.trim()} ${direction})`
}

function createLoaderQuerySymbolName(loaderName) {
  const segments = String(loaderName)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

  const baseName = segments
    .map((segment, index) => {
      const normalized = segment.charAt(0).toUpperCase() + segment.slice(1)
      return index === 0 ? normalized.charAt(0).toLowerCase() + normalized.slice(1) : normalized
    })
    .join('')

  if (!baseName) {
    return 'sanity'
  }

  return /^[A-Za-z_$]/.test(baseName) ? baseName : `loader${baseName}`
}

async function generateTypesFromSanityConfig(configPath) {
  const generatedSchemaPath = resolve(cwd, '.astro/sanity.schema.generated.json')
  const generatedTypesPath = resolve(cwd, '.astro/sanity.types.generated.ts')
  const configForCli = normalizeCliPath(relative(cwd, configPath))
  const schemaForCli = normalizeCliPath(relative(cwd, generatedSchemaPath))
  const typesForCli = normalizeCliPath(relative(cwd, generatedTypesPath))

  await mkdir(dirname(generatedSchemaPath), {recursive: true})
  await runCommand('pnpm', ['exec', 'sanity', 'schema', 'extract', '--path', schemaForCli, '--config', configForCli], {
    cwd,
  })
  await runCommand(
    'pnpm',
    ['exec', 'sanity', 'typegen', 'generate', '--schema', schemaForCli, '--output', typesForCli],
    {cwd},
  )

  return generatedTypesPath
}

async function loadSanityAstroOptions({
  cwd,
  explicitConfigPath,
}) {
  const astroConfigPath = explicitConfigPath
    ? resolve(cwd, explicitConfigPath)
    : findAstroConfigPath(cwd)
  if (!astroConfigPath) {
    return undefined
  }

  const module = await import(pathToFileURL(astroConfigPath).href)
  const configExport = module.default
  const config =
    typeof configExport === 'function'
      ? await configExport({
          command: 'build',
          mode: 'production',
        })
      : configExport
  const integrations = Array.isArray(config?.integrations) ? config.integrations : []

  for (const integration of integrations) {
    if (integration?.name === '@sanity/astro' && integration?.__sanityAstroOptions) {
      return integration.__sanityAstroOptions
    }
  }

  return undefined
}

async function loadSanityCliOptions({cwd}) {
  const sanityCliPath = findSanityCliPath(cwd)
  if (!sanityCliPath) {
    return undefined
  }

  const module = await import(pathToFileURL(sanityCliPath).href)
  return module.default
}

function findAstroConfigPath(cwd) {
  const candidates = [
    'astro.config.mjs',
    'astro.config.js',
    'astro.config.cjs',
    'astro.config.mts',
    'astro.config.ts',
  ]

  for (const candidate of candidates) {
    const absolutePath = resolve(cwd, candidate)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return undefined
}

function findSanityCliPath(cwd) {
  const candidates = [
    'sanity.cli.ts',
    'sanity.cli.mts',
    'sanity.cli.js',
    'sanity.cli.mjs',
    'sanity.cli.cjs',
  ]

  for (const candidate of candidates) {
    const absolutePath = resolve(cwd, candidate)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return undefined
}
