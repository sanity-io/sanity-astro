import {defineConfig} from 'astro/config'

import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity from '@sanity/astro'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '4j2qnyob',
      dataset: 'production',
      useCdn: true,
      studioBasePath: '/admin',
      studioRouterHistory: 'hash',
      visualEditing: 'draftMode',
      stega: {
        studioUrl: {
          baseUrl: '/admin',
          workspace: 'my-workspace',
        },
      },
    }),
    react(),
  ],
  output: 'static',
  adapter: vercel(),
})
