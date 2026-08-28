import type {APIRoute} from 'astro'

const ROUTES = ['/', '/visit']

export const GET: APIRoute = ({site}) => {
  const urls = ROUTES.map((route) => `  <url><loc>${new URL(route, site)}</loc></url>`).join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

  return new Response(body, {
    headers: {'content-type': 'application/xml; charset=utf-8'},
  })
}
