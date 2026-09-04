import {readFileSync} from 'node:fs'

import type {SchemaType, TypeNode} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {
  collectInlineNames,
  emitTsType,
  emitZodSchema,
  evaluateCollectionElementType,
  indexSchema,
  type NameRef,
  normalizeSchema,
} from './type-node'

const fixture: SchemaType = JSON.parse(
  readFileSync(new URL('./__fixtures__/movies-schema.json', import.meta.url), 'utf8'),
)

const known: Record<string, {ts: string; zod: string}> = {
  'slug': {ts: 'Slug', zod: 'SlugType'},
  'person.reference': {ts: 'PersonReference', zod: 'PersonReferenceType'},
}
const tsRef: NameRef = (name) => known[name]?.ts
const zodRef: NameRef = (name) => known[name]?.zod

function attribute(value: TypeNode, optional = false) {
  return {type: 'objectAttribute' as const, value, ...(optional ? {optional: true} : {})}
}

const string: TypeNode = {type: 'string'}
const nullNode: TypeNode = {type: 'null'}
const union = (...of: TypeNode[]): TypeNode => ({type: 'union', of})

const table: Array<{name: string; node: TypeNode; ts: string; zod: string}> = [
  {
    name: 'string literal',
    node: {type: 'string', value: 'image'},
    ts: '"image"',
    zod: 'z.literal("image")',
  },
  {name: 'number literal', node: {type: 'number', value: 3}, ts: '3', zod: 'z.literal(3)'},
  {
    name: 'boolean literal',
    node: {type: 'boolean', value: true},
    ts: 'true',
    zod: 'z.literal(true)',
  },
  {name: 'string', node: string, ts: 'string', zod: 'z.string()'},
  {name: 'number', node: {type: 'number'}, ts: 'number', zod: 'z.number()'},
  {name: 'boolean', node: {type: 'boolean'}, ts: 'boolean', zod: 'z.boolean()'},
  {name: 'null', node: nullNode, ts: 'null', zod: 'z.null()'},
  {name: 'unknown', node: {type: 'unknown'}, ts: 'unknown', zod: 'z.unknown()'},
  {name: 'known inline', node: {type: 'inline', name: 'slug'}, ts: 'Slug', zod: 'SlugType'},
  {
    name: 'unknown inline',
    node: {type: 'inline', name: 'ghost'},
    ts: 'unknown',
    zod: 'z.unknown()',
  },
  {
    name: 'array',
    node: {type: 'array', of: string},
    ts: 'Array<string>',
    zod: 'z.array(z.string())',
  },
  {name: 'empty union', node: union(), ts: 'never', zod: 'z.never()'},
  {name: 'single member union', node: union(string), ts: 'string', zod: 'z.string()'},
  {
    name: 'union',
    node: union(string, {type: 'number'}),
    ts: 'string | number',
    zod: 'z.union([z.string(), z.number()])',
  },
  {
    name: 'union deduplicates by emitted text',
    node: union({type: 'inline', name: 'ghost'}, {type: 'unknown'}),
    ts: 'unknown',
    zod: 'z.unknown()',
  },
  {
    name: 'nullable single',
    node: union(string, nullNode),
    ts: 'string | null',
    zod: 'z.string().nullable()',
  },
  {
    name: 'nullable union',
    node: union(nullNode, string, {type: 'number'}),
    ts: 'string | number | null',
    zod: 'z.union([z.string(), z.number()]).nullable()',
  },
  {name: 'union of only null', node: union(nullNode, nullNode), ts: 'null', zod: 'z.null()'},
  {
    name: 'object with optional and quoted keys',
    node: {
      type: 'object',
      attributes: {
        'title': attribute(string),
        'release-date': attribute(string, true),
      },
    },
    ts: '{\n  title: string;\n  "release-date"?: string;\n}',
    zod: 'z.object({title: z.string(), "release-date": z.string().optional()})',
  },
  {name: 'empty object', node: {type: 'object', attributes: {}}, ts: '{}', zod: 'z.object({})'},
  {
    name: 'object with rest object merges attributes, explicit ones win',
    node: {
      type: 'object',
      attributes: {_key: attribute(string), name: attribute({type: 'string', value: 'own'})},
      rest: {
        type: 'object',
        attributes: {name: attribute({type: 'number'}), age: attribute({type: 'number'}, true)},
        rest: {type: 'object', attributes: {deep: attribute({type: 'boolean'})}},
      },
    },
    ts: '{\n  _key: string;\n  name: "own";\n  age?: number;\n  deep: boolean;\n}',
    zod: 'z.object({_key: z.string(), name: z.literal("own"), age: z.number().optional(), deep: z.boolean()})',
  },
  {
    name: 'object with known inline rest becomes an intersection',
    node: {
      type: 'object',
      attributes: {_key: attribute(string)},
      rest: {type: 'inline', name: 'person.reference'},
    },
    ts: '{\n  _key: string;\n} & PersonReference',
    zod: 'z.intersection(z.object({_key: z.string()}), PersonReferenceType)',
  },
  {
    name: 'object with unknown inline rest is unknown',
    node: {
      type: 'object',
      attributes: {_key: attribute(string)},
      rest: {type: 'inline', name: 'ghost'},
    },
    ts: 'unknown',
    zod: 'z.unknown()',
  },
  {
    name: 'object with unknown rest is unknown',
    node: {type: 'object', attributes: {_key: attribute(string)}, rest: {type: 'unknown'}},
    ts: 'unknown',
    zod: 'z.unknown()',
  },
  {
    name: 'dereferencesTo is ignored',
    node: {type: 'object', attributes: {_ref: attribute(string)}, dereferencesTo: 'person'},
    ts: '{\n  _ref: string;\n}',
    zod: 'z.object({_ref: z.string()})',
  },
  {
    name: 'nested objects indent',
    node: {
      type: 'object',
      attributes: {
        poster: attribute(
          union(
            {type: 'object', attributes: {_type: attribute({type: 'string', value: 'image'})}},
            nullNode,
          ),
        ),
      },
    },
    ts: '{\n  poster: {\n    _type: "image";\n  } | null;\n}',
    zod: 'z.object({poster: z.object({_type: z.literal("image")}).nullable()})',
  },
]

