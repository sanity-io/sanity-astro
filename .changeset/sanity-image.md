---
'@sanity/astro': minor
---

Add `<SanityImage>` and `sanityImageService()` for rendering Sanity images through `astro:assets` (Astro 5 or later). `src` takes whole image values (TypeGen types, image objects, asset documents and references, stega-encoded values) as well as CDN URLs. The Studio crop is applied, the CDN crops around the hotspot when the aspect ratio changes, `object-position` follows the hotspot, missing `width` and `height` are inferred without a request, and `placeholder="blur"` uses the asset's LQIP. `@sanity/astro/image` also exports `getSanityImageProps()` for `<Picture>` and `getImage()`, plus `isImageWithAsset`, `InferImageValue` and `InferStrictImageValue`.
