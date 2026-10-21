import {describe, expect, test} from 'vitest'

import {audienceFromUtmSource, isAudience} from './audience'
import {audienceBasePath, parseEdition, withBase} from './routing'

describe('parseEdition', () => {
  test.each([
    ['/preview', {kind: 'preview', path: '/'}],
    ['/preview/visit', {kind: 'preview', path: '/visit'}],
    ['/for/families', {kind: 'audience', audience: 'families', path: '/'}],
    ['/for/stargazers/visit', {kind: 'audience', audience: 'stargazers', path: '/visit'}],
    ['/', {kind: 'public', path: '/'}],
    ['/visit', {kind: 'public', path: '/visit'}],
    ['/previews', {kind: 'public', path: '/previews'}],
    ['/for/aliens/visit', {kind: 'public', path: '/for/aliens/visit'}],
  ])('%s', (pathname, edition) => {
    expect(parseEdition(pathname)).toEqual(edition)
  })
})

describe('withBase', () => {
  const base = audienceBasePath('families')

  test('prefixes same-origin page links', () => {
    expect(withBase('/', base)).toBe('/for/families')
    expect(withBase('/visit', base)).toBe('/for/families/visit')
  })

  test.each([
    'https://example.com/',
    '//example.com/',
    '#tickets',
    '/api/preview/disable',
    '/_astro/x.js',
  ])('leaves %j untouched', (href) => {
    expect(withBase(href, base)).toBe(href)
  })

  test('is a no-op for the public edition', () => {
    expect(withBase('/visit', '')).toBe('/visit')
  })
})

describe('audience', () => {
  test('maps campaign sources case-insensitively', () => {
    expect(audienceFromUtmSource('Facebook')).toBe('families')
    expect(audienceFromUtmSource('astrobin')).toBe('stargazers')
  })

  test('ignores unknown or missing sources', () => {
    expect(audienceFromUtmSource('newsletter')).toBeUndefined()
    expect(audienceFromUtmSource(null)).toBeUndefined()
  })

  test('isAudience only accepts known editions', () => {
    expect(isAudience('families')).toBe(true)
    expect(isAudience('toString')).toBe(false)
    expect(isAudience(undefined)).toBe(false)
  })
})
