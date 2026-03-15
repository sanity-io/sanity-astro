export const DEFAULT_PREVIEW_MODE_ENABLE_PATH = '/preview/enable'
export const DEFAULT_PREVIEW_MODE_DISABLE_PATH = '/preview/disable'
export const DEFAULT_DRAFT_MODE_COOKIE_NAME = '__sanity_preview'

type CookieValue = {value?: string} | string | undefined

type CookieStoreLike = {
  get: (name: string) => CookieValue
}

export type PreviewModeConfig = {
  enable: string
  disable: string
  cookie: string
}

export function normalizePreviewModePath(path: string | undefined, fallbackPath: string): string {
  const value = (path ?? fallbackPath).trim()
  if (!value) {
    return fallbackPath
  }
  return value.startsWith('/') ? value : `/${value}`
}

export function resolvePreviewModeConfig(
  previewMode: boolean | {enable?: string; disable?: string; cookie?: string} | undefined,
): PreviewModeConfig | false {
  if (previewMode === false) {
    return false
  }

  const input = typeof previewMode === 'object' ? previewMode : {}
  return {
    enable: normalizePreviewModePath(input.enable, DEFAULT_PREVIEW_MODE_ENABLE_PATH),
    disable: normalizePreviewModePath(input.disable, DEFAULT_PREVIEW_MODE_DISABLE_PATH),
    cookie: input.cookie?.trim() || DEFAULT_DRAFT_MODE_COOKIE_NAME,
  }
}

export function readCookieValue(cookies: CookieStoreLike | undefined, name: string): string | undefined {
  const cookie = cookies?.get(name)
  if (typeof cookie === 'string') {
    return cookie
  }
  return cookie?.value
}

export function isDraftMode(
  cookies: CookieStoreLike | undefined,
  options: {cookieName?: string; cookieValue?: string} = {},
): boolean {
  const cookieName = options.cookieName || DEFAULT_DRAFT_MODE_COOKIE_NAME
  const cookieValue = readCookieValue(cookies, cookieName)
  if (!cookieValue) {
    return false
  }

  if (options.cookieValue) {
    return cookieValue === options.cookieValue
  }

  return true
}

export function getDraftModeCookieOptions(isProduction: boolean): {
  httpOnly: true
  sameSite: 'lax' | 'none'
  secure: boolean
  path: '/'
} {
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  }
}
