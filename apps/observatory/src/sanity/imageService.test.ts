import {expect, test} from 'vitest'

import {sanityImageUrl} from './imageService'

const BASE =
  'https://cdn.sanity.io/images/pv8y60vp/astro/abc-2000x1000.jpg?rect=0,0,2000,1000&w=800&h=400'

function url(options: Parameters<typeof sanityImageUrl>[0]): URL {
  return new URL(sanityImageUrl(options))
}

test('width-only transforms drop the height cap and keep the crop rect', () => {
  const result = url({src: BASE, width: 400})
  expect(result.searchParams.get('w')).toBe('400')
  expect(result.searchParams.has('h')).toBe(false)
  expect(result.searchParams.get('fit')).toBe('max')
  expect(result.searchParams.get('rect')).toBe('0,0,2000,1000')
  expect(result.searchParams.get('auto')).toBe('format')
  expect(result.searchParams.get('q')).toBe('75')
})

test('sized transforms map object-fit and quality presets', () => {
  const result = url({src: BASE, width: 300.4, height: 200, fit: 'contain', quality: 'high'})
  expect(result.searchParams.get('w')).toBe('300')
  expect(result.searchParams.get('h')).toBe('200')
  expect(result.searchParams.get('fit')).toBe('max')
  expect(result.searchParams.get('q')).toBe('80')
})

test('defaults to a focal-point crop for a fixed box', () => {
  expect(url({src: BASE, width: 300, height: 300}).searchParams.get('fit')).toBe('crop')
})

test('passes SVGs and non-Sanity URLs through untouched', () => {
  const svg = 'https://cdn.sanity.io/images/pv8y60vp/astro/logo-100x100.svg'
  const external = 'https://example.com/photo.jpg'
  expect(sanityImageUrl({src: svg, width: 50})).toBe(svg)
  expect(sanityImageUrl({src: external, width: 50})).toBe(external)
})
