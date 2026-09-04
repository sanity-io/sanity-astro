import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import type {SchemaType} from 'groq-js'
import {afterAll, describe, expect, it} from 'vitest'

import {generateLoaderModule} from './generate'
import {resolveLivePlan} from './options'

const fixturePath = fileURLToPath(new URL('./__fixtures__/movies-schema.json', import.meta.url))
const packageRoot = fileURLToPath(new URL('../..', import.meta.url))

async function loadFixture(): Promise<SchemaType> {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

const plan = resolveLivePlan(
  {
    schema: fixturePath,
    loaders: {
      movie: {
        type: 'movie',
        projection: 'title, releaseDate, poster, "slug": slug.current',
        orderBy: ['title', 'asc'],
      },
      person: {type: 'person', entryBy: 'slug'},
    },
  },
  packageRoot,
)

const tempDirs: string[] = []

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, {recursive: true, force: true})))
})

const astroZodUrl = pathToFileURL(
  createRequire(join(packageRoot, 'package.json')).resolve('astro/zod'),
).href

async function executeRuntime(runtime: string) {
  const dir = await mkdtemp(join(tmpdir(), 'sanity-astro-generate-test-'))
  tempDirs.push(dir)
  await writeFile(
    join(dir, 'sanity-client.mjs'),
    `export const sanityClient = {label: 'default client'}\n`,
  )
  await writeFile(
    join(dir, 'loader.mjs'),
    `export const createSanityLiveLoader = (config) => ({name: 'sanity:' + config.name, config})\n`,
  )
  await writeFile(
    join(dir, 'generated.mjs'),
    runtime
      .replace(`from 'astro/zod'`, `from '${astroZodUrl}'`)
      .replace(`from 'sanity:client'`, `from './sanity-client.mjs'`)
      .replace(`from '@sanity/astro/loader'`, `from './loader.mjs'`),
  )
  return import(pathToFileURL(join(dir, 'generated.mjs')).href)
}

