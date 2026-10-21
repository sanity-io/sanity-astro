import type {APIRoute} from 'astro'

export const GET: APIRoute = ({site}) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    // Draft preview needs a session cookie; audience editions declare the
    // unprefixed page as canonical, so crawlers may still follow them.
    'Disallow: /preview',
    '',
    `Sitemap: ${new URL('/sitemap.xml', site)}`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {'content-type': 'text/plain; charset=utf-8'},
  })
}
