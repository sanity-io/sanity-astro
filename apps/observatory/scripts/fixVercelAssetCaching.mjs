/**
 * The Vercel adapter emits its immutable-caching header route for built
 * assets after the `handle: filesystem` marker (which `@vercel/routing-utils`
 * always prepends), so the header never applies and every static asset is
 * served with `max-age=0, must-revalidate`. Hoisting the route in front of
 * the filesystem phase restores `public, max-age=31536000, immutable` for
 * hashed assets, fonts included.
 */
import {readFile, writeFile} from 'node:fs/promises'

const configUrl = new URL('../.vercel/output/config.json', import.meta.url)
const config = JSON.parse(await readFile(configUrl, 'utf8'))

const routes = config.routes ?? []
const filesystemIndex = routes.findIndex((route) => route.handle === 'filesystem')
const headersIndex = routes.findIndex(
  (route) => route.continue === true && route.headers?.['cache-control']?.includes('immutable'),
)

if (filesystemIndex !== -1 && headersIndex > filesystemIndex) {
  const [headersRoute] = routes.splice(headersIndex, 1)
  routes.splice(filesystemIndex, 0, headersRoute)
  await writeFile(configUrl, JSON.stringify(config))
}
