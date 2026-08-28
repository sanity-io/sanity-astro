import type {ExternalImageService, ImageTransform} from 'astro'
import {baseService} from 'astro/assets'

const SANITY_IMAGE_CDN = 'https://cdn.sanity.io/'

const QUALITY_PRESETS: Record<string, number> = {low: 50, mid: 65, high: 80, max: 100}

function resolveQuality(quality: ImageTransform['quality']): number {
  if (typeof quality === 'number') return quality
  return (quality === undefined ? undefined : QUALITY_PRESETS[quality]) ?? 75
}

/**
 * CSS `object-fit` values (what Astro passes) to Sanity CDN fit modes for a
 * `w`×`h` box. `crop` fills the box exactly, honoring the focal point.
 */
function resolveFit(fit: string | undefined): string {
  if (fit === 'contain' || fit === 'scale-down') return 'max'
  if (fit === 'fill') return 'scale'
  return 'crop'
}

/**
 * External image service for `astro:assets`: every `<Image />` transform is
 * answered by Sanity's image CDN directly, with no platform optimizer or
 * sharp endpoint in between. The base URL from `sanityImage()` already
 * carries the hotspot-aware crop `rect`, so derivatives only rewrite the box,
 * quality and `auto=format` (the CDN negotiates AVIF/WebP per browser;
 * explicit `format` requests are ignored on purpose, because content
 * negotiation always wins). SVGs and non-Sanity URLs pass through untouched.
 */
const service: ExternalImageService = {
  ...baseService,
  getURL(options) {
    const src = typeof options.src === 'string' ? options.src : options.src.src
    if (!src.startsWith(SANITY_IMAGE_CDN)) return src

    const url = new URL(src)
    if (url.pathname.endsWith('.svg')) return src

    if (options.width !== undefined) {
      url.searchParams.set('w', String(Math.round(options.width)))
    }
    if (options.height === undefined) {
      url.searchParams.set('fit', 'max')
    } else {
      url.searchParams.set('h', String(Math.round(options.height)))
      url.searchParams.set('fit', resolveFit(options.fit))
    }
    url.searchParams.set('q', String(resolveQuality(options.quality)))
    url.searchParams.set('auto', 'format')
    return url.toString()
  },
}

export default service
