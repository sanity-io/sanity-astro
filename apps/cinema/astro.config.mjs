import react from '@astrojs/react'
import sanity from '@sanity/astro'
import tailwindcss from '@tailwindcss/vite'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '4j2qnyob',
      dataset: 'production',
      useCdn: true,
      apiVersion: '2025-01-01',
      studioBasePath: '/admin',
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