describe('emitTsType and emitZodSchema', () => {
  for (const {name, node, ts, zod} of table) {
    it(`emits ${name}`, () => {
      expect(emitTsType(node, tsRef)).toBe(ts)
      expect(emitZodSchema(node, zodRef)).toBe(zod)
    })
  }
})

describe('normalizeSchema', () => {
  it('makes the _type tag of image hotspot and crop optional and leaves everything else alone', () => {
    const normalized = normalizeSchema(fixture)
    const find = (schema: SchemaType, name: string) => schema.find((entry) => entry.name === name)
    for (const name of ['sanity.imageHotspot', 'sanity.imageCrop']) {
      const before = find(fixture, name)
      const after = find(normalized, name)
      expect(
        before?.type === 'type' &&
          before.value.type === 'object' &&
          before.value.attributes._type.optional,
      ).toBeFalsy()
      expect(
        after?.type === 'type' &&
          after.value.type === 'object' &&
          after.value.attributes._type.optional,
      ).toBe(true)
    }
    expect(find(normalized, 'slug')).toBe(find(fixture, 'slug'))
    expect(find(normalized, 'movie')).toBe(find(fixture, 'movie'))
    expect(normalized).toHaveLength(fixture.length)
    expect(find(fixture, 'sanity.imageCrop')).not.toBe(find(normalized, 'sanity.imageCrop'))
  })
})

describe('indexSchema', () => {
  it('lists document types and resolves documents as objects', () => {
    const index = indexSchema(fixture)
    expect(index.documentTypes()).toEqual([
      'screening',
      'person',
      'movie',
      'sanity.fileAsset',
      'sanity.imageAsset',
    ])
    expect(index.get('person')?.type).toBe('object')
    expect(index.get('slug')?.type).toBe('object')
    expect(index.get('ghost')).toBeUndefined()
  })
})

describe('collectInlineNames', () => {
  it('collects transitive names in first-seen order, skipping unknown ones', () => {
    const index = indexSchema(fixture)
    const node: TypeNode = {
      type: 'object',
      attributes: {
        cast: attribute({
          type: 'array',
          of: {
            type: 'object',
            attributes: {_key: attribute(string)},
            rest: {type: 'inline', name: 'castMember'},
          },
        }),
        ghost: attribute({type: 'inline', name: 'ghost'}),
        slug: attribute(union({type: 'inline', name: 'slug'}, nullNode)),
      },
    }
    expect(collectInlineNames(node, index)).toEqual(['castMember', 'person.reference', 'slug'])
  })

  it('terminates on recursive types', () => {
    const schema: SchemaType = [
      {
        type: 'type',
        name: 'node',
        value: {
          type: 'object',
          attributes: {
            children: attribute({type: 'array', of: {type: 'inline', name: 'node'}}, true),
          },
        },
      },
    ]
    expect(collectInlineNames({type: 'inline', name: 'node'}, indexSchema(schema))).toEqual([
      'node',
    ])
  })
})

describe('evaluateCollectionElementType', () => {
  it('returns the element type of the collection query', () => {
    const element = evaluateCollectionElementType(
      fixture,
      '*[_type == "movie"] | order(title asc) {title, "slug": slug.current, _id, _updatedAt}',
    )
    expect(element.type).toBe('object')
    if (element.type !== 'object') {
      return
    }
    expect(Object.keys(element.attributes)).toEqual(['title', 'slug', '_id', '_updatedAt'])
    expect(element.attributes.title.value).toEqual(union(string, nullNode))
    expect(element.attributes._id.value).toEqual(string)
  })

  it('rejects queries that do not evaluate to an array', () => {
    expect(() => evaluateCollectionElementType(fixture, '*[_type == "movie"][0]')).toThrow(
      /evaluates to "union" instead of an array/,
    )
    expect(() => evaluateCollectionElementType(fixture, 'count(*)')).toThrow(
      /evaluates to "number" instead of an array/,
    )
  })

  it('propagates GROQ syntax errors', () => {
    expect(() => evaluateCollectionElementType(fixture, '*[_type == "movie" {title}')).toThrow()
  })
})
