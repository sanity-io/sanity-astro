import {vercelStegaCombine} from '@vercel/stega'
import {describe, expect, test} from 'vitest'

import {getSanityImageProps, type SanityImageAttributes} from './image-props'

const projectId = 'abc123'
const dataset = 'production'
const project = {projectId, dataset}

function ref(id: string, size = '2000x1000', format = 'jpg') {
  return {_ref: `image-${id}-${size}-${format}`, _type: 'reference'}
}

function cdnUrl(id: string, size = '2000x1000', format = 'jpg', path = 'abc123/production') {
  return `https://cdn.sanity.io/images/${path}/${id}-${size}.${format}`
}

function paramsOf(props: SanityImageAttributes): Record<string, string> {
  return Object.fromEntries(new URL(props.src).searchParams)
}

function dimensionsOf(props: SanityImageAttributes) {
  return 'width' in props ? {width: props.width, height: props.height} : 'inferSize'
}

const lqip = 'data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIC'

describe('URLs', () => {
  test('infers the dimensions of a bare CDN URL from the asset filename', () => {
    const props = getSanityImageProps(cdnUrl('plain'))
    expect(dimensionsOf(props)).toEqual({width: 2000, height: 1000})
    expect(props.src).toBe(`${cdnUrl('plain')}?w=2000&h=1000`)
  })

  test('derives the missing dimension from the aspect ratio', () => {
    expect(dimensionsOf(getSanityImageProps(cdnUrl('w'), {width: 800}))).toEqual({
      width: 800,
      height: 400,
    })
    expect(dimensionsOf(getSanityImageProps(cdnUrl('h'), {height: '250'}))).toEqual({
      width: 500,
      height: 250,
    })
    expect(dimensionsOf(getSanityImageProps(cdnUrl('thin', '10000x1'), {width: 100}))).toEqual({
      width: 100,
      height: 1,
    })
  })

  test('reads w/h and rect params from @sanity/image-url builder URLs', () => {
    expect(dimensionsOf(getSanityImageProps(`${cdnUrl('wh')}?w=600&h=300`))).toEqual({
      width: 600,
      height: 300,
    })
    expect(dimensionsOf(getSanityImageProps(`${cdnUrl('rect')}?rect=0,0,500,500`))).toEqual({
      width: 500,
      height: 500,
    })
    expect(
      dimensionsOf(getSanityImageProps(`${cdnUrl('rect')}?rect=0,0,500,250`, {width: 100})),
    ).toEqual({width: 100, height: 50})
  })

  test('ignores a vanity filename after the asset filename', () => {
    expect(dimensionsOf(getSanityImageProps(`${cdnUrl('vanity')}/my-photo.jpg`))).toEqual({
      width: 2000,
      height: 1000,
    })
  })

  test('strips stega-encoded metadata from the URL', () => {
    const encoded = vercelStegaCombine(cdnUrl('stega'), {origin: 'sanity.io', href: '/'}, false)
    expect(encoded).not.toBe(cdnUrl('stega'))
    expect(getSanityImageProps(encoded).src).toBe(`${cdnUrl('stega')}?w=2000&h=1000`)
  })

  test('falls back to inferSize when the dimensions are unknown', () => {
    const props = getSanityImageProps('https://example.com/photo.jpg')
    expect(props).toEqual({src: 'https://example.com/photo.jpg', inferSize: true})
  })

  test('passes data: and blob: URLs through untouched', () => {
    expect(getSanityImageProps(lqip, {width: 20, height: 10})).toEqual({
      src: lqip,
      width: 20,
      height: 10,
    })
    expect(getSanityImageProps('blob:https://example.com/id')).toEqual({
      src: 'blob:https://example.com/id',
      inferSize: true,
    })
  })

  test('throws for relative URLs', () => {
    expect(() => getSanityImageProps('/photo.jpg')).toThrow(TypeError)
  })
})

