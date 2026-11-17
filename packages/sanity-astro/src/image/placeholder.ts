import {isRecord, type ImageSource} from './image-source.js'

/**
 * The low-quality image preview of an image object (`asset->metadata.lqip`)
 * or asset document (`metadata.lqip`). `metadata` is not part of the
 * `@sanity/image-url` source type, so it is read structurally.
 */
export function lqipFrom(src: ImageSource): string | undefined {
  if (!isRecord(src)) return undefined
  const holder: unknown = 'asset' in src ? src.asset : src
  if (!isRecord(holder) || !isRecord(holder['metadata'])) return undefined
  const lqip = holder['metadata']['lqip']
  return typeof lqip === 'string' && lqip !== '' ? lqip : undefined
}

/**
 * The CSS for a blurred placeholder behind the image, the same SVG blur
 * filter `next/image` uses: the tiny preview is scaled up through a Gaussian
 * blur with its edges kept opaque, and painted as the `<img>` background
 * until the image itself covers it.
 */
export function blurPlaceholderStyle({
  blurDataURL,
  width,
  height,
  fit,
  position,
}: {
  blurDataURL: string
  width: number
  height: number
  fit: string | undefined
  position: string | undefined
}): string {
  const std = 20
  const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='${std}'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='${std}'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='${blurDataURL}'/%3E%3C/svg%3E`
  const size = fit === 'contain' ? 'contain' : fit === 'fill' ? '100% 100%' : 'cover'
  return [
    `background-image:url("data:image/svg+xml;charset=utf-8,${svg}")`,
    `background-size:${size}`,
    `background-position:${position ?? '50% 50%'}`,
    'background-repeat:no-repeat',
  ].join(';')
}
