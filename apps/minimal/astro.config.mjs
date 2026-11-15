import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

const visualEditingEnabled = process.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: process.env.PUBLIC_SANITY_PROJECT_ID ?? '4j2qnyob',
      dataset: process.env.PUBLIC_SANITY_DATASET ?? 'production',
      useCdn: true,
      apiVersion: '2025-01-01',
      injectTypes: true,
      experimental_live: {
        schema: './schema.json',
        loaders: {
          movie: {
            type: 'movie',
            projection: 'title, "slug": slug.current, releaseDate, "poster": poster.asset->url',
            orderBy: ['releaseDate', 'desc'],
          },
        },
      },
      ...(visualEditingEnabled && {
        stega: {studioUrl: process.env.PUBLIC_SANITY_STUDIO_URL ?? 'http://localhost:3333'},
      }),
    }),
  ],
})
