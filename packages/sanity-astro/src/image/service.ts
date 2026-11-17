import type {ImageInputFormat, ImageTransform, LocalImageService} from 'astro'
import sharpService from 'astro/assets/services/sharp'

import {DEFAULT_HOSTNAMES, isSanityImageUrl, sanityImageUrl} from './cdn-url.js'
import {assetFormatOf, resolveImageDimensions} from './image-dimensions.js'

type SharpImageServiceConfig =
  typeof sharpService extends LocalImageService<infer Config> ? Config : Record<string, unknown>

type SanityImageServiceConfig = SharpImageServiceConfig & {hostnames?: string[]}

type ServiceImageConfig = Parameters<LocalImageService<SanityImageServiceConfig>['getURL']>[1]

function hostnamesOf(imageConfig: ServiceImageConfig): readonly string[] {
  return imageConfig.service.config?.hostnames ?? DEFAULT_HOSTNAMES
}

function isSanity(options: ImageTransform, imageConfig: ServiceImageConfig): boolean {
  return isSanityImageUrl(options.src, hostnamesOf(imageConfig))
}

/**
 * `astro:assets` image service. Sanity Image CDN URLs are resized, cropped and
 * format-negotiated by the CDN itself; every other image goes to Astro's
 * default sharp service unchanged.
 *
 * Astro skips its build-time transform for a remote image whose final URL
 * equals the validated `src`, so `validateOptions` stores the CDN URL as
 * `src` and `getURL` reproduces it exactly. The srcset candidates are CDN
 * URLs as well, and nothing is downloaded or re-encoded at build time.
 */
const service: LocalImageService<SanityImageServiceConfig> = {
  ...sharpService,
  async validateOptions(options, imageConfig, logger) {
    const validated = sharpService.validateOptions
      ? await sharpService.validateOptions(options, imageConfig, logger)
      : options
    if (!isSanity(validated, imageConfig)) return validated
    return {...validated, src: sanityImageUrl(validated)}
  },
  getURL(options, imageConfig, logger) {
    if (isSanity(options, imageConfig)) return sanityImageUrl(options)
    return sharpService.getURL(options, imageConfig, logger)
  },
}

// Astro 5 and earlier infer remote sizes without asking the service.
const getSharpRemoteSize = sharpService.getRemoteSize
if (getSharpRemoteSize) {
  service.getRemoteSize = (url, imageConfig, logger) => {
    if (isSanityImageUrl(url, hostnamesOf(imageConfig))) {
      const srcUrl = new URL(url)
      const {width, height} = resolveImageDimensions(srcUrl, undefined, undefined)
      const format = assetFormatOf(srcUrl)
      if (width !== undefined && height !== undefined && format !== undefined) {
        return {width, height, format: format as ImageInputFormat}
      }
    }
    return getSharpRemoteSize(url, imageConfig, logger)
  }
}

export default service