describe('image objects', () => {
  test('builds the URL from an asset reference', () => {
    const props = getSanityImageProps({asset: ref('plainref')}, project)
    expect(props.src).toBe(`${cdnUrl('plainref')}?w=2000&h=1000`)
    expect(dimensionsOf(props)).toEqual({width: 2000, height: 1000})
  })

  test('accepts the null members sanity typegen generates', () => {
    const props = getSanityImageProps(
      {_type: 'image', asset: ref('nullish'), crop: null, hotspot: null, alt: null},
      {...project, width: 800},
    )
    expect(dimensionsOf(props)).toEqual({width: 800, height: 400})
  })

  test('applies the Studio crop and infers the cropped dimensions', () => {
    const props = getSanityImageProps(
      {
        asset: ref('cropped', '2000x3000'),
        crop: {top: 0.1, bottom: 0.1, left: 0.1, right: 0.1},
      },
      project,
    )
    expect(dimensionsOf(props)).toEqual({width: 1600, height: 2400})
    expect(paramsOf(props).rect).toBe('200,300,1600,2400')
  })

  test('fills omitted crop insets with zero', () => {
    const props = getSanityImageProps(
      {asset: ref('partialcrop', '2000x3000'), crop: {left: 0.1}},
      {...project, width: 800, height: 400},
    )
    expect(paramsOf(props).rect).toBe('200,1050,1800,900')
  })

  test('positions the CDN crop around the hotspot when the aspect ratio differs', () => {
    const props = getSanityImageProps(
      {
        asset: ref('hotspotted', '2000x3000'),
        crop: {top: 0.1, bottom: 0.1, left: 0.1, right: 0.1},
        hotspot: {x: 0.5, y: 0.25, width: 0.2, height: 0.2},
      },
      {...project, width: 800, height: 400},
    )
    // A 2:1 window of the 1600x2400 crop, centered on the hotspot at y=750.
    expect(paramsOf(props)).toMatchObject({rect: '200,350,1600,800', w: '800', h: '400'})
    expect(props.style).toBeUndefined()
  })

  test('reads the project from a dereferenced asset URL and keeps custom CDN domains', () => {
    expect(
      getSanityImageProps({asset: {_id: 'image-deref-2000x1000-jpg', url: cdnUrl('deref')}}).src,
    ).toBe(`${cdnUrl('deref')}?w=2000&h=1000`)
    const custom = 'https://images.example.com/images/abc123/production/custom-2000x1000.jpg'
    expect(getSanityImageProps({asset: {url: custom}}).src).toBe(`${custom}?w=2000&h=1000`)
  })

  test('explicit projectId and dataset win over the asset URL', () => {
    const props = getSanityImageProps(
      {asset: {_id: 'image-other-2000x1000-jpg', url: cdnUrl('other')}},
      {projectId: 'override', dataset: 'staging'},
    )
    expect(props.src).toBe(
      `${cdnUrl('other', '2000x1000', 'jpg', 'override/staging')}?w=2000&h=1000`,
    )
  })

  test('falls back to the integration client config', () => {
    expect(getSanityImageProps({asset: ref('fallback')}).src).toBe(
      `${cdnUrl('fallback', '2000x1000', 'jpg', 'stubproject/stubdataset')}?w=2000&h=1000`,
    )
  })

  test('accepts asset references, asset documents and asset ids', () => {
    const expected = `${cdnUrl('asset')}?w=2000&h=1000`
    expect(getSanityImageProps(ref('asset'), project).src).toBe(expected)
    expect(getSanityImageProps({_id: 'image-asset-2000x1000-jpg'}, project).src).toBe(expected)
    expect(getSanityImageProps('image-asset-2000x1000-jpg', project).src).toBe(expected)
    expect(getSanityImageProps({_id: 'image-asset-2000x1000-jpg', url: cdnUrl('asset')}).src).toBe(
      expected,
    )
  })

  test('ignores a document _id and builds from the asset reference', () => {
    expect(getSanityImageProps({_id: 'post-1', asset: ref('doc')}, project).src).toBe(
      `${cdnUrl('doc')}?w=2000&h=1000`,
    )
  })

  test('strips stega-encoded metadata from asset references', () => {
    const encoded = vercelStegaCombine(ref('stegaref')._ref, {origin: 'sanity.io', href: '/'})
    expect(getSanityImageProps({asset: {_ref: encoded}}, project).src).toBe(
      `${cdnUrl('stegaref')}?w=2000&h=1000`,
    )
  })

  test('throws when the image has no asset or project', () => {
    expect(() => getSanityImageProps({asset: null}, project)).toThrow(/asset/)
    expect(() => getSanityImageProps({crop: {top: 0}}, project)).toThrow(/asset/)
    expect(() => getSanityImageProps({} as never, project)).toThrow(/asset/)
    expect(() => getSanityImageProps(null as never, project)).toThrow(/asset/)
  })
})

describe('queryParams', () => {
  test('merges CDN params into the URL and ignores sizing params', () => {
    const props = getSanityImageProps(
      {asset: ref('params')},
      {...project, width: 400, queryParams: {blur: 50, sat: -100, w: 10, h: 10, rect: '0,0,1,1'}},
    )
    expect(paramsOf(props)).toMatchObject({blur: '50', sat: '-100', w: '400', h: '200'})
    expect(paramsOf(props).rect).toBeUndefined()
  })

  test('applies params to bare URLs', () => {
    expect(paramsOf(getSanityImageProps(cdnUrl('bare'), {queryParams: {q: 90}})).q).toBe('90')
  })

  test('forwards fit, crop mode and focal point to the builder', () => {
    const image = {asset: ref('forward', '2000x3000'), hotspot: {x: 0.5, y: 0.2}}
    const size = {...project, width: 800, height: 400}
    expect(paramsOf(getSanityImageProps(image, {...size, queryParams: {fit: 'max'}})).fit).toBe(
      'max',
    )
    expect(
      paramsOf(getSanityImageProps(image, {...size, queryParams: {crop: 'entropy'}})),
    ).toMatchObject({crop: 'entropy'})
    expect(
      paramsOf(getSanityImageProps(image, {...size, queryParams: {'fp-x': 0.1, 'fp-y': 0.9}})),
    ).toMatchObject({'fp-x': '0.1', 'fp-y': '0.9'})
  })

  test('rejects unknown fit and crop modes', () => {
    expect(() =>
      getSanityImageProps({asset: ref('bad')}, {...project, queryParams: {fit: 'nope'}}),
    ).toThrow(/queryParams.fit/)
    expect(() =>
      getSanityImageProps({asset: ref('bad')}, {...project, queryParams: {crop: 'nope'}}),
    ).toThrow(/queryParams.crop/)
  })
})

