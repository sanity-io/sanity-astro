import {
  type ObjectAttribute,
  type ObjectTypeNode,
  parse,
  type SchemaType,
  type TypeNode,
  typeEvaluate,
} from 'groq-js'

export interface TypeIndex {
  get(name: string): TypeNode | undefined
  documentTypes(): string[]
}

export type NameRef = (name: string) => string | undefined

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function indexSchema(schema: SchemaType): TypeIndex {
  const types = new Map<string, TypeNode>()
  const documents: string[] = []
  for (const entry of schema) {
    switch (entry.type) {
      case 'document':
        documents.push(entry.name)
        types.set(entry.name, {type: 'object', attributes: entry.attributes})
        break
      case 'type':
        types.set(entry.name, entry.value)
        break
      default: {
        const exhaustive: never = entry
        return exhaustive
      }
    }
  }
  return {
    get: (name) => types.get(name),
    documentTypes: () => documents,
  }
}

function elementType(node: TypeNode): TypeNode | undefined {
  if (node.type === 'array') {
    return node.of
  }
  if (node.type === 'union') {
    const members: TypeNode[] = []
    for (const member of node.of) {
      const element = elementType(member)
      if (!element) {
        return undefined
      }
      members.push(element)
    }
    return members.length === 1 ? members[0] : {type: 'union', of: members}
  }
  return undefined
}

export function evaluateCollectionElementType(
  schema: SchemaType,
  collectionQuery: string,
): TypeNode {
  const result = typeEvaluate(parse(collectionQuery), schema)
  const element = elementType(result)
  if (!element) {
    throw new Error(
      `The query ${JSON.stringify(collectionQuery)} evaluates to "${result.type}" instead of an array.`,
    )
  }
  return element
}

export function collectInlineNames(node: TypeNode, index: TypeIndex): string[] {
  const seen = new Set<string>()
  const visit = (current: TypeNode): void => {
    switch (current.type) {
      case 'inline': {
        const target = index.get(current.name)
        if (target && !seen.has(current.name)) {
          seen.add(current.name)
          visit(target)
        }
        return
      }
      case 'array':
        visit(current.of)
        return
      case 'union':
        current.of.forEach(visit)
        return
      case 'object':
        for (const attribute of Object.values(current.attributes)) {
          visit(attribute.value)
        }
        if (current.rest) {
          visit(current.rest)
        }
        return
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'unknown':
        return
      default: {
        const exhaustive: never = current
        return exhaustive
      }
    }
  }
  visit(node)
  return [...seen]
}

interface FlatObject {
  attributes: Array<[key: string, attribute: ObjectAttribute]>
  tail: {kind: 'none'} | {kind: 'unknown'} | {kind: 'inline'; name: string}
}

function flattenObject(node: ObjectTypeNode): FlatObject {
  const own = Object.entries(node.attributes)
  const rest = node.rest
  if (!rest) {
    return {attributes: own, tail: {kind: 'none'}}
  }
  switch (rest.type) {
    case 'object': {
      const inherited = flattenObject(rest)
      const keys = new Set(own.map(([key]) => key))
      return {
        attributes: [...own, ...inherited.attributes.filter(([key]) => !keys.has(key))],
        tail: inherited.tail,
      }
    }
    case 'unknown':
      return {attributes: own, tail: {kind: 'unknown'}}
    case 'inline':
      return {attributes: own, tail: {kind: 'inline', name: rest.name}}
    default: {
      const exhaustive: never = rest
      return exhaustive
    }
  }
}

function tsKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key)
}

function literal(value: string | number | boolean): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function dedupe(parts: string[]): string[] {
  return [...new Set(parts)]
}

function splitNull(node: {of: TypeNode[]}): {nullable: boolean; members: TypeNode[]} {
  const members = node.of.filter((member) => member.type !== 'null')
  return {nullable: members.length !== node.of.length, members}
}

export function emitTsType(node: TypeNode, ref: NameRef, indent = ''): string {
  switch (node.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return node.value === undefined ? node.type : literal(node.value)
    case 'null':
      return 'null'
    case 'unknown':
      return 'unknown'
    case 'inline':
      return ref(node.name) ?? 'unknown'
    case 'array':
      return `Array<${emitTsType(node.of, ref, indent)}>`
    case 'union': {
      const {nullable, members} = splitNull(node)
      const parts = dedupe(members.map((member) => emitTsType(member, ref, indent)))
      if (parts.length === 0) {
        return nullable ? 'null' : 'never'
      }
      return nullable ? [...parts, 'null'].join(' | ') : parts.join(' | ')
    }
    case 'object': {
      const {attributes, tail} = flattenObject(node)
      if (tail.kind === 'unknown') {
        return 'unknown'
      }
      const extended = tail.kind === 'inline' ? ref(tail.name) : undefined
      if (tail.kind === 'inline' && extended === undefined) {
        return 'unknown'
      }
      const inner = `${indent}  `
      const lines = attributes.map(
        ([key, attribute]) =>
          `${inner}${tsKey(key)}${attribute.optional ? '?' : ''}: ${emitTsType(attribute.value, ref, inner)};`,
      )
      const body = lines.length === 0 ? '{}' : `{\n${lines.join('\n')}\n${indent}}`
      return extended === undefined ? body : `${body} & ${extended}`
    }
    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}

export function emitZodSchema(node: TypeNode, ref: NameRef): string {
  switch (node.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return node.value === undefined ? `z.${node.type}()` : `z.literal(${literal(node.value)})`
    case 'null':
      return 'z.null()'
    case 'unknown':
      return 'z.unknown()'
    case 'inline':
      return ref(node.name) ?? 'z.unknown()'
    case 'array':
      return `z.array(${emitZodSchema(node.of, ref)})`
    case 'union': {
      const {nullable, members} = splitNull(node)
      const parts = dedupe(members.map((member) => emitZodSchema(member, ref)))
      const inner =
        parts.length === 0
          ? undefined
          : parts.length === 1
            ? parts[0]
            : `z.union([${parts.join(', ')}])`
      if (inner === undefined) {
        return nullable ? 'z.null()' : 'z.never()'
      }
      return nullable ? `${inner}.nullable()` : inner
    }
    case 'object': {
      const {attributes, tail} = flattenObject(node)
      if (tail.kind === 'unknown') {
        return 'z.unknown()'
      }
      const extended = tail.kind === 'inline' ? ref(tail.name) : undefined
      if (tail.kind === 'inline' && extended === undefined) {
        return 'z.unknown()'
      }
      const shape = attributes
        .map(
          ([key, attribute]) =>
            `${tsKey(key)}: ${emitZodSchema(attribute.value, ref)}${attribute.optional ? '.optional()' : ''}`,
        )
        .join(', ')
      const object = `z.object({${shape}})`
      return extended === undefined ? object : `z.intersection(${object}, ${extended})`
    }
    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}
