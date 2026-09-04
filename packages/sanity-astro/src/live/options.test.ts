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
      watchPaths: [],
    })
  })

  it('accepts the object form and resolves watch paths against the root', () => {
    expect(
      plan({
        schema: {
          path: '../studio/sanity.config.mjs',
          workspace: 'default',
          enforceRequiredFields: true,
          watch: ['../studio/src/lib', './shared/schema-fragments.ts'],
        },
        loaders: {movie: {type: 'movie'}},
      }).source,
    ).toEqual({
      kind: 'studio',
      configPath: '/studio/sanity.config.mjs',
      studioRoot: '/studio',
      workspace: 'default',
      enforceRequiredFields: true,
      watchPaths: ['/studio/src/lib', '/app/shared/schema-fragments.ts'],
    })
  })

  it('rejects unknown extensions and missing paths', () => {
    expect(() => plan({schema: './schema.yaml', loaders: {movie: {type: 'movie'}}})).toThrow(
      /\[@sanity\/astro\] live\.schema ".\/schema\.yaml" must end in \.json/,
    )
    expect(() => plan({schema: {path: ''}, loaders: {movie: {type: 'movie'}}})).toThrow(
      /live\.schema must be a path/,
    )
    expect(() => plan({loaders: {movie: {type: 'movie'}}} as never)).toThrow(
      /live\.schema must be a path/,
    )
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
      /cannot be turned into a JavaScript identifier/,
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
      /live\.loaders must define at least one loader/,
    )
    expect(() => loader({} as never)).toThrow(/live\.loaders\.movie\.type is required/)
    expect(() => loader({type: '  '})).toThrow(/live\.loaders\.movie\.type is required/)
  })

  it('validates orderBy and entryBy', () => {
    expect(() => loader({type: 'movie', orderBy: 'title' as never})).toThrow(
      /live\.loaders\.movie\.orderBy must be a \[field, 'asc' \| 'desc'\] tuple/,
    )
    expect(() => loader({type: 'movie', orderBy: ['title', 'up'] as never})).toThrow(/orderBy/)
    expect(() => loader({type: 'movie', entryBy: 'title' as never})).toThrow(
      /live\.loaders\.movie\.entryBy must be 'id' or 'slug'/,
    )
  })
})

describe('resolveLivePlan queries', () => {
  it('projects everything plus the system fields by default and matches entries by _id', () => {
    const {collectionQuery, entryQuery, entryBy, documentType} = loader({type: 'movie'})
    expect(documentType).toBe('movie')
    expect(entryBy).toBe('id')
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

  it('matches entries by slug.current when entryBy is slug', () => {
    const {entryQuery, entryBy} = loader({type: 'person', entryBy: 'slug'})
    expect(entryBy).toBe('slug')
    expect(entryQuery).toBe(
      '*[_type == "person" && slug.current == $slug][0] {..., _id, _updatedAt}',
    )
  })
})
