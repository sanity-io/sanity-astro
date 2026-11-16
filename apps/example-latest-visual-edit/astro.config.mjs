import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: 'gvzky3k5',// '3do82whm',
      dataset: 'production', // 'next',
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
  output: 'server',
  adapter: vercel({
    edgeMiddleware: false,
  }),
  vite: {
    ssr: {
      // See: https://github.com/withastro/astro/issues/9192#issuecomment-1834192321
      external: ['prismjs'],
    },
  },
})
