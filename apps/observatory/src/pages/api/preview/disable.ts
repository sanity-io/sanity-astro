import type {APIRoute} from 'astro'

import {disablePreview} from '../../../lib/preview'
import {parseEdition} from '../../../lib/routing'

export const GET: APIRoute = ({cookies, redirect, url}) => {
  disablePreview(cookies)

  // Only same-origin paths: anything else would be an open redirect. The
  // second character must not be `/` or `\` — browsers normalize `/\` to
  // `//` and treat it as a protocol-relative URL.
  const target = url.searchParams.get('redirect')
  const safeTarget =
    target !== null && target.startsWith('/') && target[1] !== '/' && target[1] !== '\\'
      ? target
      : '/'

  const {pathname, search} = new URL(safeTarget, url)
  const edition = parseEdition(pathname)
  return redirect(`${edition.kind === 'preview' ? edition.path : pathname}${search}`, 307)
}
