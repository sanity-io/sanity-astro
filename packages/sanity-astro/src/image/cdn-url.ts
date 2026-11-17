import type {ImageTransform} from 'astro'

export const DEFAULT_HOSTNAMES: readonly string[] = ['cdn.sanity.io']

/** The same presets Astro's default sharp service uses. */
const QUALITY_PRESETS: Record<string, number> = {low: 25, mid: 50, high: 80, max: 100}

/** Formats the CDN can be asked for with `fm`. Everything else is negotiated with `auto=format`. */
const EXPLICIT_FORMATS: Record<string, string> = {jpg: 'jpg', jpeg: 'jpg', png: 'png'}

export function isSanityImageUrl(
  src: ImageTransform['src'],
  hostnames: readonly string[] = DEFAULT_HOSTNAMES,
): src is string {
  if (typeof src !== 'string') return false
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return false
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    hostnames.includes(url.hostname) &&
    url.pathname.startsWith('/images/')
  )
}

function resolveQuality(quality: ImageTransform['quality']): number | undefined {
  if (typeof quality === 'number') return Math.round(quality)
  if (quality === undefined) return undefined
  const numeric = Number(quality)
  if (quality !== '' && Number.isFinite(numeric)) return Math.round(numeric)
  return QUALITY_PRESETS[quality]
}

/**
 * Astro's CSS `object-fit` values to Sanity CDN fit modes for a `w`×`h` box.
 * `min` fills the box like `cover` without upscaling past the source.
 */
function resolveFit(fit: string | undefined): string {
  if (fit === 'contain' || fit === 'inside' || fit === 'scale-down') return 'max'
  if (fit === 'fill') return 'scale'
  return 'min'
}

/**
 * The Sanity Image CDN URL for an `astro:assets` transform. The crop `rect`,
 * any `fit`, `fm` or effect params already on the URL (from
 * `getSanityImageProps()` or an `@sanity/image-url` builder) are kept; only
 * the box, quality and format are rewritten. With no explicit `jpg` or `png`
 * format the CDN negotiates AVIF or WebP per browser with `auto=format`.
 * SVGs are returned untouched.
 *
 * The result is stable: passing it back as `src` with the same transform
 * returns the same string.
 */
export function sanityImageUrl(options: ImageTransform): string {
  const src = typeof options.src === 'string' ? options.src : options.src.src
  const url = new URL(src)
  if (url.pathname.endsWith('.svg')) return src

  if (options.width !== undefined) {
    url.searchParams.set('w', String(Math.round(options.width)))
  }
  if (options.height === undefined) {
    url.searchParams.delete('h')
    if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'max')
  } else {
    url.searchParams.set('h', String(Math.round(options.height)))
    if (!url.searchParams.has('fit')) url.searchParams.set('fit', resolveFit(options.fit))
  }

  const quality = resolveQuality(options.quality)
  if (quality !== undefined) url.searchParams.set('q', String(quality))

  const format = options.format === undefined ? undefined : EXPLICIT_FORMATS[options.format]
  if (format !== undefined) {
    url.searchParams.set('fm', format)
    url.searchParams.delete('auto')
  } else if (!url.searchParams.has('fm')) {
    url.searchParams.set('auto', 'format')
  }
  return url.toString()
}
