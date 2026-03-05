export function normalizeStudioBasePath(studioBasePath?: string): string | undefined {
  const normalized = studioBasePath?.replace(/^\/+|\/+$/g, '')
  return normalized ? `/${normalized}` : undefined
}

export function studioRoutePattern(
  studioBasePath: string | undefined,
  studioRouterHistory: 'browser' | 'hash',
): string | undefined {
  const normalized = normalizeStudioBasePath(studioBasePath)
  if (!normalized) {
    return undefined
  }

  return studioRouterHistory === 'hash' ? normalized : `${normalized}/[...params]`
}
