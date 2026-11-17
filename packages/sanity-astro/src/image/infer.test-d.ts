import type {StegaBranded} from '@sanity/client/stega'
import {isImageWithAsset} from '@sanity/image-url'
import {describe, expectTypeOf, test} from 'vitest'

import {getSanityImageProps} from './image-props'
import type {ImageSource} from './image-source'
import type {InferImageValue, InferStrictImageValue} from './infer'

type ImageField = {
  asset?: {
    _ref: string
    _type: 'reference'
    _weak?: boolean
  }
  media?: unknown
  hotspot?: {_type: 'sanity.imageHotspot'; x?: number; y?: number; height?: number; width?: number}
  crop?: {_type: 'sanity.imageCrop'; top?: number; bottom?: number; left?: number; right?: number}
  alt?: string
  _type: 'image'
}

type PostQueryResult = {
  _id: string
  title: string | null
  cover: {
    crop: NonNullable<ImageField['crop']> | null
    hotspot: NonNullable<ImageField['hotspot']> | null
    asset: {url: string | null; metadata: {lqip: string | null} | null} | null
  } | null
  body: Array<{_key: string; _type: 'block'} | ({_key: string} & ImageField)> | null
  attachment: {_type: 'file'; asset: {_type: 'sanity.fileAsset'; url: string | null} | null} | null
}

describe('InferImageValue', () => {
  test('collects every image shape in a query result and skips files', () => {
    type Value = InferImageValue<PostQueryResult>
    expectTypeOf<NonNullable<PostQueryResult['cover']>>().toExtend<Value>()
    expectTypeOf<{_key: string} & ImageField>().toExtend<Value>()
    expectTypeOf<Extract<Value, {_type: 'file'}>>().toBeNever()
  })

  test('accepts stega-branded query results', () => {
    type Value = InferImageValue<PostQueryResult>
    expectTypeOf<NonNullable<StegaBranded<PostQueryResult>['cover']>>().toExtend<Value>()
  })

  test('inferred values are accepted as the image source', () => {
    expectTypeOf<InferImageValue<PostQueryResult>>().toExtend<ImageSource>()
    expectTypeOf<InferStrictImageValue<PostQueryResult>>().toExtend<ImageSource>()
  })

  test('isImageWithAsset narrows to the strict variants', () => {
    const value = {} as InferImageValue<PostQueryResult> | null
    if (isImageWithAsset(value)) {
      expectTypeOf(value).toExtend<InferStrictImageValue<PostQueryResult>>()
      getSanityImageProps(value)
    }
  })
})
