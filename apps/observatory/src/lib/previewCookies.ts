const EXPIRED = new Date(0)

/**
 * Serializes one preview cookie. `Partitioned` is appended last so the CHIPS
 * copy is the unpartitioned header plus that attribute: browsers that ignore
 * `Partitioned` keep a normal `SameSite=None` cookie, and browsers that
 * implement CHIPS store the two headers in different jars.
 */
function serializePreviewCookie(
  name: string,
  value: string,
  partitioned: boolean,
  expires: Date | undefined,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/']
  if (expires !== undefined) parts.push(`Expires=${expires.toUTCString()}`)
  parts.push('HttpOnly', 'Secure', 'SameSite=None')
  if (partitioned) parts.push('Partitioned')
  return parts.join('; ')
}

/**
 * Writes the same cookie twice. Presentation's iframe is a third-party
 * context on the studio origin, so it only receives the `Partitioned` copy.
 * A top-level visit to this origin does not share that CHIPS jar, so the
 * unpartitioned copy is what `/preview` and the exit link can read there.
 * Deletion sends both headers: a `Set-Cookie` that omits `Partitioned` does
 * not expire the partitioned cookie.
 */
export function previewCookieHeaders(
  name: string,
  value: string | undefined,
): readonly [string, string] {
  const expires = value === undefined ? EXPIRED : undefined
  const stored = value ?? ''
  return [
    serializePreviewCookie(name, stored, false, expires),
    serializePreviewCookie(name, stored, true, expires),
  ]
}

/** Appends every `Set-Cookie` header. Astro keeps one outgoing cookie per name, so the pair cannot go through `cookies.set`. */
export function applySetCookies(response: Response, setCookies: readonly string[]): Response {
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie)
  return response
}
