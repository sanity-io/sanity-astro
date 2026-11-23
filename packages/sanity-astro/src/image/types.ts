import type {RemoteImageProps} from 'astro/assets'
import type {HTMLAttributes} from 'astro/types'

import type {GetSanityImagePropsOptions} from './image-props.js'
import type {ImageSource} from './image-source.js'

type ImgAttributes = Omit<HTMLAttributes<'img'>, 'src' | 'width' | 'height' | 'srcset'> & {
  alt: string
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * Props of `<SanityImage>`: every `<Image>` prop from `astro:assets`, with a
 * Sanity image value as `src`, a required `alt` string, optional `width` and
 * `height`, and the Sanity options of `getSanityImageProps()`.
 */
export type SanityImageProps = DistributiveOmit<
  RemoteImageProps<ImgAttributes>,
  'src' | 'alt' | 'width' | 'height' | 'inferSize'
> &
  Omit<GetSanityImagePropsOptions, 'fit' | 'position' | 'style'> & {
  /**
   * The image to render: a Sanity Image CDN URL (from `asset->url` or an
   * `@sanity/image-url` builder), an image object from a GROQ query
   * (`{asset, crop, hotspot}`), an asset document or reference, or an asset
   * id (`image-…`). The crop set in the Studio is applied, and stega-encoded
   * metadata from Content Source Maps is stripped automatically.
   */
  src: ImageSource
  /**
   * Alternative text for the image. Required for accessibility and to carry
   * the stega metadata that Visual Editing uses to attach image overlays.
   */
  alt: string
}

/**
 * Props of `<SanityTextImage>`: identical to `<SanityImage>`, substituting
 * `node` in place of `src`.
 */
export type SanityTextImageProps = DistributiveOmit<SanityImageProps, 'src'> & {
  /**
   * The image to render: a Sanity Image CDN URL (from `asset->url` or an
   * `@sanity/image-url` builder), an image object from a GROQ query
   * (`{asset, crop, hotspot}`), an asset document or reference, or an asset
   * id (`image-…`). The crop set in the Studio is applied, and stega-encoded
   * metadata from Content Source Maps is stripped automatically.
   */
  node: SanityImageProps['src']
}