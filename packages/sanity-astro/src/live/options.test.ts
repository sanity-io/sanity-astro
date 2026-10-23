import {describe, expect, it} from 'vitest'

import {resolveLivePlan, type SanityLiveOptions} from './options'

const root = '/app'

function plan(live: SanityLiveOptions) {
  return resolveLivePlan(live, root)
}

function loader(config: SanityLiveOptions['loaders'][string], key = 'movie') {
  return plan({schema: './schema.json', loaders: {[key]: config}}).loaders[0]
}

describe('resolveLivePlan schema source', () => {
  it('treats a .json path as an extracted schema', () => {
    expect(
      plan({schema: '../studio/schema.json', loaders: {movie: {type: 'movie'}}}).source,
    ).toEqual({kind: 'json', path: '/studio/schema.json'})
  })

  it('treats a sanity.config file as a studio to extract from', () => {
    expect(plan({schema: './sanity.config.ts', loaders: {movie: {type: 'movie'}}}).source).toEqual({
      kind: 'studio',
      configPath: '/app/sanity.config.ts',
      studioRoot: '/app',
      enforceRequiredFields: false,
      watchPatterns: [],
    })
  })

  it('accepts the object form and keeps watch patterns relative to the studio root', () => {
    expect(
      plan({
        schema: {
          path: '../studio/sanity.config.mjs',
          workspace: 'default',
          enforceRequiredFields: true,
          watchPatterns: ['src/lib/**/*.ts', '../shared/schema-fragments.ts'],
        },
        loaders: {movie: {type: 'movie'}},
      }).source,
    ).toEqual({
      kind: 'studio',
      configPath: '/studio/sanity.config.mjs',
      studioRoot: '/studio',
      workspace: 'default',
      enforceRequiredFields: true,
      watchPatterns: ['src/lib/**/*.ts', '../shared/schema-fragments.ts'],
    })
  })

  it('rejects unknown extensions, missing paths and unknown keys', () => {
    expect(() => plan({schema: './schema.yaml', loaders: {movie: {type: 'movie'}}})).toThrow(
      /\[@sanity\/astro\] experimental_live\.schema ".\/schema\.yaml" must end in \.json/,
    )
    expect(() => plan({schema: {path: ''}, loaders: {movie: {type: 'movie'}}})).toThrow(
      /experimental_live\.schema\.path: must be a path to a schema\.json or a sanity\.config file/,
    )
    expect(() => plan({schema: '', loaders: {movie: {type: 'movie'}}})).toThrow(
      /experimental_live\.schema\.path: must be a path/,
    )
    expect(() => plan({loaders: {movie: {type: 'movie'}}} as never)).toThrow(
      /experimental_live\.schema: must be a path to a schema\.json or a sanity\.config file, or an object with a `path`/,
    )
    expect(() => plan({schema: 42, loaders: {movie: {type: 'movie'}}} as never)).toThrow(
      /experimental_live\.schema: must be a path .* or an object with a `path`/,
    )
    expect(() =>
      plan({
        schema: {path: './sanity.config.ts', watch: []},
        loaders: {movie: {type: 'movie'}},
      } as never),
    ).toThrow(/experimental_live\.schema: .*watch/)
    expect(() =>
      plan({
        schema: {path: './sanity.config.ts', watchPatterns: 'lib/**' as never},
        loaders: {movie: {type: 'movie'}},
      }),
    ).toThrow(/experimental_live\.schema\.watchPatterns: /)
  })
})

