import sanity from '@sanity/astro'
import {createRequire} from 'node:module'
import {defineConfig} from 'astro/config'
import react from '@astrojs/react'

const require = createRequire(import.meta.url)
const sanityPackageRoot = require.resolve('sanity/package.json').replace(/\/package\.json$/, '')

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '3do82whm',
      dataset: 'next',
      // If you are doing static builds you may want opt out of the CDN
      useCdn: false,
      studioBasePath: '/admin',
      studioRouterHistory: 'hash',
      stega: {
        studioUrl: '/admin#',
      },
      logClientRequests: 'always',
    }),
    react(),
  ],
  vite: {
    resolve: {
      alias: [
        {
          // Only alias the root `sanity` entry so subpaths like `sanity/structure` still resolve.
          find: /^sanity$/,
          replacement: sanityPackageRoot,
        },
      ],
      dedupe: ['sanity', 'react', 'react-dom'],
    },
    ssr: {
      // See: https://github.com/withastro/astro/issues/9192#issuecomment-1834192321
      external: ['prismjs'],
    },
  },
})
