import {describe, expect, test} from 'vitest'

import {isSanityImageUrl, sanityImageUrl} from './cdn-url'

const BASE =
  'https://cdn.sanity.io/images/abc123/production/hash-2000x1000.jpg?rect=0,0,2000,1000&w=800&h=400'

function params(options: Parameters<typeof sanityImageUrl>[0]): URLSearchParams {
  return new URL(sanityImageUrl(options)).searchParams
}

describe('isSanityImageUrl', () => {
  test('matches Sanity Image CDN URLs only', () => {
    expect(isSanityImageUrl(BASE)).toBe(true)
    expect(isSanityImageUrl('https://cdn.sanity.io/files/abc123/production/a.pdf')).toBe(false)
    expect(isSanityImageUrl('https://example.com/images/abc123/production/a-1x1.jpg')).toBe(false)
    expect(isSanityImageUrl('/_astro/local.png')).toBe(false)
    expect(isSanityImageUrl({src: '/_astro/local.png', width: 1, height: 1, format: 'png'})).toBe(
      false,
    )
  })

  test('accepts custom CDN hostnames', () => {
    const custom = 'https://images.example.com/images/abc123/production/a-1x1.jpg'
    expect(isSanityImageUrl(custom, ['images.example.com'])).toBe(true)
    expect(isSanityImageUrl(BASE, ['images.example.com'])).toBe(false)
  })
})

describe('sanityImageUrl', () => {
  test('sets the box and keeps the crop rect', () => {
    const result = params({src: BASE, width: 400.4, height: 200})
    expect(result.get('w')).toBe('400')
    expect(result.get('h')).toBe('200')
    expect(result.get('rect')).toBe('0,0,2000,1000')
    expect(result.get('fit')).toBe('min')
    expect(result.get('auto')).toBe('format')
    expect(result.has('q')).toBe(false)
  })

  test('drops the height cap for width-only transforms', () => {
    const result = params({src: BASE, width: 400})
    expect(result.has('h')).toBe(false)
    expect(result.get('fit')).toBe('max')
  })

  test('maps object-fit values to CDN fit modes', () => {
    expect(params({src: BASE, width: 1, height: 1, fit: 'contain'}).get('fit')).toBe('max')
    expect(params({src: BASE, width: 1, height: 1, fit: 'scale-down'}).get('fit')).toBe('max')
    expect(params({src: BASE, width: 1, height: 1, fit: 'fill'}).get('fit')).toBe('scale')
    expect(params({src: BASE, width: 1, height: 1, fit: 'cover'}).get('fit')).toBe('min')
  })

  test('keeps a fit mode that is already on the URL', () => {
    expect(params({src: `${BASE}&fit=crop`, width: 1, height: 1}).get('fit')).toBe('crop')
  })

  test('maps quality presets and numbers', () => {
    expect(params({src: BASE, width: 1, quality: 'high'}).get('q')).toBe('80')
    expect(params({src: BASE, width: 1, quality: 'low'}).get('q')).toBe('25')
    expect(params({src: BASE, width: 1, quality: 62.4}).get('q')).toBe('62')
    expect(params({src: BASE, width: 1, quality: '70'}).get('q')).toBe('70')
    expect(params({src: BASE, width: 1, quality: 'unknown'}).has('q')).toBe(false)
  })

  test('honors explicit jpg and png formats and negotiates the rest', () => {
    const jpg = params({src: BASE, width: 1, format: 'jpeg'})
    expect(jpg.get('fm')).toBe('jpg')
    expect(jpg.has('auto')).toBe(false)
    expect(params({src: BASE, width: 1, format: 'png'}).get('fm')).toBe('png')
    for (const format of ['webp', 'avif', undefined]) {
      const negotiated = params({src: BASE, width: 1, format})
      expect(negotiated.get('auto')).toBe('format')
      expect(negotiated.has('fm')).toBe(false)
    }
  })

  test('keeps an fm param that is already on the URL', () => {
    const result = params({src: `${BASE}&fm=png`, width: 1})
    expect(result.get('fm')).toBe('png')
    expect(result.has('auto')).toBe(false)
  })

  test('passes SVGs through untouched', () => {
    const svg = 'https://cdn.sanity.io/images/abc123/production/logo-100x100.svg'
    expect(sanityImageUrl({src: svg, width: 50, height: 50})).toBe(svg)
  })

  test('returns the same URL when its output is transformed again', () => {
    for (const transform of [
      {width: 640, height: 320},
      {width: 640},
      {width: 640, height: 320, quality: 'mid', format: 'jpg', fit: 'contain'},
    ]) {
      const first = sanityImageUrl({src: BASE, ...transform})
      expect(sanityImageUrl({src: first, ...transform})).toBe(first)
    }
  })
})
