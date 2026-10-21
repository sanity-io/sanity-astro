import type {APIRoute} from 'astro'

import {disablePreview} from '../../../lib/preview'

export const GET: APIRoute = ({cookies, redirect, url}) => {
  disablePreview(cookies)

  // Only same-origin paths: anything else would be an open redirect.
  // Reject `//…` and `/\…` (browsers normalize `\` to `/`, turning the
  // latter into a protocol-relative URL).
  const target = url.searchParams.get('redirect')
  const safeTarget =
    target !== null &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.includes('\\')
      ? target
      : '/'

  return redirect(safeTarget, 307)
}
