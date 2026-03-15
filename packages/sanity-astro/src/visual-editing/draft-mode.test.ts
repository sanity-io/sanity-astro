import {describe, expect, it} from 'vitest'
import {
  DEFAULT_DRAFT_MODE_COOKIE_NAME,
  DEFAULT_PREVIEW_MODE_DISABLE_PATH,
  DEFAULT_PREVIEW_MODE_ENABLE_PATH,
  getDraftModeCookieOptions,
  isDraftMode,
  normalizePreviewModePath,
  resolvePreviewModeConfig,
} from './draft-mode'

describe('draft mode helpers', () => {
  it('resolves defaults when preview mode is enabled', () => {
    expect(resolvePreviewModeConfig(true)).toEqual({
      enable: DEFAULT_PREVIEW_MODE_ENABLE_PATH,
      disable: DEFAULT_PREVIEW_MODE_DISABLE_PATH,
      cookie: DEFAULT_DRAFT_MODE_COOKIE_NAME,
    })
  })

  it('normalizes relative paths and custom cookie name', () => {
    expect(
      resolvePreviewModeConfig({
        enable: 'preview/enable',
        disable: 'preview/disable',
        cookie: 'my-cookie',
      }),
    ).toEqual({
      enable: '/preview/enable',
      disable: '/preview/disable',
      cookie: 'my-cookie',
    })
  })

  it('returns false when preview mode is disabled', () => {
    expect(resolvePreviewModeConfig(false)).toBe(false)
  })

  it('checks draft mode cookie with and without expected value', () => {
    const cookies = {
      get: (name: string) => (name === 'cookie-a' ? {value: 'cookie-value'} : undefined),
    }

    expect(isDraftMode(cookies, {cookieName: 'cookie-a'})).toBe(true)
    expect(isDraftMode(cookies, {cookieName: 'cookie-a', cookieValue: 'cookie-value'})).toBe(true)
    expect(isDraftMode(cookies, {cookieName: 'cookie-a', cookieValue: 'wrong'})).toBe(false)
    expect(isDraftMode(cookies, {cookieName: 'missing'})).toBe(false)
  })

  it('builds cookie options for production and development', () => {
    expect(getDraftModeCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
    })
    expect(getDraftModeCookieOptions(false)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    })
  })

  it('normalizes empty paths to fallback', () => {
    expect(normalizePreviewModePath('', '/fallback')).toBe('/fallback')
    expect(normalizePreviewModePath('path', '/fallback')).toBe('/path')
  })
})
