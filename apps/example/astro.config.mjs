import { sanityIntegration } from "@sanity/astro";
import { defineConfig } from "astro/config";
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanityIntegration({
      projectId: "3do82whm",
      dataset: "next",
      // If you are doing static builds you may want opt out of the CDN
      useCdn: false,
      studioBasePath: "/admin",
    }),
    react()
  ],
  output: 'hybrid',
  adapter: vercel(),
});
