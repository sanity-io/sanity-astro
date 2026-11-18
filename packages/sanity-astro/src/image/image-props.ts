import {stegaClean} from '@sanity/client/stega'
import type {ImageUrlBuilder} from '@sanity/image-url'
import type {HTMLAttributes} from 'astro/types'

import {type Dimension, resolveImageDimensions} from './image-dimensions.js'
import {imageBuilderFor, isSanityAssetId, type ImageSource} from './image-source.js'
import {hotspotObjectPosition} from './object-position.js'
import {blurPlaceholderStyle, lqipFrom} from './placeholder.js'
import {defaultProject} from './project.js'
import {applyQueryParams, type QueryParams, withBuilderQueryParams} from './query-params.js'

type StyleValue = HTMLAttributes<'img'>['style']

export interface GetSanityImagePropsOptions {
  /**
   * Rendered width. When omitted it is inferred from the URL's `w` param, the
   * crop `rect`, or the original dimensions Sanity encodes in every asset
   * filename. Giving only one dimension derives the other from the aspect ratio.
   */
  width?: Dimension | undefined
  /**
   * Rendered height, see `width`. When `width` and `height` change the aspect
   * ratio, the CDN crop is positioned around the hotspot set in the Studio.
   */
  height?: Dimension | undefined
  /**
   * The Sanity project the image belongs to, used (together with `dataset`) to
   * build the URL when `src` is an image object or asset id. Falls back to the
   * project in the asset URL when the query dereferences it, then to the
   * integration's client config.
   */
  projectId?: string | undefined
  /** The Sanity dataset the image belongs to, see `projectId`. */
  dataset?: string | undefined
  /**
   * Additional [Sanity Image CDN params](https://www.sanity.io/docs/image-urls)
   * merged into the image URL, e.g. `{blur: 50, sat: -100}`. Sizing params
   * (`w`, `h`, `rect`) are ignored: they come from `width`/`height`, the URL
   * and the image object's crop and hotspot.
   *
   * For image objects and asset ids, `fit`, the crop mode (`crop`) and a focal
   * point (`fp-x` and `fp-y` together) are forwarded to the image URL builder
   * before it computes the crop and hotspot.
   */
  queryParams?: QueryParams | undefined
  /**
   * `blur` paints a blurred `asset->metadata.lqip` (or `blurDataURL`) behind
   * the image until it loads. Defaults to `empty`.
   */
  placeholder?: 'blur' | 'empty' | undefined
  /** Overrides the preview `placeholder="blur"` reads from the image object. */
  blurDataURL?: string | undefined
  /** The `fit` passed to `astro:assets`, see `position`. */
  fit?: string | undefined
  /**
   * The `position` passed to `astro:assets`. When it is unset, the style has
   * no `object-position`, and `fit` is not `contain`, `scale-down` or `fill`,
   * `object-position` defaults to the hotspot, so an image the browser crops
   * (`object-fit: cover`) keeps its subject in frame. Skipped when `width`
   * and `height` already make the CDN crop around the hotspot.
   */
  position?: string | undefined
  /** The image's own `style`, merged after the hotspot and placeholder styles. */
  style?: StyleValue
}

/** Props to spread into `<Image>`, `<Picture>` or `getImage()` from `astro:assets`. */
export type SanityImageAttributes = {src: string; style?: StyleValue} & (
  | {width: number; height: number}
  | {inferSize: true}
)

const NON_CROPPING_FITS = new Set(['contain', 'scale-down', 'fill'])

/**
 * Resolves a Sanity image into the `src`, `width` and `height` that
 * `astro:assets` needs, plus a `style` for the hotspot `object-position` and
 * the blur placeholder. `<SanityImage>` renders `<Image>` with these. Call it
 * directly for `<Picture>`, or for art direction with `getImage()` per
 * breakpoint.
 *
 * `src` takes a Sanity Image CDN URL, an asset id, an asset reference or
 * document, or an image object from a GROQ query (TypeGen and stega-encoded
 * results included). The crop set in the Studio is applied, and stega
 * metadata is stripped from the asset id and URL.
 */
