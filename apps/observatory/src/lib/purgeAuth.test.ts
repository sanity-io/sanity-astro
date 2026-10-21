import {expect, test} from 'vitest'

import {purgeRejectionStatus} from './purgeAuth'

const SECRET = 'test-secret'

test('refuses every request when the secret is unset', () => {
  expect(purgeRejectionStatus(undefined, null)).toBe(503)
  expect(purgeRejectionStatus(undefined, `Bearer ${SECRET}`)).toBe(503)
  expect(purgeRejectionStatus('', `Bearer ${SECRET}`)).toBe(503)
})

test('accepts the matching bearer token', () => {
  expect(purgeRejectionStatus(SECRET, `Bearer ${SECRET}`)).toBeNull()
})

test.each([null, '', 'Bearer other-secret', SECRET, `bearer ${SECRET}`, `Bearer ${SECRET} `])(
  'rejects authorization %j when a secret is configured',
  (authorization) => {
    expect(purgeRejectionStatus(SECRET, authorization)).toBe(401)
  },
)