describe('hotspot object-position', () => {
  const image = {
    asset: ref('spot', '2000x3000'),
    crop: {top: 0.1, bottom: 0.1, left: 0.1, right: 0.1},
    hotspot: {x: 0.3, y: 0.8},
  }

  test('defaults object-position to the hotspot inside the Studio crop', () => {
    expect(getSanityImageProps(image, project).style).toBe('object-position:25% 87.5%')
    expect(getSanityImageProps(image, {...project, fit: 'cover'}).style).toBe(
      'object-position:25% 87.5%',
    )
  })

  test('follows flips and rotations from queryParams', () => {
    expect(getSanityImageProps(image, {...project, queryParams: {flip: 'h'}}).style).toBe(
      'object-position:75% 87.5%',
    )
    expect(getSanityImageProps(image, {...project, queryParams: {or: 90}}).style).toBe(
      'object-position:12.5% 25%',
    )
  })

  test('is left out for fits that do not crop and when a position is given', () => {
    for (const fit of ['contain', 'scale-down', 'fill']) {
      expect(getSanityImageProps(image, {...project, fit}).style).toBeUndefined()
    }
    expect(getSanityImageProps(image, {...project, position: 'top'}).style).toBeUndefined()
    expect(
      getSanityImageProps(image, {...project, style: 'object-position: left; color: red'}).style,
    ).toBe('object-position: left; color: red')
    expect(getSanityImageProps(image, {...project, style: {objectPosition: 'left'}}).style).toEqual(
      {objectPosition: 'left'},
    )
  })

  test('keeps the caller style after the hotspot position', () => {
    expect(
      getSanityImageProps(image, {...project, style: {'borderRadius': '4px', '--tint': 'red'}})
        .style,
    ).toBe('object-position:25% 87.5%;border-radius:4px;--tint:red')
  })

  test('is left out when the image has no hotspot', () => {
    expect(getSanityImageProps({asset: ref('nospot')}, project).style).toBeUndefined()
  })
})

describe('placeholder', () => {
  const image = {asset: {...ref('lqip'), metadata: {lqip}}}

  test('blur paints the lqip from the image object behind the image', () => {
    const {style} = getSanityImageProps(image, {...project, placeholder: 'blur'})
    expect(style).toContain('background-image:url("data:image/svg+xml;charset=utf-8,')
    expect(style).toContain(`href='${lqip}'`)
    expect(style).toContain("viewBox='0 0 2000 1000'")
    expect(style).toContain('background-size:cover')
    expect(style).toContain('background-position:50% 50%')
  })

  test('blur reads the lqip of an asset document', () => {
    const assetDocument = {_id: 'image-doc-2000x1000-jpg', url: cdnUrl('doc'), metadata: {lqip}}
    const {style} = getSanityImageProps(assetDocument, {placeholder: 'blur'})
    expect(style).toContain(`href='${lqip}'`)
  })

  test('an explicit blurDataURL wins, and the lqip is unused without placeholder', () => {
    const blurDataURL = 'data:image/png;base64,iVBORw0KGgo'
    expect(
      getSanityImageProps(image, {...project, placeholder: 'blur', blurDataURL}).style,
    ).toContain(`href='${blurDataURL}'`)
    expect(getSanityImageProps(image, project).style).toBeUndefined()
    expect(
      getSanityImageProps({asset: ref('nolqip')}, {...project, placeholder: 'blur'}).style,
    ).toBeUndefined()
  })

  test('follows the fit and the hotspot', () => {
    const spotted = {...image, hotspot: {x: 0.25, y: 0.5}}
    const {style} = getSanityImageProps(spotted, {...project, placeholder: 'blur'})
    expect(style).toMatch(/^object-position:25% 50%;/)
    expect(style).toContain('background-position:25% 50%')
    expect(
      getSanityImageProps(image, {...project, placeholder: 'blur', fit: 'contain'}).style,
    ).toContain('background-size:contain')
    expect(
      getSanityImageProps(image, {...project, placeholder: 'blur', fit: 'fill'}).style,
    ).toContain('background-size:100% 100%')
  })
})
