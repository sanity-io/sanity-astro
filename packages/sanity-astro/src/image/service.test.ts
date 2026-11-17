import type {ImageTransform} from 'astro'
import sharpService from 'astro/assets/services/sharp'
import {describe, expect, test, vi} from 'vitest'

import service from './service'

type ImageConfig = Parameters<typeof service.getURL>[1]
type Logger = Parameters<typeof service.getURL>[2]

const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()} as unknown as Logger

function imageConfig(config: Record<string, unknown> = {}): ImageConfig {
  return {
    service: {entrypoint: '@sanity/astro/image/service', config},
    domains: [],
    remotePatterns: [],
  } as unknown as ImageConfig
}

const SANITY =
  'https://cdn.sanity.io/images/abc123/production/hash-640x873.jpg?rect=0,0,640,517&w=640&h=517'

async function validate(options: ImageTransform, config = imageConfig()) {
  if (!service.validateOptions) throw new Error('validateOptions is missing')
  return service.validateOptions({...options}, config, logger)
}

describe('sanity image service', () => {
  test('stores the CDN URL as src, so Astro skips build-time transforms', async () => {
    const validated = await validate({src: SANITY, width: 640, height: 517})
    expect(validated.src).not.toBe(SANITY)
    expect(new URL(validated.src as string).searchParams.get('auto')).toBe('format')
    expect(service.getURL(validated, imageConfig(), logger)).toBe(validated.src)
  })

  test('answers srcset candidates from the CDN', async () => {
    const validated = await validate({src: SANITY, width: 640, height: 517, widths: [320, 640]})
    const srcSet = (await service.getSrcSet?.(validated, imageConfig(), logger)) ?? []
    const urls = await Promise.all(
      srcSet.map((entry) => service.getURL(entry.transform, imageConfig(), logger)),
    )
    expect(urls.map((url) => new URL(url).searchParams.get('w'))).toEqual(['320', '640'])
    expect(urls.map((url) => new URL(url).searchParams.get('h'))).toEqual(['259', '517'])
    expect(urls.every((url) => new URL(url).searchParams.get('rect') === '0,0,640,517')).toBe(true)
    expect(urls[1]).toBe(validated.src)
  })

  test('still requires dimensions for remote images', async () => {
    await expect(validate({src: SANITY})).rejects.toThrow()
  })

  test('hands other images to the sharp service', async () => {
    const remote = 'https://example.com/photo.jpg'
    const validated = await validate({src: remote, width: 100, height: 100})
    expect(validated.src).toBe(remote)
    expect(service.getURL(validated, imageConfig(), logger)).toBe(
      await sharpService.getURL(validated, imageConfig(), logger),
    )
    expect(service.transform).toBe(sharpService.transform)
    expect(service.parseURL).toBe(sharpService.parseURL)
  })

  test('recognizes configured custom CDN hostnames', async () => {
    const custom = 'https://images.example.com/images/abc123/production/hash-640x873.jpg'
    const config = imageConfig({hostnames: ['images.example.com']})
    const validated = await validate({src: custom, width: 320, height: 436}, config)
    expect(new URL(validated.src as string).searchParams.get('w')).toBe('320')
    expect(service.getURL(validated, config, logger)).toBe(validated.src)
  })

  test('reads remote sizes of Sanity images from the URL without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await service.getRemoteSize?.(SANITY, imageConfig(), logger)).toEqual({
      width: 640,
      height: 517,
      format: 'jpg',
    })
    expect(
      await service.getRemoteSize?.(
        'https://cdn.sanity.io/images/abc123/production/hash-640x873.png',
        imageConfig(),
        logger,
      ),
    ).toEqual({width: 640, height: 873, format: 'png'})
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
