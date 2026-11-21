import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity, {sanityImageService} from '@sanity/astro'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  image: {
    service: sanityImageService(),
  },
  integrations: [
    sanity({
      projectId: 'gvzky3k5',// '3do82whm',
      dataset: 'production', // 'next',
      // If you are doing static builds you may want opt out of the CDN
      useCdn: false,
      studioBasePath: '/admin',
      // left for reference, out as breaks blue click to visual edit,
      // is now handled automatically between browser and hash
      // studioRouterHistory: 'hash',
      stega: {
        studioUrl: '/admin',
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
