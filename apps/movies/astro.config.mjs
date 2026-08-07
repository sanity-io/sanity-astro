import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '4j2qnyob',
      dataset: 'production',
      useCdn: true,
      studioBasePath: '/admin',
      studioRouterHistory: 'hash',
      logClientRequests: 'dev',
      stega: {
        studioUrl: {
          baseUrl: '/admin',
          workspace: 'my-workspace',
        },
      },
    }),
    react(),
  ],
  output: 'server',
  adapter: vercel(),
})