describe('resolveLivePlan loader names', () => {
  it('derives camelCase exports and a PascalCase type from the key', () => {
    expect(loader({type: 'post'}, 'blog-posts').names).toEqual({
      loader: 'blogPostsLoader',
      schema: 'blogPostsSchema',
      type: 'BlogPosts',
    })
    expect(loader({type: 'movie'}).names).toEqual({
      loader: 'movieLoader',
      schema: 'movieSchema',
      type: 'Movie',
    })
    expect(loader({type: 'movie'}, 'Movie_v2').names.loader).toBe('movieV2Loader')
  })

  it('rejects keys that do not become identifiers', () => {
    expect(() => loader({type: 'movie'}, '3d-models')).toThrow(
      /experimental_live\.loaders\.3d-models: cannot be turned into a JavaScript identifier/,
    )
    expect(() => loader({type: 'movie'}, '---')).toThrow(
      /cannot be turned into a JavaScript identifier/,
    )
  })

  it('rejects keys whose identifiers collide', () => {
    expect(() =>
      plan({
        schema: './schema.json',
        loaders: {'blog-posts': {type: 'post'}, 'blogPosts': {type: 'post'}},
      }),
    ).toThrow(/"blog-posts" and "blogPosts" both generate the export "blogPostsLoader"/)
  })

  it('requires at least one loader and a type per loader', () => {
    expect(() => plan({schema: './schema.json', loaders: {}})).toThrow(
      /experimental_live\.loaders: must define at least one loader/,
    )
    expect(() => plan({schema: './schema.json'} as never)).toThrow(/experimental_live\.loaders: /)
    expect(() => loader({} as never)).toThrow(/experimental_live\.loaders\.movie\.type: /)
    expect(() => loader({type: '  '})).toThrow(
      /experimental_live\.loaders\.movie\.type: must name a document type/,
    )
  })

  it('validates orderBy, entryBy, GROQ strings and unknown keys with their option path', () => {
    expect(() => loader({type: 'movie', orderBy: 'title' as never})).toThrow(
      /experimental_live\.loaders\.movie\.orderBy: must be a \[field, 'asc' \| 'desc'\] tuple or a list of them/,
    )
    expect(() => loader({type: 'movie', orderBy: ['title', 'up'] as never})).toThrow(
      /experimental_live\.loaders\.movie\.orderBy: /,
    )
    expect(() => loader({type: 'movie', entryBy: 'title' as never})).toThrow(
      /experimental_live\.loaders\.movie\.entryBy: /,
    )
    expect(() => loader({type: 'movie', filter: 42 as never})).toThrow(
      /experimental_live\.loaders\.movie\.filter: /,
    )
    expect(() => loader({type: 'movie', projecton: 'title'} as never)).toThrow(
      /experimental_live\.loaders\.movie: .*projecton/,
    )
  })

  it('reports every problem at once', () => {
    expect(() =>
      plan({schema: {path: ''}, loaders: {movie: {type: 'movie', entryBy: 'x' as never}}}),
    ).toThrow(
      /experimental_live\.schema\.path: [\s\S]*experimental_live\.loaders\.movie\.entryBy: /,
    )
  })
})

describe('resolveLivePlan queries', () => {
  it('projects everything plus the system fields by default and matches entries by _id', () => {
    const {collectionQuery, entryQuery, documentType} = loader({type: 'movie'})
    expect(documentType).toBe('movie')
    expect(collectionQuery).toBe('*[_type == "movie"] {..., _id, _updatedAt}')
    expect(entryQuery).toBe('*[_type == "movie" && _id == $id][0] {..., _id, _updatedAt}')
  })

  it('appends the system fields after the user projection', () => {
    const {collectionQuery} = loader({
      type: 'movie',
      projection: 'title, releaseDate, poster, "slug": slug.current',
    })
    expect(collectionQuery).toBe(
      '*[_type == "movie"] {title, releaseDate, poster, "slug": slug.current, _id, _updatedAt}',
    )
  })

  it('wraps the filter in parentheses', () => {
    const {collectionQuery, entryQuery} = loader({
      type: 'movie',
      filter: 'defined(slug) || featured',
    })
    expect(collectionQuery).toBe(
      '*[_type == "movie" && (defined(slug) || featured)] {..., _id, _updatedAt}',
    )
    expect(entryQuery).toBe(
      '*[_type == "movie" && (defined(slug) || featured) && _id == $id][0] {..., _id, _updatedAt}',
    )
  })

  it('orders by a single tuple or a list of tuples, only in the collection query', () => {
    expect(loader({type: 'movie', orderBy: ['title', 'asc']}).collectionQuery).toBe(
      '*[_type == "movie"] | order(title asc) {..., _id, _updatedAt}',
    )
    const multi = loader({
      type: 'movie',
      orderBy: [
        ['releaseDate', 'desc'],
        ['title', 'asc'],
      ],
    })
    expect(multi.collectionQuery).toBe(
      '*[_type == "movie"] | order(releaseDate desc, title asc) {..., _id, _updatedAt}',
    )
    expect(multi.entryQuery).not.toContain('order(')
  })

  it('still binds $id when entries are matched by slug', () => {
    const {entryQuery} = loader({type: 'person', entryBy: 'slug'})
    expect(entryQuery).toBe('*[_type == "person" && slug.current == $id][0] {..., _id, _updatedAt}')
  })
})
