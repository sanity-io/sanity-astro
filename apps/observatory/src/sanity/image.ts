import {createImageUrlBuilder, type SanityImageSource} from '@sanity/image-url'
import {PUBLIC_SANITY_DATASET, PUBLIC_SANITY_PROJECT_ID} from 'astro:env/server'

const builder = createImageUrlBuilder({
  projectId: PUBLIC_SANITY_PROJECT_ID,
  dataset: PUBLIC_SANITY_DATASET,
})

/**
 * Social scrapers want a fixed-size raster, so Open Graph images are pinned
 * to 1200×630 JPEG instead of format negotiation. The builder crops around
 * the editor's hotspot when the projection provides one.
 */
export function ogImageUrl(source: SanityImageSource): string {
  return builder.image(source).width(1200).height(630).fit('crop').format('jpg').url()
}

/** Shape of the image projection used by the GROQ queries. */
export interface ProjectedImage {
  alt?: string | null
  hotspot?: {
    x?: number | null
    y?: number | null
    width?: number | null
    height?: number | null
  } | null
  crop?: {
    top?: number | null
    bottom?: number | null
    left?: number | null
    right?: number | null
  } | null
  asset: {
    _id: string
    url: string | null
    mimeType: string | null
    metadata: {
      dimensions: {
        width: number | null
        height: number | null
        aspectRatio: number | null
      } | null
    } | null
  } | null
}

export interface SanityImageBase {
  src: string
  /** Rendered width, capped at the editor-cropped region's intrinsic width. */
  width: number
  /** Rendered height, following the crop or the explicitly requested aspect. */
  height: number
}

/**
 * Resolves a projected image into the `astro:assets` source for the given
 * rendered size. The URL builder computes the crop `rect` from the editor's
 * crop, moved towards the hotspot when `height` forces another aspect ratio,
 * and the image service in `astro.config.ts` turns the URL into responsive
 * derivatives per transform. SVGs are returned untransformed.
 */
export function sanityImage(
  image: ProjectedImage | null | undefined,
  size: {width: number; height?: number},
): SanityImageBase | null {
  const asset = image?.asset ?? null
  if (asset === null || asset.url === null) return null

  const intrinsicWidth = asset.metadata?.dimensions?.width ?? null
  const intrinsicHeight = asset.metadata?.dimensions?.height ?? null
  if (intrinsicWidth === null || intrinsicHeight === null) return null

  if (asset.mimeType === 'image/svg+xml') {
    return {src: asset.url, width: intrinsicWidth, height: intrinsicHeight}
  }

  const crop = image?.crop ?? null
  const hotspot = image?.hotspot ?? null
  const croppedWidth = Math.round(intrinsicWidth * (1 - (crop?.left ?? 0) - (crop?.right ?? 0)))
  const croppedHeight = Math.round(intrinsicHeight * (1 - (crop?.top ?? 0) - (crop?.bottom ?? 0)))

  const width = Math.min(size.width, croppedWidth)
  const height = Math.round(
    size.height === undefined
      ? width * (croppedHeight / croppedWidth)
      : (width * size.height) / size.width,
  )

  const src = builder
    .image({
      asset: {_id: asset._id},
      ...(crop === null ? {} : {crop}),
      ...(hotspot === null ? {} : {hotspot}),
    })
    .width(width)
    .height(height)
    .url()

  return {src, width, height}
}
