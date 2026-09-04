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
        studioUrl: '/admin',
      },
      live: {
        schema: './sanity.config.ts',
        loaders: {
          movie: {
            type: 'movie',
            projection: 'title, releaseDate, poster, "slug": slug.current',
            orderBy: ['title', 'asc'],
            entryBy: 'id',
          },
        },
      },
    }),
    react(),
  ],
  output: 'server',
  adapter: vercel(),
})
