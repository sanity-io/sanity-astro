import sanityIntegration from '@sanity/astro';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanityIntegration({
      projectId: '3do82whm',
      dataset: "next",
    })
  ]
});
