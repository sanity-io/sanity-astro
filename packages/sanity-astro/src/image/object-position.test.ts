import {describe, expect, test} from 'vitest'

import {hotspotObjectPosition} from './object-position'

const asset = {_ref: 'image-abc-1000x1000-jpg', _type: 'reference'}
const image = {asset, hotspot: {x: 0.2, y: 0.3}}

describe('hotspotObjectPosition', () => {
  test('returns nothing without a hotspot', () => {
    expect(hotspotObjectPosition({asset}, undefined, undefined)).toBeUndefined()
    expect(hotspotObjectPosition({asset, hotspot: null}, undefined, undefined)).toBeUndefined()
    expect(
      hotspotObjectPosition('https://cdn.sanity.io/x.jpg', undefined, undefined),
    ).toBeUndefined()
  })

  test('is relative to the crop and clamped to it', () => {
    const cropped = {asset, hotspot: {x: 0.5, y: 0.05}, crop: {left: 0.25, right: 0.25, top: 0.1}}
    expect(hotspotObjectPosition(cropped, undefined, undefined)).toBe('50% 0%')
  })

  test('falls back to the center for missing coordinates and full-axis crops', () => {
    expect(hotspotObjectPosition({asset, hotspot: {}}, undefined, undefined)).toBe('50% 50%')
    const fullCrop = {asset, hotspot: {x: 0.2, y: 0.3}, crop: {left: 0.5, right: 0.5}}
    expect(hotspotObjectPosition(fullCrop, undefined, undefined)).toBe('20% 30%')
  })

  test.each([
    ['h', undefined, '80% 30%'],
    ['v', undefined, '20% 70%'],
    ['hv', undefined, '80% 70%'],
    ['x', undefined, '20% 30%'],
    [undefined, 90, '70% 20%'],
    [undefined, '180', '80% 70%'],
    [undefined, 270, '30% 80%'],
    [undefined, 45, '20% 30%'],
  ] as const)('follows flip=%s and or=%s', (flip, orientation, expected) => {
    expect(hotspotObjectPosition(image, flip, orientation)).toBe(expected)
  })
})