export function getSanityImageProps(
  src: ImageSource,
  options: GetSanityImagePropsOptions = {},
): SanityImageAttributes {
  const {queryParams} = options
  const source = typeof src === 'string' ? stegaClean(src) : src

  let srcUrl: URL | undefined
  let builder: ImageUrlBuilder | undefined
  let forwarded: ReadonlySet<string> = new Set()
  if (typeof source === 'string' && !isSanityAssetId(source)) {
    // data: and blob: URLs can't point to the Sanity Image CDN and don't support
    // transformation params: they are passed through untouched.
    if (!source.startsWith('data:') && !source.startsWith('blob:')) {
      try {
        srcUrl = new URL(source)
      } catch (err) {
        throw new TypeError('The `src` must be a valid URL to an image on the Sanity Image CDN.', {
          cause: err,
        })
      }
    }
  } else {
    const built = withBuilderQueryParams(
      imageBuilderFor(source, {
        projectId: options.projectId,
        dataset: options.dataset,
        fallback: defaultProject,
      }),
      queryParams,
    )
    builder = built.builder
    forwarded = built.forwarded
    srcUrl = new URL(builder.url())
  }

  if (srcUrl) applyQueryParams(srcUrl, queryParams, forwarded)
  const {width, height} = resolveImageDimensions(srcUrl, options.width, options.height)
  // Whether the CDN serves a different region than the Studio crop, because
  // `width` and `height` changed the aspect ratio.
  let reframed = false
  if (srcUrl) {
    // Rebuild with the resolved dimensions, so the crop region is positioned
    // around the hotspot when the aspect ratio changes.
    if (builder && width !== undefined && height !== undefined) {
      const studioRect = srcUrl.searchParams.get('rect')
      srcUrl = new URL(builder.width(width).height(height).url())
      applyQueryParams(srcUrl, queryParams, forwarded)
      reframed = srcUrl.searchParams.get('rect') !== studioRect
    }
    if (width !== undefined) srcUrl.searchParams.set('w', `${width}`)
    if (height !== undefined) srcUrl.searchParams.set('h', `${height}`)
  }

  const positionIsExplicit = options.position !== undefined || hasObjectPosition(options.style)
  const objectPosition =
    reframed ||
    positionIsExplicit ||
    (options.fit !== undefined && NON_CROPPING_FITS.has(options.fit))
      ? undefined
      : hotspotObjectPosition(source, queryParams?.['flip'], queryParams?.['or'])

  const blurDataURL =
    options.placeholder === 'blur' ? (options.blurDataURL ?? lqipFrom(src)) : undefined
  const generated: string[] = []
  if (objectPosition) generated.push(`object-position:${objectPosition}`)
  if (blurDataURL && width !== undefined && height !== undefined) {
    generated.push(
      blurPlaceholderStyle({
        blurDataURL,
        width,
        height,
        fit: options.fit,
        position: options.position ?? objectPosition,
      }),
    )
  }
  const style = generated.length > 0 ? mergeStyles(generated, options.style) : options.style

  const result = srcUrl ? srcUrl.toString() : (source as string)
  const sized =
    width !== undefined && height !== undefined
      ? {src: result, width, height}
      : {src: result, inferSize: true as const}
  return style === undefined ? sized : {...sized, style}
}

function hasObjectPosition(style: StyleValue): boolean {
  if (typeof style === 'string') return /(^|;)\s*object-position\s*:/i.test(style)
  if (style && typeof style === 'object') {
    return 'objectPosition' in style || 'object-position' in style
  }
  return false
}

function mergeStyles(generated: string[], style: StyleValue): string {
  const own = typeof style === 'string' ? style : style ? styleObjectToString(style) : ''
  return [...generated, own].filter((part) => part.trim() !== '').join(';')
}

/** Serializes a style object the way Astro does for the `style` attribute. */
function styleObjectToString(style: object): string {
  return Object.entries(style)
    .filter(
      ([, value]) =>
        (typeof value === 'string' && value.trim() !== '') || typeof value === 'number',
    )
    .map(([key, value]) => {
      const property = key.startsWith('--')
        ? key
        : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      return `${property}:${value}`
    })
    .join(';')
}
