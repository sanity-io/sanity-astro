#!/usr/bin/env node

import {readFile, writeFile} from 'node:fs/promises'
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
const schemaOptions = sanityAstroOptions?.live?.schema ?? sanityAstroOptions?.liveLoader?.schema
const configuredInputPath = resolve(
  cwd,
  args.input ?? schemaOptions?.input ?? sanityCliOptions?.typegen?.path ?? './sanity.types.ts',
)
const outputPath = resolve(
  cwd,
  args.output ?? schemaOptions?.output ?? './.astro/sanity-live-schemas.generated.ts',
)
const inputPath = isSanityConfigPath(configuredInputPath)
  ? await generateTypesFromSanityConfig(configuredInputPath)
  : configuredInputPath

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
