import {describe, expect, test} from 'vitest'

import {
  createPreviewFlag,
  sanitizePerspective,
  sanitizeVariant,
  verifyPreviewFlag,
} from './previewFlag'

const SECRET = 'test-secret'
const NOW = 1_700_000_000_000

describe('preview flag', () => {
  test('verifies a flag signed with the same secret before it expires', () => {
    const flag = createPreviewFlag(SECRET, NOW + 60_000)
    expect(verifyPreviewFlag(SECRET, flag, NOW)).toBe(true)
  })

  test('rejects an expired flag', () => {
    const flag = createPreviewFlag(SECRET, NOW - 1)
    expect(verifyPreviewFlag(SECRET, flag, NOW)).toBe(false)
  })

  test('rejects a flag signed with another secret', () => {
    const flag = createPreviewFlag('other-secret', NOW + 60_000)
    expect(verifyPreviewFlag(SECRET, flag, NOW)).toBe(false)
  })

  test('rejects a flag whose expiry was extended after signing', () => {
    const [, signature] = createPreviewFlag(SECRET, NOW + 60_000).split('.')
    expect(verifyPreviewFlag(SECRET, `${NOW + 600_000}.${signature}`, NOW)).toBe(false)
  })

  test.each([undefined, '', 'garbage', `${NOW + 60_000}`, `${NOW + 60_000}.`])(
    'rejects malformed flag %j',
    (flag) => {
      expect(verifyPreviewFlag(SECRET, flag, NOW)).toBe(false)
    },
  )
})

describe('sanitizePerspective', () => {
  test.each(['published', 'drafts', 'rABC123,drafts'])('accepts %j', (value) => {
    expect(sanitizePerspective(value)).toBe(value)
  })

  test.each([null, undefined, '', 'drafts;', '*[_type]', 'a b'])('rejects %j', (value) => {
    expect(sanitizePerspective(value)).toBeUndefined()
  })
})

describe('sanitizeVariant', () => {
  test('accepts a bare id', () => {
    expect(sanitizeVariant('families')).toBe('families')
  })

  test.each([null, undefined, '', 'drafts.page', 'a,b', '../x'])('rejects %j', (value) => {
    expect(sanitizeVariant(value)).toBeUndefined()
  })
})