describe('generateLoaderModule', () => {
  it('emits runtime exports with the plan queries', async () => {
    const {runtime} = generateLoaderModule(await loadFixture(), plan)

    expect(runtime).toContain(`import {z} from 'astro/zod'`)
    expect(runtime).toContain(`import {createSanityLiveLoader} from '@sanity/astro/loader'`)
    expect(runtime).toContain(`import {sanityClient} from 'sanity:client'`)
    expect(runtime).toContain('export const movieSchema = z.object({')
    expect(runtime).toContain('export const movieLoader = (options = {}) =>')
    expect(runtime).toContain('export const personSchema = ')
    expect(runtime).toContain('export const personLoader = (options = {}) =>')
    expect(runtime).toContain(
      `collectionQuery: "*[_type == \\"movie\\"] | order(title asc) {title, releaseDate, poster, \\"slug\\": slug.current, _id, _updatedAt}"`,
    )
    expect(runtime).toContain(
      `entryQuery: "*[_type == \\"person\\" && slug.current == $slug][0] {..., _id, _updatedAt}"`,
    )
    expect(runtime).toContain('const SanityImageAssetReferenceType = z.lazy(() =>')
    expect(runtime).toContain('client: options.client ?? sanityClient')
  })

  it('declares the sanity:loader module with element types', async () => {
    const {types} = generateLoaderModule(await loadFixture(), plan)

    expect(types.startsWith('/// <reference types="@sanity/astro/module" />\n')).toBe(true)
    expect(types).toContain(`declare module 'sanity:loader' {`)
    expect(types).toContain('  export type Movie = {')
    expect(types).toContain('    _id: string;')
    expect(types).toContain('    _updatedAt: string;')
    expect(types).toContain('    title: string | null;')
    expect(types).toContain('    slug: string | null;')
    expect(types).toContain('    poster: {')
    expect(types).toContain('  export const movieSchema: z.ZodType<Movie>')
    expect(types).toContain(
      `) => LiveLoader<Movie, SanityLiveEntryFilter<'id'>, SanityLiveCollectionFilter>`,
    )
    expect(types).toContain(
      `) => LiveLoader<Person, SanityLiveEntryFilter<'slug'>, SanityLiveCollectionFilter>`,
    )
    expect(types).toContain('  export type Person = {')
    expect(types).toContain('  export type SanityImageAssetReference = {')
    expect(types).toContain('  export type Slug = {')
    expect(types).toMatch(/slug\?: Slug;/)
  })

  it('is deterministic', async () => {
    const schema = await loadFixture()
    const first = generateLoaderModule(schema, plan)
    const second = generateLoaderModule(schema, plan)
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.runtime).toBe(first.runtime)
    expect(second.types).toBe(first.types)
    expect(first.warnings).toEqual([])
  })

  it('rejects loaders whose document type is missing from the schema', async () => {
    const schema = await loadFixture()
    const bad = resolveLivePlan(
      {schema: fixturePath, loaders: {movie: {type: 'movi'}}},
      packageRoot,
    )
    expect(() => generateLoaderModule(schema, bad)).toThrow(
      '[@sanity/astro] Loader "movie" targets document type "movi" which is not in the schema. Known document types: movie, person, sanity.fileAsset, sanity.imageAsset, screening',
    )
  })

  it('reports GROQ errors with the loader key', async () => {
    const schema = await loadFixture()
    const bad = resolveLivePlan(
      {schema: fixturePath, loaders: {movie: {type: 'movie', projection: 'title,,'}}},
      packageRoot,
    )
    expect(() => generateLoaderModule(schema, bad)).toThrow(/\[@sanity\/astro\] Loader "movie": /)
  })

  it('falls back to records when the query does not return objects', async () => {
    const schema = await loadFixture()
    const scalar = resolveLivePlan(
      {schema: fixturePath, loaders: {movie: {type: 'movie', projection: 'title'}}},
      packageRoot,
    )
    const module = generateLoaderModule(schema, {
      ...scalar,
      loaders: scalar.loaders.map((loader) => ({
        ...loader,
        collectionQuery: '*[_type == "movie"].title',
      })),
    })
    expect(module.runtime).toContain('export const movieSchema = z.record(z.string(), z.unknown())')
    expect(module.types).toContain('export type Movie = Record<string, unknown>')
    expect(module.warnings).toEqual([
      'Loader "movie" evaluates to "union" instead of an object; its entries are typed as Record<string, unknown>.',
    ])
  })

  it('suffixes schema type names that collide with loader type names', async () => {
    const schema: SchemaType = [
      {
        type: 'document',
        name: 'movie',
        attributes: {
          _id: {type: 'objectAttribute', value: {type: 'string'}},
          _type: {type: 'objectAttribute', value: {type: 'string', value: 'movie'}},
          _updatedAt: {type: 'objectAttribute', value: {type: 'string'}},
          sequel: {type: 'objectAttribute', value: {type: 'inline', name: 'movie'}, optional: true},
        },
      },
    ]
    const {types, runtime} = generateLoaderModule(
      schema,
      resolveLivePlan({schema: fixturePath, loaders: {movie: {type: 'movie'}}}, packageRoot),
    )
    expect(types).toContain('  export type Movie2 = {')
    expect(types).toContain('    sequel?: Movie2;')
    expect(types).toContain('  export type Movie = {')
    expect(runtime).toContain('const Movie2Type = z.lazy(() => z.object({')
    expect(runtime).toContain('sequel: Movie2Type.optional()')
  })

  it('produces a runtime whose Zod schemas validate documents', async () => {
    const {runtime} = generateLoaderModule(await loadFixture(), plan)
    const generated = await executeRuntime(runtime)

    expect(
      generated.movieSchema.parse({
        _id: 'movie-1',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: 'Alien',
        releaseDate: null,
        poster: {
          _type: 'image',
          asset: {_ref: 'image-abc', _type: 'reference'},
          hotspot: {_type: 'sanity.imageHotspot', x: 0.5, y: 0.5, height: 1, width: 1},
        },
        slug: 'alien',
      }),
    ).toMatchObject({_id: 'movie-1', title: 'Alien', slug: 'alien'})
    expect(generated.movieSchema.safeParse({_id: 1}).success).toBe(false)
    expect(generated.movieSchema.safeParse({_id: 'x', _updatedAt: 'y', title: 3}).success).toBe(
      false,
    )

    const person = generated.personSchema.parse({
      _id: 'person-1',
      _type: 'person',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      _rev: 'r1',
      name: 'Ridley Scott',
      slug: {_type: 'slug', current: 'ridley-scott'},
      image: {_type: 'image', asset: {_ref: 'image-1', _type: 'reference', _weak: true}},
    })
    expect(person.slug).toEqual({_type: 'slug', current: 'ridley-scott'})
    expect(generated.personSchema.safeParse({_id: 'p', slug: {current: 'no-type'}}).success).toBe(
      false,
    )

    expect(generated.movieLoader()).toMatchObject({
      name: 'sanity:movie',
      config: {client: {label: 'default client'}},
    })
    expect(generated.movieLoader({client: {label: 'draft client'}}).config.client).toEqual({
      label: 'draft client',
    })
  })

  it('validates _key wrapped inline references and recursive block content', async () => {
    const schema = await loadFixture()
    const full = resolveLivePlan(
      {schema: fixturePath, loaders: {movie: {type: 'movie'}}},
      packageRoot,
    )
    const generated = await executeRuntime(generateLoaderModule(schema, full).runtime)

    const parsed = generated.movieSchema.parse({
      _id: 'movie-1',
      _type: 'movie',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      _rev: 'r1',
      castMembers: [
        {
          _key: 'k1',
          _type: 'castMember',
          characterName: 'Ripley',
          person: {_ref: 'person-1', _type: 'reference'},
        },
      ],
      overview: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          children: [{_key: 's1', _type: 'span', text: 'In space', marks: []}],
        },
      ],
    })
    expect(parsed.castMembers[0]).toEqual({
      _key: 'k1',
      _type: 'castMember',
      characterName: 'Ripley',
      person: {_ref: 'person-1', _type: 'reference'},
    })
    expect(
      generated.movieSchema.safeParse({
        _id: 'movie-1',
        _type: 'movie',
        _createdAt: 'c',
        _updatedAt: 'u',
        _rev: 'r',
        castMembers: [{_type: 'castMember'}],
      }).success,
    ).toBe(false)
  })
})
