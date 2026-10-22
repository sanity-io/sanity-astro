import {expect, test} from 'vitest'

import {parseSyncTags} from './syncTags'

test('keeps valid sync tags and drops duplicates', () => {
  expect(parseSyncTags({tags: ['s1:WHrX/A', 's1:abc', 's1:abc']})).toEqual(['s1:WHrX/A', 's1:abc'])
})

test('rejects tags that are not content sync tags', () => {
  expect(parseSyncTags({tags: ['sanity', '', 's1:', 's2:abc', 'S1:abc', 42, null]})).toEqual([])
})

test.each([undefined, null, 'tags', [], {}, {tags: 's1:abc'}])('ignores body %j', (body) => {
  expect(parseSyncTags(body)).toEqual([])
})

test('caps the number of tags per request', () => {
  const tags = Array.from({length: 100}, (_, i) => `s1:tag${i}`)
  expect(parseSyncTags({tags})).toHaveLength(64)
})
