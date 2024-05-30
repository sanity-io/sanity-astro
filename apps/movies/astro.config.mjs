import {defineConfig} from 'astro/config'

import react from '@astrojs/react'
import vercel from '@astrojs/vercel/serverless'
import sanity from '@sanity/astro'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '4j2qnyob',
      dataset: 'production',
      useCdn: true,
      studioBasePath: '/admin',
      stega: {
        studioUrl: '/admin',
      },
    }),
    react(),
  ],
  output: 'server',
  adapter: vercel(),
})
