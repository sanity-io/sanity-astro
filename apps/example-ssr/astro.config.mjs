import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '3do82whm',
      dataset: 'next',
      // If you are doing static builds you may want opt out of the CDN
      useCdn: true,
      studioBasePath: '/admin',
    }),
    react(),
  ],
  output: 'server',
  adapter: vercel({
    edgeMiddleware: true,
  }),
})
