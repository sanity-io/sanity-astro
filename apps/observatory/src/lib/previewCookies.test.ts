import {describe, expect, test} from 'vitest'

import {applySetCookies, previewCookieHeaders} from './previewCookies'

const EXPIRED = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'

describe('previewCookieHeaders', () => {
  test('writes an unpartitioned copy a top-level visit can read', () => {
    const [plain, partitioned] = previewCookieHeaders('sanity-preview-perspective', 'rABC,drafts')

    expect(plain).toBe(
      'sanity-preview-perspective=rABC%2Cdrafts; Path=/; HttpOnly; Secure; SameSite=None',
    )
    expect(partitioned).toBe(`${plain}; Partitioned`)
  })

  test('expires the partitioned copy and the unpartitioned copy together', () => {
    const [plain, partitioned] = previewCookieHeaders('zenith_preview', undefined)

    expect(plain).toBe(`zenith_preview=; Path=/; ${EXPIRED}; HttpOnly; Secure; SameSite=None`)
    expect(partitioned).toBe(`${plain}; Partitioned`)
  })
})

describe('applySetCookies', () => {
  test('keeps both copies on the response', () => {
    const response = applySetCookies(
      new Response(null, {status: 204}),
      previewCookieHeaders('zenith_preview', '1.sig'),
    )

    const headers = response.headers.getSetCookie()
    expect(headers).toHaveLength(2)
    expect(headers[0]).not.toContain('Partitioned')
    expect(headers[1]).toBe(`${headers[0]}; Partitioned`)
  })
})
