import type {CropMode, FitMode, ImageUrlBuilder} from '@sanity/image-url'

export type QueryParams = Record<string, string | number>

const SIZING_PARAMS = new Set(['w', 'h', 'rect'])

/**
 * Every fit and crop mode `@sanity/image-url` accepts. A new mode in that
 * library fails typechecking here until it is listed.
 */
const FIT_MODES: Record<FitMode, true> = {
  clip: true,
  crop: true,
  fill: true,
  fillmax: true,
  max: true,
  scale: true,
  min: true,
}

const CROP_MODES: Record<CropMode, true> = {
  top: true,
  bottom: true,
  left: true,
  right: true,
  center: true,
  focalpoint: true,
  entropy: true,
}

/**
 * Params that change the rect `@sanity/image-url` emits, rather than CDN
 * effects applied afterwards. They have to be set on the builder before
 * `url()`: appending them later leaves the crop and hotspot computed as if
 * they were unset, and the builder writes the param itself.
 *
 * Pass-through params (`blur`, `sat`, `flip`, …) are still appended
 * afterwards, so a URL that does not set `fit`, a crop mode or a focal point
 * stays the same.
 */
export function withBuilderQueryParams(
  builder: ImageUrlBuilder,
  queryParams: QueryParams | undefined,
): {builder: ImageUrlBuilder; forwarded: ReadonlySet<string>} {
  const forwarded = new Set<string>()
  if (!queryParams) return {builder, forwarded}

  let next = builder
  const fit = queryParams['fit']
  if (fit !== undefined) {
    next = next.fit(readBuilderMode(FIT_MODES, fit, 'fit'))
    forwarded.add('fit')
  }
  const crop = queryParams['crop']
  if (crop !== undefined) {
    next = next.crop(readBuilderMode(CROP_MODES, crop, 'crop'))
    forwarded.add('crop')
  }

  const focalX = queryParams['fp-x']
  const focalY = queryParams['fp-y']
  if (focalX !== undefined && focalY !== undefined) {
    const x = Number(focalX)
    const y = Number(focalY)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      next = next.focalPoint(x, y)
      forwarded.add('fp-x')
      forwarded.add('fp-y')
    }
  }

  return {builder: next, forwarded}
}

function readBuilderMode<Mode extends string>(
  modes: Record<Mode, true>,
  value: string | number,
  param: 'fit' | 'crop',
): Mode {
  const mode = `${value}`
  if (isBuilderMode(modes, mode)) return mode
  throw new TypeError(
    `Invalid \`queryParams.${param}\` value "${mode}". Expected one of: ${Object.keys(modes).join(', ')}.`,
  )
}

function isBuilderMode<Mode extends string>(
  modes: Record<Mode, true>,
  value: string,
): value is Mode {
  return Object.hasOwn(modes, value)
}

export function applyQueryParams(
  url: URL,
  queryParams: QueryParams | undefined,
  forwarded: ReadonlySet<string>,
): void {
  if (!queryParams) return
  for (const [key, value] of Object.entries(queryParams)) {
    if (SIZING_PARAMS.has(key) || forwarded.has(key)) continue
    url.searchParams.set(key, `${value}`)
  }
}
