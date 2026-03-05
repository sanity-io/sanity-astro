import {describe, expect, it} from 'vitest'
import {normalizeStudioBasePath, studioRoutePattern} from './studio-base-path'

describe('studio base path helpers', () => {
  it('normalizes base paths with or without slashes', () => {
    expect(normalizeStudioBasePath('/admin')).toBe('/admin')
    expect(normalizeStudioBasePath('admin')).toBe('/admin')
    expect(normalizeStudioBasePath('/admin/')).toBe('/admin')
    expect(normalizeStudioBasePath('//admin//')).toBe('/admin')
  })

  it('returns undefined for empty-ish values', () => {
    expect(normalizeStudioBasePath(undefined)).toBeUndefined()
    expect(normalizeStudioBasePath('')).toBeUndefined()
    expect(normalizeStudioBasePath('/')).toBeUndefined()
  })

  it('builds route patterns for browser and hash history', () => {
    expect(studioRoutePattern('/admin', 'browser')).toBe('/admin/[...params]')
    expect(studioRoutePattern('/admin', 'hash')).toBe('/admin')
    expect(studioRoutePattern(undefined, 'browser')).toBeUndefined()
  })
})
