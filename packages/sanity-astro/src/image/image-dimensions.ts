export type Dimension = number | `${number}`

export interface Dimensions {
  width: number
  height: number
}

/**
 * Sanity encodes the original dimensions of every image asset into its
 * filename, e.g. `…/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg`. The CDN also
 * accepts a vanity filename after it (`…-2000x3000.jpg/my-photo.jpg`), so the
 * match may be followed by one more path segment, which is ignored.
 */
const FILENAME_DIMENSIONS = /-(\d+)x(\d+)\.(\w+)(?:\/[^/]+)?$/

function parsePositiveInt(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toPositiveInt(value: Dimension | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * The file extension of a Sanity asset URL (`jpg`, `png`, `svg`, …), read from
 * the filename that encodes the original dimensions.
 */
export function assetFormatOf(srcUrl: URL): string | undefined {
  return FILENAME_DIMENSIONS.exec(srcUrl.pathname)?.[3]?.toLowerCase()
}

/**
 * The intrinsic dimensions of the image a Sanity CDN URL points at: the
 * `rect` crop region when present (what the CDN will actually serve),
 * otherwise the original dimensions encoded in the asset filename.
 */
export function intrinsicDimensionsOf(srcUrl: URL): Dimensions | undefined {
  const rect = srcUrl.searchParams.get('rect')?.split(',')
  if (rect?.length === 4) {
    const width = parsePositiveInt(rect[2])
    const height = parsePositiveInt(rect[3])
    if (width && height) return {width, height}
  }
  const filename = FILENAME_DIMENSIONS.exec(srcUrl.pathname)
  if (filename) {
    const width = parsePositiveInt(filename[1])
    const height = parsePositiveInt(filename[2])
    if (width && height) return {width, height}
  }
  return undefined
}

/**
 * Resolves the display dimensions for an image, in order of precedence:
 *
 * 1. The `width` and `height` options.
 * 2. The `w` and `h` params on the src URL (e.g. from an `@sanity/image-url`
 *    builder).
 * 3. Derived from the image's intrinsic aspect ratio, when only one dimension
 *    is known.
 * 4. The intrinsic dimensions: the `rect` crop region when present, otherwise
 *    the original dimensions Sanity encodes in the asset filename.
 */
export function resolveImageDimensions(
  srcUrl: URL | undefined,
  optionWidth: Dimension | undefined,
  optionHeight: Dimension | undefined,
): Partial<Dimensions> {
  const width = toPositiveInt(optionWidth) ?? parsePositiveInt(srcUrl?.searchParams.get('w'))
  const height = toPositiveInt(optionHeight) ?? parsePositiveInt(srcUrl?.searchParams.get('h'))
  if (width !== undefined && height !== undefined) {
    return {width, height}
  }
  const intrinsic = srcUrl && intrinsicDimensionsOf(srcUrl)
  if (!intrinsic) {
    return {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
    }
  }
  if (width !== undefined) {
    return {width, height: scale(width, intrinsic.width, intrinsic.height)}
  }
  if (height !== undefined) {
    return {width: scale(height, intrinsic.height, intrinsic.width), height}
  }
  return intrinsic
}

/**
 * Scales `known` from the `from` axis onto the `to` axis, clamped to 1px so
 * extreme aspect ratios never collapse the derived dimension to zero.
 */
function scale(known: number, from: number, to: number): number {
  return Math.max(1, Math.round((known / from) * to))
}
